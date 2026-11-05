/** Numéros produits + libellés CSM (Worker / courriels / tests). */

export function csmCode(productNumber) {
  const n = Number(productNumber);
  if (!Number.isFinite(n) || n < 1) return "";
  return `${n}-CSM`;
}

export function formatLucieLineLabel({ product_number, name, custom }) {
  const num = product_number != null && product_number !== "" ? String(product_number) : "";
  const title = name || "";
  if (custom && num) return `${num}-CSM — ${title}`.trim();
  if (custom) return `CSM — ${title}`.trim();
  if (num) return `${num} — ${title}`.trim();
  return title;
}
