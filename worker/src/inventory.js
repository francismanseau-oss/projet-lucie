/**
 * Façade stocks — délègue au store transactionnel (D1 ou MemoryTx).
 */

import { httpError } from "./logic.js";
import { canSellLine, FULFILLMENT, RESERVATION_TTL_MS } from "./inventory-core.js";

export { canSellLine, FULFILLMENT, RESERVATION_TTL_MS };
export { resolveInventoryStore } from "./store/d1-store.js";

export function assertNoFictionalQty(qty) {
  if (qty === null || qty === undefined || qty === "") return null;
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 0) throw httpError("Quantité inventaire invalide", 400);
  return n;
}

export function assertInventorySellable(store, lines) {
  for (const line of lines) {
    const id = line.product_id || line.id;
    const qty = Math.floor(Number(line.qty) || 0);
    const row = store.getInventory(id);
    // getInventory may be async on D1
    if (row && typeof row.then === "function") {
      throw httpError("assertInventorySellable sync: utiliser assertInventorySellableAsync", 500);
    }
    const check = canSellLine(row, qty);
    if (!check.ok) {
      throw httpError(
        check.reason === "insufficient"
          ? `Stock insuffisant: ${id}`
          : `Inventaire non prêt pour la vente: ${id} (${check.reason})`,
        409,
        { product_id: id, reason: check.reason },
      );
    }
  }
}

export async function assertInventorySellableAsync(store, lines) {
  for (const line of lines) {
    const id = line.product_id || line.id;
    const qty = Math.floor(Number(line.qty) || 0);
    const row = await store.getInventory(id);
    const check = canSellLine(row, qty);
    if (!check.ok) {
      throw httpError(
        check.reason === "insufficient"
          ? `Stock insuffisant: ${id}`
          : `Inventaire non prêt pour la vente: ${id} (${check.reason})`,
        409,
        { product_id: id, reason: check.reason },
      );
    }
  }
}

export async function reserveStock(store, opts) {
  if (!store?.reserveAtomic) throw httpError("Store transactionnel requis (D1 / MemoryTx), pas KV", 500);
  return store.reserveAtomic(opts);
}

export async function attachReservationSession(store, reservationId, sessionId) {
  if (!store?.attachSession) throw httpError("Store transactionnel requis", 500);
  return store.attachSession(reservationId, sessionId);
}

export async function releaseReservation(store, reservationId, opts) {
  if (!store?.release) throw httpError("Store transactionnel requis", 500);
  return store.release(reservationId, opts);
}

export async function commitReservation(store, reservationId, opts) {
  if (!store?.commit) throw httpError("Store transactionnel requis", 500);
  return store.commit(reservationId, opts);
}

export async function settlePaidReservation(store, reservationId, opts) {
  if (!store?.settlePaid) throw httpError("Store transactionnel requis", 500);
  return store.settlePaid(reservationId, opts);
}

export async function expireReservations(store, opts) {
  if (!store?.expireDue) throw httpError("Store transactionnel requis", 500);
  return store.expireDue(opts);
}
