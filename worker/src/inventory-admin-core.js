/**
 * Règles inventaire admin (seuil minimum, alertes, validations).
 * Ne confond jamais min_stock_target avec qty_on_hand.
 */

export const DEFAULT_MIN_STOCK_TARGET = 3;

/** Objectif provisoire — jamais une quantité disponible. */
export function normalizeMinStockTarget(value, fallback = DEFAULT_MIN_STOCK_TARGET) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * Alerte seulement si la quantité réelle est connue et sous le seuil.
 * qty_on_hand === null → pas d'alerte (inconnu ≠ sous le seuil).
 */
export function isBelowMinStock(row) {
  if (!row) return false;
  if (row.qty_on_hand == null) return false;
  const qty = Math.floor(Number(row.qty_on_hand));
  if (!Number.isFinite(qty) || qty < 0) return false;
  const min = normalizeMinStockTarget(row.min_stock_target);
  return qty < min;
}

export function validateQtyOnHand(value) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, qty_on_hand: null };
  }
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Quantité invalide (entier ≥ 0 ou vide)" };
  }
  return { ok: true, qty_on_hand: n };
}

export function validateAddQty(delta) {
  const n = Math.floor(Number(delta));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, error: "Ajouter au moins 1 unité" };
  }
  return { ok: true, delta: n };
}

export function applyAddFabricated(currentQty, delta) {
  const add = validateAddQty(delta);
  if (!add.ok) return add;
  const base = currentQty == null ? 0 : Math.floor(Number(currentQty));
  if (!Number.isFinite(base) || base < 0) {
    return { ok: false, error: "Quantité actuelle invalide" };
  }
  return { ok: true, qty_on_hand: base + add.delta, added: add.delta, previous: base };
}

/**
 * Aperçu avant confirmation : stock actuel + quantité à ajouter → nouveau total.
 * N’écrit rien — affichage Lucie seulement.
 */
export function previewAddToStock(currentQty, addQty) {
  const add = validateAddQty(addQty);
  if (!add.ok) return add;
  const base = currentQty == null ? 0 : Math.floor(Number(currentQty));
  if (!Number.isFinite(base) || base < 0) {
    return { ok: false, error: "Quantité actuelle invalide" };
  }
  return {
    ok: true,
    current: base,
    added: add.delta,
    new_total: base + add.delta,
  };
}

/**
 * Ajuste de ±N (boutons + / − de Lucie).
 * Interdit les quantités négatives. null traité comme 0 pour l’ajustement.
 */
export function applyAdjustQty(currentQty, delta) {
  const d = Math.floor(Number(delta));
  if (!Number.isFinite(d) || d === 0) {
    return { ok: false, error: "Ajustement invalide (utiliser +1 ou −1)" };
  }
  const base = currentQty == null ? 0 : Math.floor(Number(currentQty));
  if (!Number.isFinite(base) || base < 0) {
    return { ok: false, error: "Quantité actuelle invalide" };
  }
  const next = base + d;
  if (next < 0) {
    return { ok: false, error: "Impossible : la quantité ne peut pas descendre sous 0" };
  }
  return { ok: true, qty_on_hand: next, delta: d };
}

export function isOutOfStock(row) {
  if (!row || row.qty_on_hand == null) return false;
  return Math.floor(Number(row.qty_on_hand)) === 0;
}

export function summarizeAlerts(items) {
  const low = items.filter(isBelowMinStock);
  const unknown = items.filter((i) => i.qty_on_hand == null);
  const out = items.filter(isOutOfStock);
  return {
    total: items.length,
    low_stock_count: low.length,
    unknown_qty_count: unknown.length,
    out_of_stock_count: out.length,
    low_stock_ids: low.map((i) => i.product_id),
    out_of_stock_ids: out.map((i) => i.product_id),
  };
}
