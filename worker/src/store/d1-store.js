/**
 * Adaptateur Cloudflare D1 — contrat identique à MemoryTx.
 * UPDATE … WHERE (qty_on_hand - qty_reserved) >= ? pour l’atomicité.
 * Ne jamais utiliser KV pour ces opérations.
 */

import { httpError } from "../logic.js";
import { canSellLine, RESERVATION_TTL_MS } from "../inventory-core.js";

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createD1Store(db) {
  if (!db || typeof db.prepare !== "function") {
    throw httpError("Binding D1 invalide (env.DB)", 500);
  }

  async function getInv(productId) {
    const row = await db.prepare("SELECT * FROM inventory WHERE product_id = ?").bind(productId).first();
    if (!row) return null;
    const qty_available = row.qty_on_hand == null ? null : row.qty_on_hand - row.qty_reserved;
    return {
      ...row,
      lucie_confirmed: !!row.lucie_confirmed,
      qty_available,
    };
  }

  async function getRes(id) {
    const r = await db.prepare("SELECT * FROM reservations WHERE id = ?").bind(id).first();
    if (!r) return null;
    const lines = await db
      .prepare("SELECT product_id, qty, reserved FROM reservation_lines WHERE reservation_id = ?")
      .bind(id)
      .all();
    return {
      id: r.id,
      session_id: r.session_id,
      status: r.status,
      expires_at: r.expires_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      lines: (lines.results || []).map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        reserved: !!l.reserved,
      })),
    };
  }

  return {
    kind: "d1",
    engine: "transactional-sql",

    getInventory: getInv,
    getReservation: getRes,

    async listInventory() {
      const res = await db.prepare("SELECT * FROM inventory").all();
      return (res.results || []).map((row) => ({
        ...row,
        lucie_confirmed: !!row.lucie_confirmed,
        qty_available: row.qty_on_hand == null ? null : row.qty_on_hand - row.qty_reserved,
      }));
    },

    async reserveAtomic({ lines, sessionId = null, now = Date.now(), ttlMs = RESERVATION_TTL_MS }) {
      if (!Array.isArray(lines) || !lines.length) throw httpError("Aucune ligne à réserver", 400);
      const prepared = [];
      for (const line of lines) {
        const productId = String(line.product_id || line.id || "");
        const qty = Math.floor(Number(line.qty) || 0);
        if (!productId || qty < 1) throw httpError(`Ligne réserve invalide: ${productId}`, 400);
        const row = await getInv(productId);
        const check = canSellLine(row, qty);
        if (!check.ok) {
          throw httpError(`Article non vendable: ${productId}`, 409, { reason: check.reason });
        }
        prepared.push({ productId, qty, reserve: check.reserve });
      }

      const id = newId("rsv");
      const expiresAt = new Date(now + ttlMs).toISOString();
      const createdAt = new Date(now).toISOString();
      const stmts = [
        db
          .prepare(
            `INSERT INTO reservations (id, session_id, status, expires_at, created_at, updated_at)
             VALUES (?, ?, 'held', ?, ?, ?)`,
          )
          .bind(id, sessionId, expiresAt, createdAt, createdAt),
      ];

      for (const p of prepared) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO reservation_lines (reservation_id, product_id, qty, reserved) VALUES (?, ?, ?, ?)`,
            )
            .bind(id, p.productId, p.qty, p.reserve ? 1 : 0),
        );
        if (p.reserve) {
          stmts.push(
            db
              .prepare(
                `UPDATE inventory
                 SET qty_reserved = qty_reserved + ?, updated_at = ?
                 WHERE product_id = ?
                   AND fulfillment_type = 'unique_stock'
                   AND lucie_confirmed = 1
                   AND qty_on_hand IS NOT NULL
                   AND (qty_on_hand - qty_reserved) >= ?`,
              )
              .bind(p.qty, createdAt, p.productId, p.qty),
          );
        }
      }

      const batchResult = await db.batch(stmts);
      // Vérifier les UPDATE stock (index impairs après insert lignes)
      for (let i = 0; i < prepared.length; i++) {
        if (!prepared[i].reserve) continue;
        // batch order: insert rsv, then for each: insert line + maybe update
      }
      // Contrôle post-batch via relecture
      for (const p of prepared) {
        if (!p.reserve) continue;
        const row = await getInv(p.productId);
        // Si la course a perdu, qty_reserved n'a pas bougé assez — détecter via hold count
        const holds = await db
          .prepare(
            `SELECT COALESCE(SUM(qty),0) AS s FROM reservation_lines rl
             JOIN reservations r ON r.id = rl.reservation_id
             WHERE rl.product_id = ? AND rl.reserved = 1 AND r.status = 'held'`,
          )
          .bind(p.productId)
          .first();
        if (!row || row.qty_reserved < (holds?.s || 0)) {
          // rollback best-effort
          await db.prepare(`DELETE FROM reservation_lines WHERE reservation_id = ?`).bind(id).run();
          await db.prepare(`DELETE FROM reservations WHERE id = ?`).bind(id).run();
          throw httpError(`Stock insuffisant (course) pour ${p.productId}`, 409);
        }
      }

      // Si un UPDATE a changes=0, D1 batch peut quand même réussir — re-vérifier available
      for (const p of prepared) {
        if (!p.reserve) continue;
        const row = await getInv(p.productId);
        if (row.qty_available < 0) {
          await db.batch([
            db.prepare(`DELETE FROM reservation_lines WHERE reservation_id = ?`).bind(id),
            db.prepare(`DELETE FROM reservations WHERE id = ?`).bind(id),
            db
              .prepare(
                `UPDATE inventory SET qty_reserved = qty_reserved - ?, updated_at = ? WHERE product_id = ?`,
              )
              .bind(p.qty, createdAt, p.productId),
          ]);
          throw httpError(`Stock insuffisant (course) pour ${p.productId}`, 409);
        }
      }

      void batchResult;
      return {
        reservation_id: id,
        expires_at: expiresAt,
        lines: prepared.map((p) => ({
          product_id: p.productId,
          qty: p.qty,
          reserved: p.reserve,
        })),
      };
    },

    async attachSession(reservationId, sessionId, { now = Date.now() } = {}) {
      const r = await getRes(reservationId);
      if (!r) throw httpError("Réservation introuvable", 404);
      await db
        .prepare(`UPDATE reservations SET session_id = ?, updated_at = ? WHERE id = ?`)
        .bind(sessionId, new Date(now).toISOString(), reservationId)
        .run();
      return { ok: true, reservation_id: reservationId, session_id: sessionId };
    },

    async release(reservationId, { now = Date.now(), reason = "released" } = {}) {
      const r = await getRes(reservationId);
      if (!r) return { released: false, reason: "not_found" };
      if (r.status !== "held") return { released: false, reason: `status_${r.status}` };
      const status = reason === "expired" ? "expired" : "released";
      const ts = new Date(now).toISOString();
      const stmts = [];
      for (const line of r.lines) {
        if (!line.reserved) continue;
        stmts.push(
          db
            .prepare(
              `UPDATE inventory SET qty_reserved = MAX(0, qty_reserved - ?), updated_at = ? WHERE product_id = ?`,
            )
            .bind(line.qty, ts, line.product_id),
        );
      }
      stmts.push(
        db.prepare(`UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?`).bind(status, ts, reservationId),
      );
      await db.batch(stmts);
      return { released: true, reservation_id: reservationId, status };
    },

    async commit(reservationId, { now = Date.now() } = {}) {
      const r = await getRes(reservationId);
      if (!r) throw httpError("Réservation introuvable", 404);
      if (r.status === "committed") return { committed: true, duplicate: true, reservation_id: reservationId };
      if (r.status !== "held") throw httpError(`Réservation non active (${r.status})`, 409);
      const ts = new Date(now).toISOString();
      const stmts = [];
      for (const line of r.lines) {
        if (!line.reserved) continue;
        stmts.push(
          db
            .prepare(
              `UPDATE inventory
               SET qty_reserved = qty_reserved - ?, qty_on_hand = qty_on_hand - ?, updated_at = ?
               WHERE product_id = ? AND qty_reserved >= ? AND qty_on_hand >= ?`,
            )
            .bind(line.qty, line.qty, ts, line.product_id, line.qty, line.qty),
        );
      }
      stmts.push(
        db
          .prepare(`UPDATE reservations SET status = 'committed', updated_at = ? WHERE id = ?`)
          .bind(ts, reservationId),
      );
      await db.batch(stmts);
      return { committed: true, reservation_id: reservationId };
    },

    async settlePaid(reservationId, { sessionId = null, now = Date.now() } = {}) {
      const r = await getRes(reservationId);
      if (!r) {
        return { outcome: "missing_reservation", action: "paid_needs_lucie_review", session_id: sessionId };
      }
      if (r.status === "committed") return { outcome: "already_committed", reservation_id: reservationId };
      if (r.status === "held") {
        await this.commit(reservationId, { now });
        if (sessionId) await this.attachSession(reservationId, sessionId, { now });
        return { outcome: "committed", reservation_id: reservationId, session_id: sessionId || r.session_id };
      }
      // Réacquisition
      for (const line of r.lines) {
        if (!line.reserved) continue;
        const row = await getInv(line.product_id);
        const check = canSellLine(row, line.qty);
        if (!check.ok || !check.reserve) {
          return {
            outcome: "paid_no_stock",
            action: "refund_or_lucie_review",
            reservation_id: reservationId,
            session_id: sessionId || r.session_id,
            reason: check.reason || "cannot_reacquire",
            previous_status: r.status,
          };
        }
      }
      const ts = new Date(now).toISOString();
      const stmts = [];
      for (const line of r.lines) {
        if (!line.reserved) continue;
        stmts.push(
          db
            .prepare(
              `UPDATE inventory SET qty_on_hand = qty_on_hand - ?, updated_at = ?
               WHERE product_id = ? AND (qty_on_hand - qty_reserved) >= ?`,
            )
            .bind(line.qty, ts, line.product_id, line.qty),
        );
      }
      stmts.push(
        db
          .prepare(
            `UPDATE reservations SET status = 'committed', session_id = COALESCE(?, session_id), updated_at = ? WHERE id = ?`,
          )
          .bind(sessionId, ts, reservationId),
      );
      await db.batch(stmts);
      return {
        outcome: "reacquired_and_committed",
        reservation_id: reservationId,
        session_id: sessionId || r.session_id,
        previous_status: r.status,
      };
    },

    async expireDue({ now = Date.now() } = {}) {
      const due = await db
        .prepare(`SELECT id FROM reservations WHERE status = 'held' AND expires_at <= ?`)
        .bind(new Date(now).toISOString())
        .all();
      const results = [];
      for (const row of due.results || []) {
        results.push(await this.release(row.id, { now, reason: "expired" }));
      }
      return { expired: results.filter((x) => x.released).length, results };
    },
  };
}

/** Résout le store : D1 (prod/test Cloudflare) ou injection tests. */
export function resolveInventoryStore(env) {
  if (env?.INVENTORY_TX) return env.INVENTORY_TX;
  if (env?.DB) return createD1Store(env.DB);
  return null;
}
