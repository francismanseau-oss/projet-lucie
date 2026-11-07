/**
 * Sur mesure — prix = catalogue Boutique uniquement.
 * Mesures et options : le prix vient du catalogue. Le supplément chaleur n'est pas facturé tant qu'il n'est pas confirmé.
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

  /**
   * @param {object} measureSpec
   * @param {string} unit
   * @param {object} values display-unit values (legacy) OR ignored if measurementsCm provided
   * @param {object} [opts]
   * @param {object} [opts.measurementsCm] fieldId -> cm number
   * @param {object} [opts.measureOutOfRange] fieldId -> true
   */
  function validateMeasurements(measureSpec, unit, values, opts) {
    const fields = measureSpec?.fields || [];
    if (!fields.length) {
      return { ok: true, no_fields: true };
    }
    if (!unit || (unit !== "in" && unit !== "cm")) {
      return { ok: false, reason: "unit_required" };
    }
    const cmMap = opts && opts.measurementsCm ? opts.measurementsCm : null;
    const oor = (opts && opts.measureOutOfRange) || {};
    for (const f of fields) {
      if (oor[f.id]) continue;
      if (cmMap) {
        const cm = cmMap[f.id];
        if (f.required && (cm == null || !Number.isFinite(Number(cm)))) {
          return { ok: false, reason: "measurement_required", field: f.id };
        }
        if (cm == null || cm === "") continue;
        const n = Number(cm);
        if (!Number.isFinite(n) || n <= 0) {
          return { ok: false, reason: "measurement_invalid", field: f.id };
        }
        continue;
      }
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

  function isSkipMeasuresProduct(config, productId) {
    const ids = config?.skip_measures_product_ids || config?.adapted_contact?.product_ids || [];
    return Array.isArray(ids) && ids.includes(productId);
  }

  function canAddToCart(catalog, config, productId, state) {
    const product = findProduct(catalog, productId);
    if (!product) return { ok: false, reason: "no_product" };
    const price = officialPrice(catalog, productId);
    if (!price.ok) return { ok: false, reason: price.reason };
    if (isSkipMeasuresProduct(config, productId) || product.order_flow === "adapted_contact") {
      return { ok: true, price, product, skip_measures: true };
    }
    const spec = categoryMeasures(config, product.category);
    const meas = validateMeasurements(spec, state.unit, state.measurements, {
      measurementsCm: state.measurementsCm,
      measureOutOfRange: state.measureOutOfRange,
    });
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
    isSkipMeasuresProduct,
    canAddToCart,
  };
})(typeof window !== "undefined" ? window : globalThis);
