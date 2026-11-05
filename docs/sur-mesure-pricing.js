/**
 * Sur mesure — prix = catalogue Boutique uniquement.
 * Mesures / options gratuites (ex. Raynaud) : jamais de prix inventé.
 */
(function (root) {
  const INCH_TO_CM = 2.54;

  function toCm(value, unit) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (unit === "cm") return n;
    if (unit === "in") return n * INCH_TO_CM;
    return null;
  }

  function fromCm(cm, unit) {
    if (cm == null || !Number.isFinite(cm)) return null;
    if (unit === "cm") return cm;
    if (unit === "in") return cm / INCH_TO_CM;
    return null;
  }

  function findProduct(catalog, productId) {
    return (catalog.products || []).find((p) => p.id === productId) || null;
  }

  function categoryMeasures(config, category) {
    return config?.measurements_by_category?.[category] || null;
  }

  /**
   * Prix officiel Boutique uniquement (cents CAD).
   */
  function officialPrice(catalog, productId) {
    const p = findProduct(catalog, productId);
    if (!p || p.active === false) {
      return { ok: false, total_cad_cents: null, reason: "product_unknown" };
    }
    if (!Number.isInteger(p.price_cad_cents) || p.price_cad_cents < 0) {
      return { ok: false, total_cad_cents: null, reason: "price_invalid" };
    }
    return {
      ok: true,
      total_cad_cents: p.price_cad_cents,
      currency: "CAD",
      breakdown: [
        {
          key: "catalog",
          label_fr: "Prix catalogue (Boutique)",
          label_en: "Catalog price (Shop)",
          amount_cad_cents: p.price_cad_cents,
        },
      ],
    };
  }

  function validateMeasurements(measureSpec, unit, values) {
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

  function canAddToCart(catalog, config, productId, state) {
    const product = findProduct(catalog, productId);
    if (!product) return { ok: false, reason: "no_product" };
    const price = officialPrice(catalog, productId);
    if (!price.ok) return { ok: false, reason: price.reason };
    const spec = categoryMeasures(config, product.category);
    const meas = validateMeasurements(spec, state.unit, state.measurements);
    if (!meas.ok) return { ok: false, reason: meas.reason, field: meas.field };
    return { ok: true, price, product };
  }

  root.BOREALES_SUR_MESURE = {
    INCH_TO_CM,
    toCm,
    fromCm,
    findProduct,
    categoryMeasures,
    officialPrice,
    validateMeasurements,
    canAddToCart,
  };
})(typeof window !== "undefined" ? window : globalThis);
