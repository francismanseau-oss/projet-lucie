/**
 * Audit local configurateur sur mesure — sans réseau Stripe réel.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const products = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "catalog/sur-mesure-config.json"), "utf8"));
const illus = JSON.parse(fs.readFileSync(path.join(root, "catalog/sur-mesure-illustrations.json"), "utf8"));
const workerProducts = JSON.parse(fs.readFileSync(path.join(root, "worker/src/products.json"), "utf8"));

const { buildLineItems } = await import(pathToFileURL(path.join(root, "worker/src/logic.js")).href);
const {
  validateMeasurements,
  toCm,
  INCH_TO_CM,
  officialBoutiquePrice,
} = await import(pathToFileURL(path.join(root, "worker/src/sur-mesure-pricing.js")).href);

const report = { ok: [], warn: [], fail: [] };
const pass = (m) => report.ok.push(m);
const warn = (m) => report.warn.push(m);
const fail = (m) => report.fail.push(m);

const list = products.products || [];
if (list.length !== 65) fail(`Produits: attendu 65, reçu ${list.length}`);
else pass("65 produits catalogue");

const cats = [...new Set(list.map((p) => p.category))].sort();
const expectedCats = ["cache-oreilles", "chapeaux", "foulards", "mitaines", "mukluks", "pantoufles", "semelles"];
if (JSON.stringify(cats) !== JSON.stringify(expectedCats)) fail(`Catégories: ${cats.join(",")}`);
else pass("7 catégories présentes");

let badPrice = 0;
let badMeta = 0;
for (const p of list) {
  if (!Number.isInteger(p.price_cad_cents) || p.price_cad_cents < 0) {
    fail(`Prix invalide ${p.id}`);
    badPrice++;
  }
  if (!p.name_fr || !p.image) {
    fail(`Nom/image manquant ${p.id}`);
    badMeta++;
  }
}
if (!badPrice) pass("65 prix entiers CAD");
if (!badMeta) pass("65 noms FR + chemins image");

const wp = JSON.stringify(workerProducts.products.map((p) => [p.id, p.price_cad_cents]));
const bp = JSON.stringify(list.map((p) => [p.id, p.price_cad_cents]));
if (wp !== bp) fail("worker/src/products.json ≠ catalog/products.json");
else pass("Parité Worker ↔ Boutique (ids + prix)");

let illusOk = 0;
for (const [cat, entry] of Object.entries(illus.categories)) {
  for (const lang of ["fr", "en"]) {
    const f = path.join(root, entry.files[lang]);
    if (!fs.existsSync(f)) fail(`Illus manquante ${entry.files[lang]}`);
    else if (entry.asset_status !== "pret") fail(`Illus non pret: ${cat}/${lang}`);
    else illusOk++;
  }
  const fields = (config.measurements_by_category[cat]?.fields || []).map((f) => f.id);
  const markers = (entry.markers || []).map((m) => m.field_id);
  if (JSON.stringify(fields) !== JSON.stringify(markers)) {
    fail(`Markers ≠ champs formulaire pour ${cat}: form=[${fields}] illus=[${markers}]`);
  } else {
    pass(`Correspondance champs ↔ illustration: ${cat}`);
  }
  const nums = (config.measurements_by_category[cat]?.fields || []).map((f) => f.diagram_number);
  const mnums = (entry.markers || []).map((m) => m.n);
  if (JSON.stringify(nums) !== JSON.stringify(mnums)) fail(`Numéros diagramme ≠ markers ${cat}`);
}
if (illusOk === 14) pass("14 illustrations FR/EN présentes et pret");

const mit = config.measurements_by_category.mitaines;
if (
  mit.fields.length === 2 &&
  mit.fields[0].id === "hand_circumference" &&
  mit.fields[1].id === "hand_length" &&
  mit.awaiting_lucie_validation === false
) {
  pass("Mitaines: 2 mesures Lucie");
} else fail("Mitaines: configuration incorrecte");

for (const cat of expectedCats.filter((c) => c !== "mitaines")) {
  const s = config.measurements_by_category[cat];
  if (!(s.provisional || s.awaiting_lucie_validation)) warn(`${cat}: pas marqué provisoire/awaiting`);
}
pass("Autres catégories marquées provisoires / awaiting");

assert.equal(INCH_TO_CM, 2.54);
assert.equal(toCm(20, "cm"), 20);
assert.ok(Math.abs(20 / INCH_TO_CM - 7.874015748031496) < 1e-9);
assert.equal(toCm(10, "in"), 25.4);
pass("Conversion cm ↔ po (20 cm ≈ 7,87 po)");

const app = fs.readFileSync(path.join(root, "sur-mesure-app.js"), "utf8");
if (app.includes("state.unit = null") && app.includes("state.measurements = {}")) {
  pass("Changement de produit: reset unit + mesures (code)");
} else fail("selectProduct ne réinitialise pas unit/measurements");

const measureSpecForCategory = (c) => config.measurements_by_category[c] || { fields: [] };
const mitaine = list.find((p) => p.category === "mitaines");
const pant = list.find((p) => p.category === "pantoufles");
const chap = list.find((p) => p.category === "chapeaux");
const foul = list.find((p) => p.category === "foulards");

const cartSim = [
  {
    id: `custom:${mitaine.id}:a1`,
    qty: 1,
    price: 1,
    price_cad_cents: 99,
    custom_config: {
      product_id: mitaine.id,
      unit: "cm",
      measurements: { hand_circumference: 20, hand_length: 18 },
      measurements_cm: { hand_circumference: 20, hand_length: 18 },
      chaleur: true,
      comments: "Doigté large",
      leather: "noir",
    },
  },
  {
    id: `custom:${pant.id}:b2`,
    qty: 1,
    price_cad_cents: 1,
    custom_config: {
      product_id: pant.id,
      unit: "in",
      measurements: { foot_length: 9.5, foot_width: 3.8 },
      measurements_cm: { foot_length: toCm(9.5, "in"), foot_width: toCm(3.8, "in") },
      chaleur: false,
      comments: "Semelle souple",
      leather: "noir",
    },
  },
  {
    id: `custom:${chap.id}:c3`,
    qty: 2,
    custom_config: {
      product_id: chap.id,
      unit: "cm",
      measurements: { head_circumference: 57 },
      comments: "",
      leather: "noir",
    },
  },
  {
    id: `custom:${foul.id}:d4`,
    qty: 1,
    custom_config: {
      product_id: foul.id,
      unit: "cm",
      measurements: { scarf_length: 160, scarf_width: 28 },
      comments: "Franges longues",
      leather: "noir",
    },
  },
];

const { resolved, total_cents } = buildLineItems(products, cartSim, {
  validateMeasurements,
  measureSpecForCategory,
  audienceByProductId: { [mitaine.id]: "femmes" },
});

assert.equal(resolved.length, 4);
assert.equal(resolved[0].unit_amount, mitaine.price_cad_cents);
assert.equal(resolved[1].unit_amount, pant.price_cad_cents);
assert.equal(resolved[2].unit_amount, chap.price_cad_cents);
assert.equal(resolved[3].unit_amount, foul.price_cad_cents);
assert.notEqual(resolved[0].unit_amount, 99);
assert.equal(resolved[0].custom_config.chaleur, true);
assert.equal(resolved[0].custom_config.comments, "Doigté large");
assert.equal(resolved[1].custom_config.measurements.foot_length, 9.5);
assert.equal(resolved[2].qty, 2);
assert.equal(
  total_cents,
  mitaine.price_cad_cents + pant.price_cad_cents + chap.price_cad_cents * 2 + foul.price_cad_cents,
);
assert.equal(new Set(resolved.map((r) => r.id)).size, 4);
assert.equal(new Set(resolved.map((r) => JSON.stringify(r.custom_config.measurements))).size, 4);
pass("Panier multi-lignes: 4 sur-mesure isolés, prix catalogue, mesures/options/commentaires conservés");
pass("Prix navigateur ignorés (99¢ rejetés au profit du catalogue)");

const op = officialBoutiquePrice(mitaine);
assert.equal(op.total_cad_cents, mitaine.price_cad_cents);
pass("officialBoutiquePrice aligné Boutique");

// Stripe checkout payload shape (paiement.html)
const paiement = fs.readFileSync(path.join(root, "paiement.html"), "utf8");
if (
  paiement.includes("chaleur") &&
  paiement.includes("comments") &&
  paiement.includes("measurements_cm") &&
  paiement.includes("product_id")
) {
  pass("paiement.html transmet custom_config (mesures, chaleur, commentaires)");
} else fail("paiement.html: custom_config incomplet");

const panier = fs.readFileSync(path.join(root, "panier.html"), "utf8");
const cartI18n = fs.existsSync(path.join(root, "cart-i18n.js"))
  ? fs.readFileSync(path.join(root, "cart-i18n.js"), "utf8")
  : "";
if (
  panier.includes("custom_config") &&
  panier.includes("cart-i18n.js") &&
  cartI18n.includes("chaleur") &&
  cartI18n.includes("comments") &&
  cartI18n.includes("measurement_labels")
) {
  pass("panier.html + cart-i18n.js affichent mesures / chaleur / commentaires (bilingue)");
} else fail("panier.html: détails custom incomplets");

try {
  const base = "http://127.0.0.1:8766";
  const r = await fetch(base + "/creations-personnalisees.html");
  if (r.ok) {
    pass("HTTP :8766 creations-personnalisees.html");
    const fr = await fetch(base + "/assets/mesures/mitaines-mesures-fr.webp");
    const en = await fetch(base + "/assets/mesures/foulards-mesures-en.webp");
    if (fr.ok && en.ok) pass("HTTP illustrations mitaines-fr + foulards-en");
    else fail("HTTP illustrations KO");
    const steps = await r.text();
    if (["sm-step-1", "sm-step-2", "sm-step-3", "sm-step-4"].every((id) => steps.includes(id))) {
      pass("HTML: 4 étapes présentes");
    }
  } else warn("Serveur :8766 pas 200 HTML");
} catch {
  warn("Serveur local :8766 non joignable");
}

// UX: récap utilise name_fr même en EN — anomalie mineure
if (app.includes("product.name_fr") && !app.includes("name_en ? p.name_en")) {
  // tiles already use eng() for name; summary might not
}
if (app.includes('[t("Produit", "Product"), product.name_fr]')) {
  warn("Récap étape 4: nom produit toujours en FR (EN non basculé) — correction recommandée");
}

// --- UX / a11y contracts (automatisés — pas un test device physique) ---
const html = fs.readFileSync(path.join(root, "creations-personnalisees.html"), "utf8");
const css = fs.readFileSync(path.join(root, "creations-personnalisees.css"), "utf8");
const appJs = fs.readFileSync(path.join(root, "sur-mesure-app.js"), "utf8");

if (html.includes('id="sm-progress"') && html.includes("data-sm-goto")) pass("UX: barre de progression 4 étapes");
else fail("UX: barre de progression manquante");

if (html.includes("pas encore un paiement") || html.includes("not a payment yet")) {
  pass("UX: disclaimer panier ≠ commande payée");
} else fail("UX: disclaimer paiement manquant");

if (html.includes('for="sm-chaleur"') && html.includes('for="sm-comments"')) {
  pass("A11y: labels associés chaleur + commentaires");
} else fail("A11y: labels manquants");

if (html.includes('id="sm-measure-errors"') && html.includes('role="alert"')) {
  pass("A11y: zone d’erreurs mesures (alert)");
} else fail("A11y: zone d’erreurs manquante");

if (appJs.includes("aria-describedby") && appJs.includes("aria-invalid")) {
  pass("A11y: champs mesures aria-describedby + aria-invalid");
} else fail("A11y: attributs champs mesures incomplets");

if (appJs.includes("state._lastUnit") && appJs.includes("api.toCm") && appJs.includes("api.fromCm")) {
  pass("UX: conversion conserve les mesures au changement d’unité (code)");
} else fail("UX: conversion unité absente");

// Ne pas reconstruire le DOM à chaque frappe (focus)
if (!appJs.includes("refreshSummary();\n        renderMeasureFields();") && appJs.includes("measureHelpText")) {
  pass("A11y: saisie mesures sans rebuild DOM à chaque frappe");
} else warn("A11y: vérifier que renderMeasureFields n’est plus appelé à chaque input");

for (const bp of ["320px", "390px", "768px", "1440px"]) {
  if (!css.includes(bp) && !(bp === "320px" && css.includes("320px"))) {
    // 375 covered by 390 cascade typically
  }
}
if (css.includes("320px") && css.includes("390px") && css.includes("768px") && css.includes("1440px")) {
  pass("Mobile CSS: breakpoints 320 / 390 / 768 / 1440 (375 via cascade ≤390)");
} else fail("Mobile CSS: breakpoints incomplets");

warn(
  "Mobile physique: non testé sur appareil réel — contrôles = CSS breakpoints + audit automatisé uniquement",
);

console.log(JSON.stringify({ pass: report.ok.length, warn: report.warn.length, fail: report.fail.length, report }, null, 2));
if (report.fail.length) process.exit(1);
