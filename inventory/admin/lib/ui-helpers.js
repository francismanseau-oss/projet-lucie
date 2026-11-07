/**
 * Libellés et filtres UI inventaire — mots simples pour Lucie.
 */

const CATEGORY_FR = {
  chapeaux: "Chapeaux",
  mitaines: "Mitaines",
  mukluks: "Mukluks",
  pantoufles: "Pantoufles",
  foulards: "Foulards",
  "cache-oreilles": "Cache-oreilles",
  semelles: "Semelles",
  ensembles: "Ensembles",
  autres: "Autres",
};

export const AUDIENCE_FR = {
  femmes: "Femmes",
  hommes: "Hommes",
  enfants: "Enfants",
  unisexe: "Unisexe",
};

export function categoryLabelFr(category) {
  const key = String(category || "").toLowerCase();
  return CATEGORY_FR[key] || (category ? String(category) : "Autres");
}

/** Quantité affichée : nombre ou « À confirmer » — jamais de jargon. */
export function qtyDisplayLabel(qtyOnHand) {
  if (qtyOnHand == null || qtyOnHand === "") return "À confirmer";
  const n = Math.floor(Number(qtyOnHand));
  if (!Number.isFinite(n)) return "À confirmer";
  return String(n);
}

export function listCategories(items) {
  const set = new Set();
  for (const it of items || []) {
    if (it.category) set.add(it.category);
  }
  return [...set].sort((a, b) => categoryLabelFr(a).localeCompare(categoryLabelFr(b), "fr"));
}

/**
 * Recherche par nom (et catégorie libellée). Pas de filtre SKU exposé à Lucie.
 */
export function matchesAudience(itemAudience, filter) {
  const want = String(filter || "tous").trim().toLowerCase();
  if (!want || want === "tous") return true;
  const aud = String(itemAudience || "").trim().toLowerCase();
  if (!aud) return false;
  // « tous » = visible Femmes + Hommes + Enfants (ex. cache-oreilles)
  if (aud === "tous" || aud === "all") return true;
  if (aud === "unisexe") return want === "femmes" || want === "hommes";
  return aud === want;
}

export function filterItems(items, { search = "", category = "", audience = "tous", onlyAlerts = false } = {}) {
  const q = String(search || "").trim().toLowerCase();
  const cat = String(category || "").trim().toLowerCase();
  return (items || []).filter((it) => {
    if (onlyAlerts && !it.below_min) return false;
    if (!matchesAudience(it.audience, audience)) return false;
    if (cat && String(it.category || "").toLowerCase() !== cat) return false;
    if (!q) return true;
    const name = String(it.name_fr || "").toLowerCase();
    const catLabel = categoryLabelFr(it.category).toLowerCase();
    const num = String(it.product_number ?? "");
    const id = String(it.product_id || "").toLowerCase();
    return name.includes(q) || catLabel.includes(q) || num.includes(q) || id.includes(q);
  });
}

export function auditActionLabelFr(action) {
  switch (action) {
    case "set_qty":
    case "correct_total":
      return "Stock total corrigé";
    case "add_fabricated":
    case "add_stock":
      return "Exemplaires ajoutés";
    case "adjust_plus":
      return "Exemplaire ajouté (+)";
    case "adjust_minus":
      return "Exemplaire retiré (−)";
    case "set_min_stock":
      return "Objectif minimum changé";
    default:
      return "Changement";
  }
}

/** Libellé quantité pour Lucie, incluant rupture. */
export function stockStatusLabelFr(item) {
  if (!item || item.qty_on_hand == null) return "À confirmer";
  if (isOutOfStockLike(item.qty_on_hand)) return "Rupture de stock";
  return String(Math.floor(Number(item.qty_on_hand)));
}

function isOutOfStockLike(qty) {
  return Math.floor(Number(qty)) === 0;
}
