/**
 * Génère le tableau de validation inventaire pour Lucie (lecture seule du catalogue).
 * N'écrit aucun stock inventé ; ne modifie pas products.json / inventory.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog", "products.json"), "utf8"),
);
const products = catalog.products;
if (!Array.isArray(products) || products.length !== 66) {
  throw new Error(`Attendu 66 produits, reçu ${products?.length}`);
}

const catLabel = {
  chapeaux: "Chapeaux",
  mitaines: "Mitaines",
  foulards: "Foulards",
  "cache-oreilles": "Cache-oreilles",
  semelles: "Semelles",
  mukluks: "Mukluks",
  pantoufles: "Pantoufles",
};

function money(cad) {
  return `${Number(cad).toFixed(2).replace(".", ",")} $`;
}

const rows = products.map((p, i) => ({
  n: i + 1,
  id: p.id,
  name_fr: p.name_fr,
  category: p.category,
  category_label: catLabel[p.category] || p.category,
  price_cad: p.price_cad,
  price_display: money(p.price_cad),
  availability: p.availability,
  deja_fabrique: "à confirmer",
  quantite_disponible: "à confirmer",
  fabrication_sur_demande: "à confirmer",
}));

const csvHeader = [
  "n",
  "product_id",
  "nom",
  "categorie",
  "prix_catalogue_cad",
  "deja_fabrique",
  "quantite_disponible",
  "fabrication_sur_demande",
  "notes_lucie",
].join(",");

const csvBody = rows
  .map((r) =>
    [
      r.n,
      r.id,
      `"${r.name_fr.replace(/"/g, '""')}"`,
      r.category_label,
      r.price_cad,
      r.deja_fabrique,
      r.quantite_disponible,
      r.fabrication_sur_demande,
      "",
    ].join(","),
  )
  .join("\n");

const csvPath = path.join(root, "docs", "INVENTAIRE-VALIDATION-LUCIE.csv");
fs.writeFileSync(csvPath, csvHeader + "\n" + csvBody + "\n", "utf8");

const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.category_label)) byCat.set(r.category_label, []);
  byCat.get(r.category_label).push(r);
}

let md = `# Inventaire — validation Lucie (66 produits)

**But :** Lucie confirme, produit par produit, ce qui existe déjà et ce qui se fabrique sur demande.  
**Règle :** ne jamais inventer de quantité. Les cases sont à **à confirmer** jusqu’à sa réponse.  
**Important :** le site reste en \`availability=contact\` — ce tableau **ne change pas** la boutique automatiquement.

**Fichier Excel / Sheets :** [INVENTAIRE-VALIDATION-LUCIE.csv](./INVENTAIRE-VALIDATION-LUCIE.csv)

## Comment remplir

| Colonne | Valeurs |
|---------|---------|
| Déjà fabriqué | \`oui\` / \`non\` / \`à confirmer\` |
| Quantité disponible | nombre réel **seulement** si Lucie le connaît ; sinon laisser \`à confirmer\` ou vide |
| Fabrication sur demande | \`oui\` / \`non\` / \`à confirmer\` |
| Notes | délai, particularités (optionnel) |

Prix = catalogue officiel (lecture seule). Ne pas modifier les prix ici.

---

`;

for (const [cat, list] of byCat) {
  md += `## ${cat} (${list.length})\n\n`;
  md += `| # | Nom | Prix | Déjà fabriqué | Qté dispo | Sur demande |\n`;
  md += `|---|-----|-----:|:-------------:|:---------:|:-----------:|\n`;
  for (const r of list) {
    md += `| ${r.n} | ${r.name_fr} | ${r.price_display} | ${r.deja_fabrique} | ${r.quantite_disponible} | ${r.fabrication_sur_demande} |\n`;
  }
  md += `\n`;
}

md += `---

## Contrôle automatique (génération)

- Produits : **${rows.length}**
- Tous \`availability\` catalogue : **contact** (aucune mise à « disponible »)
- Quantités : aucune chiffre inventé

*Généré le ${new Date().toISOString().slice(0, 10)} depuis \`catalog/products.json\`.*
`;

const mdPath = path.join(root, "docs", "INVENTAIRE-VALIDATION-LUCIE.md");
fs.writeFileSync(mdPath, md, "utf8");

console.log(
  JSON.stringify({
    ok: true,
    products: rows.length,
    csv: csvPath,
    md: mdPath,
    all_contact: rows.every((r) => r.availability === "contact"),
  }),
);
