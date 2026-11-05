/**
 * Analyse des doublons potentiels (taille S/M/L/XL seulement).
 * Lecture seule — aucun regroupement appliqué.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog", "products.json"), "utf8"),
);

const SIZE_COMPOUND = /\b(XXL|XL|M-L|L-XL|S-M|S\/M|M\/L|L\/XL)\b/gi;
const SIZE_SINGLE = /(^|[\s—–\-/])([SML])(?=$|[\s—–\-/])/gi;

function stripSizes(name) {
  let s = String(name || "");
  s = s.replace(SIZE_COMPOUND, " ");
  s = s.replace(SIZE_SINGLE, "$1");
  s = s.replace(/\s*[—–]\s*/g, " — ");
  s = s.replace(/\s{2,}/g, " ").replace(/\s*—\s*$/g, "").replace(/^\s*—\s*/g, "").trim();
  return s;
}

function extractSizeTokens(name) {
  const tokens = [];
  const n = String(name || "");
  for (const m of n.matchAll(SIZE_COMPOUND)) tokens.push(m[1].toUpperCase());
  for (const m of n.matchAll(SIZE_SINGLE)) tokens.push(m[2].toUpperCase());
  return [...new Set(tokens)];
}

function normMat(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const products = catalog.products.filter((p) => p.active !== false);
const groups = new Map();

for (const p of products) {
  const baseFr = stripSizes(p.name_fr);
  const key = `${p.category}||${normMat(baseFr)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    id: p.id,
    name_fr: p.name_fr,
    name_display: baseFr,
    category: p.category,
    price_cad: p.price_cad,
    price_cad_cents: p.price_cad_cents,
    description_fr: p.description_fr || "",
    image: p.image || "",
    sizes_in_name: extractSizeTokens(p.name_fr),
  });
}

const multi = [...groups.entries()]
  .map(([key, items]) => ({ key, items }))
  .filter((g) => g.items.length > 1);

function classify(g) {
  const prices = [...new Set(g.items.map((i) => i.price_cad_cents))];
  const descs = [...new Set(g.items.map((i) => normMat(i.description_fr)))];
  const images = [...new Set(g.items.map((i) => i.image))];
  const allHaveSize = g.items.every((i) => i.sizes_in_name.length > 0);
  const samePrice = prices.length === 1;
  const sameDesc = descs.length === 1;
  const sameImage = images.length === 1;

  let verdict = "decision_lucie";
  let reason = "";

  if (!allHaveSize) {
    verdict = "decision_lucie";
    reason =
      "Au moins une référence du groupe n’a pas de taille explicite dans le nom — regroupement non automatique.";
  } else if (samePrice && sameDesc && sameImage) {
    verdict = "regroupable_sans_ambiguite_prix";
    reason =
      "Même prix, même description, même image ; seuls les tokens de taille du nom diffèrent. Regroupement visuel possible après validation Lucie (choix du SKU panier à définir).";
  } else if (samePrice && sameDesc) {
    verdict = "proche_decision_lucie";
    reason =
      "Même prix et description, mais images différentes — vérifier si c’est le même modèle.";
  } else if (!samePrice) {
    verdict = "garder_separes";
    reason = `Prix différents (${prices.map((c) => (c / 100).toFixed(0) + " $").join(", ")}) — ne pas fusionner.`;
  } else if (!sameDesc) {
    verdict = "decision_lucie";
    reason = "Descriptions / matériaux textuels différents — décision Lucie.";
  }

  return {
    category: g.items[0].category,
    label_fr: g.items[0].name_display,
    count: g.items.length,
    prices_cad: prices.map((c) => c / 100),
    same_price: samePrice,
    same_description: sameDesc,
    same_image: sameImage,
    all_have_size_token: allHaveSize,
    verdict,
    reason,
    skus: g.items.map((i) => ({
      id: i.id,
      name_fr: i.name_fr,
      size_tokens: i.sizes_in_name,
      price_cad: i.price_cad,
      image: i.image,
      description_fr: i.description_fr,
    })),
  };
}

const classified = multi.map(classify);
const byVerdict = {
  regroupable_sans_ambiguite_prix: classified.filter(
    (c) => c.verdict === "regroupable_sans_ambiguite_prix",
  ),
  proche_decision_lucie: classified.filter((c) => c.verdict === "proche_decision_lucie"),
  decision_lucie: classified.filter((c) => c.verdict === "decision_lucie"),
  garder_separes: classified.filter((c) => c.verdict === "garder_separes"),
};

const report = {
  generated: new Date().toISOString().slice(0, 10),
  total_products: products.length,
  groups_with_2plus_after_size_strip: classified.length,
  duplicate_sku_count: classified.reduce((s, c) => s + c.count, 0),
  potential_cards_saved_if_merged: classified
    .filter((c) => c.verdict === "regroupable_sans_ambiguite_prix")
    .reduce((s, c) => s + (c.count - 1), 0),
  summary_counts: {
    regroupable_sans_ambiguite_prix: byVerdict.regroupable_sans_ambiguite_prix.length,
    proche_decision_lucie: byVerdict.proche_decision_lucie.length,
    decision_lucie: byVerdict.decision_lucie.length,
    garder_separes: byVerdict.garder_separes.length,
  },
  groups: classified.sort((a, b) => a.category.localeCompare(b.category) || a.label_fr.localeCompare(b.label_fr)),
  note:
    "Aucun regroupement appliqué. Boutique et products.json inchangés. Un regroupement visuel futur devra encore définir quel SKU part dans le panier.",
};

const outJson = path.join(root, "docs", "ANALYSE-DOUBLONS-SUR-MESURE.json");
const outMd = path.join(root, "docs", "RAPPORT-DOUBLONS-SUR-MESURE.md");
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

function money(n) {
  return Number(n).toFixed(2).replace(".", ",") + " $";
}

let md = `# Rapport préalable — doublons visuels sur mesure

**Date :** ${report.generated}  
**Statut :** analyse seulement — **aucun regroupement appliqué**  
**Catalogue :** 66 produits actifs, prix / Boutique / SKU **inchangés**

---

## Synthèse

| Indicateur | Valeur |
|------------|--------|
| Produits analysés | ${report.total_products} |
| Groupes potentiels (même libellé sans taille) | **${report.groups_with_2plus_after_size_strip}** |
| SKU concernés par ces groupes | ${report.duplicate_sku_count} |
| Groupes regroupables sans ambiguïté de prix/desc/image | **${report.summary_counts.regroupable_sans_ambiguite_prix}** |
| Cartes en moins si ces groupes étaient fusionnés (indicatif) | ${report.potential_cards_saved_if_merged} |
| Groupes proches (décision Lucie) | ${report.summary_counts.proche_decision_lucie} |
| Autres décisions Lucie | ${report.summary_counts.decision_lucie} |
| À garder séparés (prix différents) | ${report.summary_counts.garder_separes} |

---

## Méthode

1. Retirer du nom FR les tokens de taille : \`S\`, \`M\`, \`L\`, \`XL\`, \`M-L\`, \`L-XL\`, etc.  
2. Grouper par **catégorie + nom sans taille**.  
3. Comparer **prix**, **description**, **image**.  
4. **Ne jamais** fusionner automatiquement sur une simple ressemblance de nom.

---

## Cas regroupables sans ambiguïté de prix (après validation Lucie)

*Même prix, même description, même image ; seuls les tokens de taille diffèrent.  
⚠️ Même après validation visuelle, il restera à décider **quel SKU** envoyer au panier / Worker (interdit de choisir arbitrairement sans Lucie).*

`;

if (!byVerdict.regroupable_sans_ambiguite_prix.length) {
  md += "_Aucun groupe dans cette catégorie strict._\n\n";
} else {
  for (const g of byVerdict.regroupable_sans_ambiguite_prix) {
    md += `### ${g.category} — ${g.label_fr}\n\n`;
    md += `| SKU | Nom catalogue | Taille(s) dans le nom | Prix |\n|-----|---------------|------------------------|------|\n`;
    for (const s of g.skus) {
      md += `| \`${s.id}\` | ${s.name_fr} | ${s.size_tokens.join(", ") || "—"} | ${money(s.price_cad)} |\n`;
    }
    md += `\n${g.reason}\n\n`;
  }
}

md += `## Cas proches — décision Lucie requise\n\n`;
if (!byVerdict.proche_decision_lucie.length) {
  md += "_Aucun._\n\n";
} else {
  for (const g of byVerdict.proche_decision_lucie) {
    md += `### ${g.category} — ${g.label_fr}\n\n`;
    md += `| SKU | Nom | Prix | Image |\n|-----|-----|------|-------|\n`;
    for (const s of g.skus) {
      md += `| \`${s.id}\` | ${s.name_fr} | ${money(s.price_cad)} | \`${s.image}\` |\n`;
    }
    md += `\n**Pourquoi :** ${g.reason}\n\n`;
  }
}

md += `## Autres cas — décision Lucie / ne pas fusionner auto\n\n`;
const other = [...byVerdict.decision_lucie, ...byVerdict.garder_separes];
if (!other.length) {
  md += "_Aucun._\n\n";
} else {
  for (const g of other) {
    md += `### ${g.category} — ${g.label_fr} \n\n`;
    md += `- Verdict : **${g.verdict}**  
- ${g.reason}
`;
    md += `| SKU | Nom | Prix |\n|-----|-----|------|\n`;
    for (const s of g.skus) {
      md += `| \`${s.id}\` | ${s.name_fr} | ${money(s.price_cad)} |\n`;
    }
    md += `\n`;
  }
}

md += `---

## Tous les groupes (liste complète)

`;

for (const g of classified) {
  md += `- **${g.category}** / ${g.label_fr} — ${g.count} SKU — prix [${g.prices_cad.map(money).join(", ")}] — \`${g.verdict}\`\n`;
}

md += `
---

## Prochaine étape (après validation Francis / Lucie)

1. Valider quels groupes peuvent être **une seule carte** visuelle.  
2. Pour chaque groupe validé : définir le **SKU panier** (ou règle explicite).  
3. Seulement alors appliquer le regroupement dans le configurateur.

JSON détaillé : \`docs/ANALYSE-DOUBLONS-SUR-MESURE.json\`
`;

fs.writeFileSync(outMd, md);
console.log(
  JSON.stringify(
    {
      ok: true,
      groups: classified.length,
      regroupable: report.summary_counts.regroupable_sans_ambiguite_prix,
      md: outMd,
      json: outJson,
    },
    null,
    2,
  ),
);
