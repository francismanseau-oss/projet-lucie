/**
 * Tailles / formats — clés stock sans nouveaux product_id catalogue.
 * Stock multi-tailles : `${product_id}::${sizeCode}`
 * Stock mono-format : `product_id` (compat D1 / inventaire existant)
 */

export const SIZE_SEP = "::";

/** Libellés client — code interne inchangé. Une seule langue à la fois. */
export const SIZE_WORD_LABELS = {
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

export function normalizeSizeCode(code) {
  return String(code ?? "").trim();
}

/**
 * Libellés d’affichage FR/EN pour un code (lettres, âge, pointure).
 * Ne mélange jamais les langues.
 */
export function displaySizeLabels(code, sizeRow = null) {
  const raw = normalizeSizeCode(code);
  const fromRowFr = sizeRow?.label_fr ? String(sizeRow.label_fr).trim() : "";
  const fromRowEn = sizeRow?.label_en ? String(sizeRow.label_en).trim() : "";

  // Libellés explicites (ex. semelles universelles) : prioritaire sur le code « unique »
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
  if (letter) {
    return { fr: letter.fr, en: letter.en };
  }

  // Âge / unités : traduire mois|ans seulement
  let fr = fromRowFr || raw;
  let en = fromRowEn || raw;
  if (/mois/i.test(fr) || /mois/i.test(raw)) {
    fr = (fromRowFr || raw).replace(/\s+/g, " ").trim();
    en =
      fromRowEn && !/mois/i.test(fromRowEn)
        ? fromRowEn
        : fr.replace(/\bà\s+/gi, "to ").replace(/\bmois\b/gi, "months");
  } else if (/\bans\b/i.test(fr) || /\bans\b/i.test(raw)) {
    fr = (fromRowFr || raw).replace(/\s+/g, " ").trim();
    en =
      fromRowEn && !/\bans\b/i.test(fromRowEn)
        ? fromRowEn
        : fr.replace(/\bà\s+/gi, "to ").replace(/\bans\b/gi, "years");
  } else if (/universelle|universal|découper|cut to fit|pointures|sizes/i.test(fromRowFr + fromRowEn + raw)) {
    fr = fromRowFr || "Universelle (pointures 5 à 12, à découper)";
    en = fromRowEn || "Universal (sizes 5–12, cut to fit)";
  } else if (!fromRowEn || fromRowEn === fromRowFr || fromRowEn === raw) {
    // pointures numériques / codes âge sans unité : même valeur
    fr = fromRowFr || raw;
    en = fromRowEn && fromRowEn !== fromRowFr ? fromRowEn : fr;
  }

  return { fr, en };
}

export function soldOutLabel(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? "Sold out" : "Épuisé";
}

export function productSizesMap(sizesDoc) {
  const map = new Map();
  const products = sizesDoc?.products || {};
  for (const [id, entry] of Object.entries(products)) {
    map.set(id, entry);
  }
  return map;
}

/** Clé inventaire serveur (D1 / MemoryTx) pour une ligne boutique. */
export function inventoryStockId(catalogProductId, sizeCode, sizeEntry) {
  const id = String(catalogProductId || "");
  if (!id) return id;
  const sizes = sizeEntry?.sizes;
  if (!Array.isArray(sizes) || sizes.length <= 1) return id;
  const code = normalizeSizeCode(sizeCode);
  if (!code) return id;
  return `${id}${SIZE_SEP}${code}`;
}

export function parseInventoryStockId(stockId) {
  const s = String(stockId || "");
  const i = s.indexOf(SIZE_SEP);
  if (i < 0) return { product_id: s, size: null };
  return { product_id: s.slice(0, i), size: s.slice(i + SIZE_SEP.length) };
}

/**
 * Résout la taille pour une ligne panier.
 * @returns {{ ok:true, size:string|null, label_fr:string|null, label_en:string|null, qty:number|null, implicit?:boolean }
 *          |{ ok:false, reason:string }}
 */
export function resolveSizeForLine(sizeEntry, rawSize) {
  if (!sizeEntry || !Array.isArray(sizeEntry.sizes) || !sizeEntry.sizes.length) {
    return { ok: true, size: null, label_fr: null, label_en: null, qty: null };
  }

  if (sizeEntry.selector) {
    const code = normalizeSizeCode(rawSize);
    if (!code) return { ok: false, reason: "size_required" };
    const found = sizeEntry.sizes.find((s) => normalizeSizeCode(s.code) === code);
    if (!found) return { ok: false, reason: "size_invalid" };
    const qty = found.qty_on_hand == null ? null : Math.floor(Number(found.qty_on_hand));
    if (qty != null && qty <= 0) return { ok: false, reason: "size_sold_out", size: found.code };
    const labels = displaySizeLabels(found.code, found);
    return {
      ok: true,
      size: found.code,
      label_fr: labels.fr,
      label_en: labels.en,
      qty: Number.isFinite(qty) ? qty : null,
    };
  }

  const only = sizeEntry.sizes[0];
  const qty = only.qty_on_hand == null ? null : Math.floor(Number(only.qty_on_hand));
  if (qty != null && qty <= 0) return { ok: false, reason: "size_sold_out", size: only.code };
  const labels = displaySizeLabels(only.code, only);
  return {
    ok: true,
    size: only.code,
    label_fr: labels.fr,
    label_en: labels.en,
    qty: Number.isFinite(qty) ? qty : null,
    implicit: true,
  };
}

/** Agrège qty_on_hand parent = somme des tailles. */
export function sumSizeQty(sizes) {
  if (!Array.isArray(sizes) || !sizes.length) return null;
  let sum = 0;
  let any = false;
  for (const s of sizes) {
    if (s.qty_on_hand == null || s.qty_on_hand === "") continue;
    const n = Math.floor(Number(s.qty_on_hand));
    if (!Number.isFinite(n) || n < 0) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

/** Expand inventaire Lucie (1 ligne + sizes[]) → lignes MemoryTx/D1. */
export function expandInventoryRowsForStore(item, opts = {}) {
  const fulfillment = opts.fulfillment_type || item.fulfillment_type || "unique_stock";
  const confirmed = opts.lucie_confirmed != null ? !!opts.lucie_confirmed : !!item.lucie_confirmed;
  const sizes = Array.isArray(item.sizes) ? item.sizes : null;
  if (!sizes || sizes.length <= 1) {
    const qty =
      sizes && sizes[0] && sizes[0].qty_on_hand != null
        ? Math.floor(Number(sizes[0].qty_on_hand))
        : item.qty_on_hand === undefined
          ? null
          : item.qty_on_hand;
    return [
      {
        product_id: item.product_id,
        name_fr: item.name_fr || item.product_id,
        category: item.category || "",
        fulfillment_type: fulfillment,
        qty_on_hand: qty == null || !Number.isFinite(Number(qty)) ? null : Math.floor(Number(qty)),
        qty_reserved: item.qty_reserved || 0,
        lucie_confirmed: confirmed,
        catalog_product_id: item.product_id,
        size: sizes?.[0]?.code || null,
      },
    ];
  }
  return sizes.map((s) => {
    const code = normalizeSizeCode(s.code);
    const qty = s.qty_on_hand == null ? null : Math.floor(Number(s.qty_on_hand));
    return {
      product_id: `${item.product_id}${SIZE_SEP}${code}`,
      name_fr: `${item.name_fr || item.product_id} (${s.label_fr || code})`,
      category: item.category || "",
      fulfillment_type: fulfillment,
      qty_on_hand: Number.isFinite(qty) ? qty : null,
      qty_reserved: 0,
      lucie_confirmed: confirmed,
      catalog_product_id: item.product_id,
      size: code,
    };
  });
}
