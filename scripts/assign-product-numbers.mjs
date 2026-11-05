/**
 * Attribue des numéros permanents par famille (sans changer id / prix).
 * Écrit : catalog/products.json, catalog/product-numbers.json,
 *         docs/NUMEROTATION-PRODUITS-66.md, sync worker products + inventory fields.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RANGES = {
  mitaines: { start: 100, end: 199, label: "Mitaines" },
  chapeaux: { start: 200, end: 299, label: "Chapeaux" },
  pantoufles: { start: 300, end: 399, label: "Pantoufles" },
  mukluks: { start: 400, end: 499, label: "Mukluks" },
  "cache-oreilles": { start: 500, end: 599, label: "Cache-oreilles" },
  foulards: { start: 600, end: 699, label: "Foulards" },
  semelles: { start: 700, end: 799, label: "Semelles" },
};

const FAMILY_ORDER = [
  "mitaines",
  "chapeaux",
  "pantoufles",
  "mukluks",
  "cache-oreilles",
  "foulards",
  "semelles",
];

const catalogPath = path.join(root, "catalog/products.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const products = catalog.products;

if (products.length !== 66) {
  throw new Error(`Attendu 66 produits, reçu ${products.length}`);
}

for (const p of products) {
  if (!RANGES[p.category]) throw new Error(`Catégorie inconnue: ${p.category} (${p.id})`);
}

const assigned = [];
const used = new Set();

for (const cat of FAMILY_ORDER) {
  const range = RANGES[cat];
  const group = products
    .filter((p) => p.category === cat)
    .sort((a, b) => a.name_fr.localeCompare(b.name_fr, "fr") || a.id.localeCompare(b.id));
  if (group.length > range.end - range.start + 1) {
    throw new Error(`Trop de produits dans ${cat}`);
  }
  group.forEach((p, i) => {
    const num = range.start + i;
    if (used.has(num)) throw new Error(`Doublon numéro ${num}`);
    used.add(num);
    p.product_number = num;
    assigned.push({
      product_number: num,
      product_id: p.id,
      name_fr: p.name_fr,
      category: p.category,
      family_label: range.label,
      price_cad: p.price_cad,
      price_cad_cents: p.price_cad_cents,
      csm_code: `${num}-CSM`,
    });
  });
}

assigned.sort((a, b) => a.product_number - b.product_number);

catalog.version = catalog.version || 1;
catalog.product_numbering = {
  scheme: "family-ranges-v1",
  permanent: true,
  never_reuse: true,
  ranges: RANGES,
  assigned_at: new Date().toISOString().slice(0, 10),
};

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
fs.copyFileSync(catalogPath, path.join(root, "worker/src/products.json"));

const numbersDoc = {
  version: 1,
  policy: {
    permanent: true,
    never_reuse_for_other_model: true,
    technical_id_preserved: true,
    prices_unchanged: true,
    csm_suffix: "-CSM",
    csm_note: "Affichage seulement — l’id panier reste custom:…",
  },
  ranges: RANGES,
  items: assigned,
};

fs.writeFileSync(
  path.join(root, "catalog/product-numbers.json"),
  JSON.stringify(numbersDoc, null, 2) + "\n",
  "utf8",
);

const md = [
  "# Numérotation permanente — 66 produits",
  "",
  `**Date :** ${numbersDoc.items[0] ? new Date().toISOString().slice(0, 10) : ""}`,
  "**Règle :** numéro permanent, jamais réutilisé ; `id` technique inchangé ; prix inchangés.",
  "**CSM :** `{numéro}-CSM` (ex. `100-CSM`) — affichage rouge/gras ; ligne panier = `custom:…`.",
  "",
  "| N° | CSM | Famille | Nom | id technique | Prix CAD |",
  "|---:|-----|---------|-----|--------------|---------:|",
  ...assigned.map(
    (r) =>
      `| ${r.product_number} | ${r.csm_code} | ${r.family_label} | ${r.name_fr} | \`${r.product_id}\` | ${r.price_cad} |`,
  ),
  "",
  `**Total :** ${assigned.length} · **Doublons n° :** aucun · **Plages libres :** réservées pour futurs modèles.`,
  "",
];
fs.writeFileSync(path.join(root, "docs/NUMEROTATION-PRODUITS-66.md"), md.join("\n"), "utf8");

// Inventaire : champs numéro + provisoire 3 (qty_on_hand reste null = non validé Lucie)
const invPath = path.join(root, "inventory/inventory.json");
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));
const byId = new Map(assigned.map((a) => [a.product_id, a]));
inv.policy = {
  ...(inv.policy || {}),
  provisional_qty_default: 3,
  provisional_not_validated_by_lucie: true,
  provisional_not_for_live_sale: true,
  qty_on_hand_null_means: "Quantité réelle non confirmée par Lucie",
};
inv.items = (inv.items || []).map((row) => {
  const meta = byId.get(row.product_id);
  return {
    ...row,
    product_number: meta?.product_number ?? row.product_number ?? null,
    qty_on_hand: null,
    provisional_qty_on_hand: 3,
    qty_sold: row.qty_sold ?? 0,
    qty_reserved: row.qty_reserved ?? 0,
    min_stock_target: row.min_stock_target ?? 3,
    availability_status: "contact",
    lucie_confirmed: false,
  };
});
fs.writeFileSync(invPath, JSON.stringify(inv, null, 2) + "\n", "utf8");

const prov = {
  version: 1,
  data_mode: "provisional",
  warning_fr:
    "INVENTAIRE PROVISOIRE — 3 unités/produit pour travail local uniquement. Non validé par Lucie. Interdit pour vente réelle / AVAILABILITY_CONFIGURED.",
  totals: {
    products: 66,
    units_provisional: 66 * 3,
    formula: "66 × 3 = 198",
  },
  items: assigned.map((a) => ({
    product_number: a.product_number,
    product_id: a.product_id,
    name_fr: a.name_fr,
    category: a.category,
    price_cad: a.price_cad,
    qty_physical_provisional: 3,
    qty_reserved: 0,
    qty_available_provisional: 3,
    qty_sold: 0,
    min_stock_target: 3,
    availability_status: "contact",
    lucie_validated: false,
  })),
};
fs.writeFileSync(
  path.join(root, "inventory/provisional-inventory.json"),
  JSON.stringify(prov, null, 2) + "\n",
  "utf8",
);

console.log(
  JSON.stringify({
    products: assigned.length,
    unique_numbers: used.size,
    provisional_units: 198,
    first: assigned[0],
    last: assigned[assigned.length - 1],
    ok: assigned.length === 66 && used.size === 66,
  }),
);
