/** Sur mesure serveur — prix = catalogue Boutique uniquement. */

export const INCH_TO_CM = 2.54;

export function toCm(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (unit === "cm") return n;
  if (unit === "in") return n * INCH_TO_CM;
  return null;
}

export function validateMeasurements(measureSpec, unit, values) {
  const fields = measureSpec?.fields || [];
  if (!fields.length) {
    return { ok: true, no_fields: true };
  }
  if (!unit || (unit !== "in" && unit !== "cm")) {
    return { ok: false, reason: "unit_required" };
  }
  for (const f of fields) {
    const raw = values?.[f.id];
    if (f.required && (raw === "" || raw == null)) {
      return { ok: false, reason: "measurement_required", field: f.id };
    }
    if (raw === "" || raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, reason: "measurement_invalid", field: f.id };
    }
  }
  return { ok: true };
}

/** @deprecated — prix inventés interdits ; utiliser officialBoutiquePrice */
export function computeCustomPrice() {
  return { ok: false, total_cad_cents: null, breakdown: [], reason: "use_boutique_catalog" };
}

export function officialBoutiquePrice(product) {
  if (!product || product.active === false) {
    return { ok: false, total_cad_cents: null, reason: "product_unknown" };
  }
  if (!Number.isInteger(product.price_cad_cents) || product.price_cad_cents < 0) {
    return { ok: false, total_cad_cents: null, reason: "price_invalid" };
  }
  return { ok: true, total_cad_cents: product.price_cad_cents };
}
