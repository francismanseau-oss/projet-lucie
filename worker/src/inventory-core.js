/** Constantes + règles métier stock (sans I/O). */

export const FULFILLMENT = {
  PENDING: "pending_lucie",
  UNIQUE: "unique_stock",
  MTO: "made_to_order",
};

export const RESERVATION_TTL_MS = 30 * 60 * 1000;

export function canSellLine(invRow, qtyWanted) {
  if (!invRow) return { ok: false, reason: "unknown_product" };
  if (invRow.fulfillment_type === FULFILLMENT.PENDING || !invRow.lucie_confirmed) {
    return { ok: false, reason: "pending_lucie" };
  }
  if (invRow.fulfillment_type === FULFILLMENT.MTO) {
    return { ok: true, mode: "made_to_order", reserve: false };
  }
  if (invRow.fulfillment_type === FULFILLMENT.UNIQUE) {
    if (invRow.qty_on_hand == null) return { ok: false, reason: "qty_not_set" };
    const avail = invRow.qty_on_hand - (invRow.qty_reserved || 0);
    if (avail < qtyWanted) return { ok: false, reason: "insufficient", avail };
    return { ok: true, mode: "unique_stock", reserve: true };
  }
  return { ok: false, reason: "invalid_type" };
}
