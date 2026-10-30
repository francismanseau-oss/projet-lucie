/**
 * Store transactionnel en mémoire — même contrat que D1 (tests / local).
 * Mutex = une transaction à la fois (anti-survente concurrente).
 */

import { httpError } from "../logic.js";
import { canSellLine, FULFILLMENT, RESERVATION_TTL_MS } from "../inventory-core.js";

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function available(row) {
  if (!row || row.qty_on_hand == null) return null;
  return row.qty_on_hand - (row.qty_reserved || 0);
}

export function createMemoryTxStore(seedInventoryItems = []) {
  const inventory = new Map();
  const reservations = new Map();
  let chain = Promise.resolve();

  for (const row of seedInventoryItems) {
    inventory.set(row.product_id, {
      product_id: row.product_id,
      name_fr: row.name_fr || row.product_id,
      category: row.category || "",
      fulfillment_type: row.fulfillment_type || FULFILLMENT.PENDING,
      qty_on_hand: row.qty_on_hand === undefined ? null : row.qty_on_hand,
      qty_reserved: row.qty_reserved || 0,
      lucie_confirmed: !!row.lucie_confirmed,
      notes_lucie: row.notes_lucie || "",
      updated_at: row.updated_at || null,
    });
  }

  async function withTx(fn) {
    const run = chain.then(() => fn());
    chain = run.catch(() => {});
    return run;
  }

  const store = {
    kind: "memory-tx",
    engine: "transactional",

    getInventory(productId) {
      const row = inventory.get(productId);
      return row ? { ...row, qty_available: available(row) } : null;
    },

    listInventory() {
      return [...inventory.values()].map((r) => ({ ...r, qty_available: available(r) }));
    },

    getReservation(id) {
      const r = reservations.get(id);
      return r ? structuredClone(r) : null;
    },

    async reserveAtomic({ lines, sessionId = null, now = Date.now(), ttlMs = RESERVATION_TTL_MS }) {
      return withTx(() => {
        if (!Array.isArray(lines) || !lines.length) throw httpError("Aucune ligne à réserver", 400);
        const prepared = [];
        for (const line of lines) {
          const productId = String(line.product_id || line.id || "");
          const qty = Math.floor(Number(line.qty) || 0);
          if (!productId || qty < 1) throw httpError(`Ligne réserve invalide: ${productId}`, 400);
          const row = inventory.get(productId);
          const check = canSellLine(row, qty);
          if (!check.ok) {
            throw httpError(
              check.reason === "insufficient"
                ? `Stock insuffisant pour ${productId}`
                : check.reason === "qty_not_set"
                  ? `Quantité non saisie par Lucie: ${productId}`
                  : check.reason === "pending_lucie"
                    ? `Article non classé / non confirmé: ${productId}`
                    : `Article non vendable: ${productId}`,
              409,
              { product_id: productId, reason: check.reason },
            );
          }
          prepared.push({ productId, qty, reserve: check.reserve, row });
        }
        for (const p of prepared) {
          if (!p.reserve) continue;
          const avail = available(p.row);
          if (avail == null || avail < p.qty) {
            throw httpError(`Stock insuffisant (course) pour ${p.productId}`, 409);
          }
          p.row.qty_reserved += p.qty;
          p.row.updated_at = new Date(now).toISOString();
        }
        const id = newId("rsv");
        const expiresAt = new Date(now + ttlMs).toISOString();
        const createdAt = new Date(now).toISOString();
        const reservation = {
          id,
          session_id: sessionId,
          status: "held",
          expires_at: expiresAt,
          created_at: createdAt,
          updated_at: createdAt,
          lines: prepared.map((p) => ({
            product_id: p.productId,
            qty: p.qty,
            reserved: p.reserve,
          })),
        };
        reservations.set(id, reservation);
        return { reservation_id: id, expires_at: expiresAt, lines: reservation.lines };
      });
    },

    async attachSession(reservationId, sessionId, { now = Date.now() } = {}) {
      return withTx(() => {
        const r = reservations.get(reservationId);
        if (!r) throw httpError("Réservation introuvable", 404);
        r.session_id = sessionId;
        r.updated_at = new Date(now).toISOString();
        return { ok: true, reservation_id: reservationId, session_id: sessionId };
      });
    },

    async release(reservationId, { now = Date.now(), reason = "released" } = {}) {
      return withTx(() => {
        const r = reservations.get(reservationId);
        if (!r) return { released: false, reason: "not_found" };
        if (r.status !== "held") return { released: false, reason: `status_${r.status}` };
        for (const line of r.lines) {
          if (!line.reserved) continue;
          const row = inventory.get(line.product_id);
          if (!row) continue;
          row.qty_reserved = Math.max(0, row.qty_reserved - line.qty);
          row.updated_at = new Date(now).toISOString();
        }
        r.status = reason === "expired" ? "expired" : "released";
        r.updated_at = new Date(now).toISOString();
        return { released: true, reservation_id: reservationId, status: r.status };
      });
    },

    async commit(reservationId, { now = Date.now() } = {}) {
      return withTx(() => {
        const r = reservations.get(reservationId);
        if (!r) throw httpError("Réservation introuvable", 404);
        if (r.status === "committed") {
          return { committed: true, duplicate: true, reservation_id: reservationId };
        }
        if (r.status !== "held") {
          throw httpError(`Réservation non active (${r.status})`, 409, { status: r.status });
        }
        for (const line of r.lines) {
          if (!line.reserved) continue;
          const row = inventory.get(line.product_id);
          if (!row || row.qty_on_hand == null) {
            throw httpError(`Stock manquant au commit: ${line.product_id}`, 500);
          }
          if (row.qty_reserved < line.qty || row.qty_on_hand < line.qty) {
            throw httpError(`Incohérence stock au commit: ${line.product_id}`, 500);
          }
          row.qty_reserved -= line.qty;
          row.qty_on_hand -= line.qty;
          row.updated_at = new Date(now).toISOString();
        }
        r.status = "committed";
        r.updated_at = new Date(now).toISOString();
        return { committed: true, reservation_id: reservationId };
      });
    },

    /**
     * Paiement validé : commit si held ; si expiré/libéré, réacquisition atomique ;
     * sinon paid_no_stock (aucune survente).
     */
    async settlePaid(reservationId, { sessionId = null, now = Date.now() } = {}) {
      return withTx(() => {
        const r = reservations.get(reservationId);
        if (!r) {
          return {
            outcome: "missing_reservation",
            action: "paid_needs_lucie_review",
            session_id: sessionId,
          };
        }
        if (r.status === "committed") {
          return { outcome: "already_committed", reservation_id: reservationId };
        }

        if (r.status === "held") {
          for (const line of r.lines) {
            if (!line.reserved) continue;
            const row = inventory.get(line.product_id);
            if (!row || row.qty_on_hand == null || row.qty_reserved < line.qty || row.qty_on_hand < line.qty) {
              return {
                outcome: "paid_no_stock",
                action: "refund_or_lucie_review",
                reservation_id: reservationId,
                session_id: sessionId || r.session_id,
                reason: "held_but_inconsistent",
              };
            }
            row.qty_reserved -= line.qty;
            row.qty_on_hand -= line.qty;
            row.updated_at = new Date(now).toISOString();
          }
          r.status = "committed";
          r.session_id = sessionId || r.session_id;
          r.updated_at = new Date(now).toISOString();
          return { outcome: "committed", reservation_id: reservationId, session_id: r.session_id };
        }

        // expired / released — tenter de reprendre le stock immédiatement (commit direct)
        const prevStatus = r.status;
        for (const line of r.lines) {
          if (!line.reserved) continue;
          const row = inventory.get(line.product_id);
          const check = canSellLine(row, line.qty);
          if (!check.ok || !check.reserve) {
            return {
              outcome: "paid_no_stock",
              action: "refund_or_lucie_review",
              reservation_id: reservationId,
              session_id: sessionId || r.session_id,
              reason: check.reason || "cannot_reacquire",
              previous_status: prevStatus,
            };
          }
        }
        for (const line of r.lines) {
          if (!line.reserved) continue;
          const row = inventory.get(line.product_id);
          // Décrément direct on_hand (pas de hold intermédiaire — tout-ou-rien déjà validé)
          row.qty_on_hand -= line.qty;
          row.updated_at = new Date(now).toISOString();
        }
        r.status = "committed";
        r.session_id = sessionId || r.session_id;
        r.settlement = "reacquired_after_" + prevStatus;
        r.updated_at = new Date(now).toISOString();
        return {
          outcome: "reacquired_and_committed",
          reservation_id: reservationId,
          session_id: r.session_id,
          previous_status: prevStatus,
        };
      });
    },

    async expireDue({ now = Date.now() } = {}) {
      const ids = [...reservations.entries()]
        .filter(([, r]) => r.status === "held" && new Date(r.expires_at).getTime() <= now)
        .map(([id]) => id);
      const results = [];
      for (const id of ids) {
        results.push(await store.release(id, { now, reason: "expired" }));
      }
      return { expired: results.filter((x) => x.released).length, results };
    },

    /** Compat tests anciens : withTx bas niveau */
    withTx(fn) {
      return withTx(() => fn({ inventory, reservations, available }));
    },
  };

  return store;
}
