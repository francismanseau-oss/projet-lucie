/**
 * Tailles boutique — charge catalog/product-sizes.json (provisoire, éditable Lucie).
 * Affichage client : grandeur en toutes lettres, une langue à la fois, sans qty.
 * Codes internes S/M/L… inchangés.
 */
(function (root) {
  "use strict";

  const SIZE_SEP = "::";
  const SIZE_WORD_LABELS = {
    S: { fr: "Petit", en: "Small" },
    M: { fr: "Moyen", en: "Medium" },
    L: { fr: "Grand", en: "Large" },
    XL: { fr: "Très grand", en: "Extra Large" },
    XXL: { fr: "Très très grand", en: "2XL" },
    "M-L": { fr: "Moyen–Grand", en: "Medium–Large" },
    "L-XL": { fr: "Grand–Très grand", en: "Large–Extra Large" },
    "S-M": { fr: "Petit–Moyen", en: "Small–Medium" },
    unique: { fr: "Format unique", en: "One size" },
  };

  let cache = null;
  let loadPromise = null;

  function eng() {
    return document.documentElement.lang.startsWith("en");
  }

  function sizesUrl() {
    const base = document.querySelector('script[src*="product-sizes.js"]');
    const src = base && base.getAttribute("src");
    if (src && src.includes("/")) {
      const dir = src.replace(/[^/]+$/, "");
      return dir + "catalog/product-sizes.json";
    }
    return "catalog/product-sizes.json";
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(sizesUrl(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => {
        cache = doc || { products: {} };
        return cache;
      })
      .catch(() => {
        cache = { products: {} };
        return cache;
      });
    return loadPromise;
  }

  function entry(productId) {
    return (cache && cache.products && cache.products[productId]) || null;
  }

  function normalizeSizeCode(code) {
    return String(code ?? "").trim();
  }

  function displaySizeLabels(code, sizeRow) {
    const raw = normalizeSizeCode(code);
    const fromRowFr = sizeRow?.label_fr ? String(sizeRow.label_fr).trim() : "";
    const fromRowEn = sizeRow?.label_en ? String(sizeRow.label_en).trim() : "";
    if (
      fromRowFr &&
      /universelle|universal|découper|cut to fit|pointures\s*5|sizes\s*5/i.test(
        fromRowFr + " " + fromRowEn,
      )
    ) {
      return {
        fr: fromRowFr,
        en: fromRowEn || "Universal (sizes 5–12, cut to fit)",
      };
    }
    const key = raw.toUpperCase() === "SMALL" ? "S" : raw;
    const letter = SIZE_WORD_LABELS[key] || SIZE_WORD_LABELS[raw];
    if (letter) return { fr: letter.fr, en: letter.en };

    let fr = fromRowFr || raw;
    let en = fromRowEn || raw;
    if (/mois/i.test(fr) || /mois/i.test(raw)) {
      fr = (fromRowFr || raw).replace(/\s+/g, " ").trim();
      en = fromRowEn && !/mois/i.test(fromRowEn)
        ? fromRowEn
        : fr.replace(/\bà\s+/gi, "to ").replace(/\bmois\b/gi, "months");
    } else if (/\bans\b/i.test(fr) || /\bans\b/i.test(raw)) {
      fr = (fromRowFr || raw).replace(/\s+/g, " ").trim();
      en = fromRowEn && !/\bans\b/i.test(fromRowEn)
        ? fromRowEn
        : fr.replace(/\bà\s+/gi, "to ").replace(/\bans\b/gi, "years");
    } else if (/universelle|universal|découper|cut to fit|pointures|sizes/i.test(fromRowFr + fromRowEn + raw)) {
      fr = fromRowFr || "Universelle (pointures 5 à 12, à découper)";
      en = fromRowEn || "Universal (sizes 5–12, cut to fit)";
    } else if (!fromRowEn || fromRowEn === fromRowFr || fromRowEn === raw) {
      fr = fromRowFr || raw;
      en = fromRowEn && fromRowEn !== fromRowFr ? fromRowEn : fr;
    }
    return { fr, en };
  }

  function displayLabel(code, sizeRow, lang) {
    const labels = displaySizeLabels(code, sizeRow);
    const useEn = lang ? String(lang).toLowerCase().startsWith("en") : eng();
    return useEn ? labels.en : labels.fr;
  }

  function soldOutLabel(lang) {
    const useEn = lang ? String(lang).toLowerCase().startsWith("en") : eng();
    return useEn ? "Sold out" : "Épuisé";
  }

  /** « 3 en stock » / « 1 in stock » / « Épuisé » — jamais « M (3) ». */
  function stockPhrase(qty, lang) {
    const useEn = lang ? String(lang).toLowerCase().startsWith("en") : eng();
    if (qty == null || qty === "") return "";
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q)) return "";
    if (q <= 0) return soldOutLabel(useEn ? "en" : "fr");
    if (useEn) return q === 1 ? "1 in stock" : q + " in stock";
    return q === 1 ? "1 en stock" : q + " en stock";
  }

  /** Libellé grandeur seule (sans quantité). */
  function optionLabel(sizeRow, lang) {
    return displayLabel(sizeRow.code, sizeRow, lang);
  }

  function lineKey(item) {
    if (!item) return "";
    if (item.custom || String(item.id || "").startsWith("custom:")) return String(item.id);
    const size = normalizeSizeCode(item.size);
    return size ? item.id + "|" + size : String(item.id);
  }

  function sizeLabel(item) {
    if (!item || !item.size) return "";
    const labels = displaySizeLabels(item.size, {
      label_fr: item.size_label_fr,
      label_en: item.size_label_en,
    });
    return eng() ? labels.en : labels.fr;
  }

  function labelsForCart(code, sizeRow) {
    return displaySizeLabels(code, sizeRow);
  }

  function availableQty(productId, sizeCode) {
    const e = entry(productId);
    if (!e || !Array.isArray(e.sizes)) return null;
    if (e.selector) {
      const code = normalizeSizeCode(sizeCode);
      const s = e.sizes.find((x) => normalizeSizeCode(x.code) === code);
      if (!s) return 0;
      return s.qty_on_hand == null ? null : Math.floor(Number(s.qty_on_hand));
    }
    const s = e.sizes[0];
    return s && s.qty_on_hand != null ? Math.floor(Number(s.qty_on_hand)) : null;
  }

  function needsSelector(productId) {
    const e = entry(productId);
    return !!(e && e.selector && e.sizes && e.sizes.length > 1);
  }

  function sizesFor(productId) {
    const e = entry(productId);
    return e && Array.isArray(e.sizes) ? e.sizes : [];
  }

  root.BOREALES_PRODUCT_SIZES = {
    load,
    entry,
    lineKey,
    sizeLabel,
    displayLabel,
    displaySizeLabels,
    labelsForCart,
    optionLabel,
    soldOutLabel,
    stockPhrase,
    availableQty,
    needsSelector,
    sizesFor,
    normalizeSizeCode,
    SIZE_SEP,
    SIZE_WORD_LABELS,
    refresh() {
      cache = null;
      loadPromise = null;
      return load();
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
