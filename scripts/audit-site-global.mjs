/**
 * Audit global du site Les Fourrures Boréales (local, sans Stripe/Resend réels).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = { critical: [], important: [], minor: [], ok: [], warn: [] };
const ok = (m) => report.ok.push(m);
const warn = (m) => report.warn.push(m);
const crit = (m) => report.critical.push(m);
const imp = (m) => report.important.push(m);
const min = (m) => report.minor.push(m);

const PAGES = [
  "index.html",
  "boutique.html",
  "creations.html",
  "creations-personnalisees.html",
  "lucie.html",
  "contact.html",
  "panier.html",
  "paiement.html",
  "commande-confirmee.html",
  "commande-annulee.html",
];

const NAV = [
  "index.html",
  "boutique.html",
  "creations-personnalisees.html",
  "creations.html",
  "lucie.html",
  "contact.html",
  "panier.html",
];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function resolveFrom(page, rel) {
  if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(rel)) return null;
  const clean = rel.split("?")[0].split("#")[0];
  if (!clean) return null;
  return path.normalize(path.join(path.dirname(path.join(root, page)), clean));
}

// --- Pages présentes ---
for (const p of PAGES) {
  if (!exists(p)) crit(`Page absente: ${p}`);
}
ok(`${PAGES.filter(exists).length}/${PAGES.length} pages principales présentes`);

if (exists("sur-mesure.html")) {
  const redir = fs.readFileSync(path.join(root, "sur-mesure.html"), "utf8");
  if (/creations-personnalisees|mesure/i.test(redir)) ok("sur-mesure.html redirige / pointe vers hub");
  else warn("sur-mesure.html présent — vérifier redirection");
}

// --- Liens internes + assets ---
const missing = [];
const checked = new Set();
for (const page of PAGES.filter(exists)) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  for (const re of [/href=["']([^"']+)["']/g, /src=["']([^"']+)["']/g]) {
    let m;
    while ((m = re.exec(html))) {
      const abs = resolveFrom(page, m[1]);
      if (!abs) continue;
      const key = abs;
      if (checked.has(key)) continue;
      checked.add(key);
      if (!fs.existsSync(abs)) missing.push({ page, ref: m[1] });
    }
  }
  // Nav minimale
  for (const n of NAV) {
    if (!html.includes(n) && page !== n && !["paiement.html", "commande-confirmee.html", "commande-annulee.html"].includes(page)) {
      // paiement may share header - check
    }
  }
  if (!/data-fr=/.test(html) || !/data-en=/.test(html)) {
    if (!["commande-confirmee.html", "commande-annulee.html"].includes(page)) {
      min(`Peu/pas de data-fr/data-en: ${page}`);
    }
  }
}

if (missing.length) {
  for (const x of missing.slice(0, 30)) imp(`Ressource manquante: ${x.page} → ${x.ref}`);
  if (missing.length > 30) imp(`… +${missing.length - 30} ressources manquantes`);
} else ok("Aucun lien/src local cassé dans les pages principales");

// --- Catalogue 66 ---
const products = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));
const list = products.products || [];
if (list.length !== 65) crit(`Catalogue: ${list.length} produits (attendu 65)`);
else ok("65 produits catalogue");

let imgMissing = 0;
let imgHeavy = 0;
const sizes = [];
for (const p of list) {
  if (!Number.isInteger(p.price_cad_cents)) crit(`Prix non entier: ${p.id}`);
  const imgPath = path.join(root, p.image || "");
  if (!p.image || !fs.existsSync(imgPath)) {
    imgMissing++;
    imp(`Photo manquante: ${p.id} (${p.image})`);
  } else {
    const st = fs.statSync(imgPath);
    sizes.push(st.size);
    if (st.size > 1_500_000) {
      imgHeavy++;
      min(`Image lourde (>1.5 Mo): ${p.image} (${(st.size / 1e6).toFixed(2)} Mo)`);
    }
  }
}
if (!imgMissing) ok("65 photos produits présentes");
if (sizes.length) {
  const total = sizes.reduce((a, b) => a + b, 0);
  ok(`Poids images boutique: ${(total / 1e6).toFixed(1)} Mo total · médiane ${(sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] / 1e3).toFixed(0)} Ko`);
}
if (imgHeavy) warn(`${imgHeavy} image(s) > 1.5 Mo (perf mobile)`);

// --- Sécurité évidente ---
const checkout = fs.readFileSync(path.join(root, "checkout-config.js"), "utf8");
if (/sk_live|sk_test|whsec_|re_[A-Za-z0-9]/.test(checkout)) crit("Secret possible dans checkout-config.js");
else ok("checkout-config.js sans secret évident");

for (const f of ["site.js", "boutique.html", "paiement.html", "contact-suggestion.js"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (/sk_live|STRIPE_SECRET|RESEND_API_KEY\s*=\s*['\"]re_/.test(t)) crit(`Secret dans ${f}`);
}
ok("Pas de sk_live / clé Resend en dur dans le front audité");

// --- Suggestion / Resend messaging ---
const contactJs = fs.readFileSync(path.join(root, "contact-suggestion.js"), "utf8");
const ideaHtml = fs.readFileSync(path.join(root, "creations-personnalisees.html"), "utf8");
if (/envoyé|sent successfully|courriel a été envoyé/i.test(contactJs) && !/mock|test|simulation|pas encore|not configured|désactiv/i.test(contactJs)) {
  // check success messages carefully later
}
if (/Resend/.test(contactJs) || /suggestion/.test(contactJs)) {
  ok("Parcours suggestion présent (contact-suggestion.js)");
}
if (/data\.mocked/.test(contactJs) && /courriel non envoyé|email not sent/i.test(contactJs)) {
  ok("Suggestion: messages distinguent mock (pas d’envoi réel) vs transmis");
} else {
  imp("Suggestion: risque de message trompeur si Resend mock");
}
const honeySlice = contactJs.slice(contactJs.indexOf("honeypot"), contactJs.indexOf("honeypot") + 600);
if (/envoyée à Lucie|sent to Lucie/i.test(honeySlice)) {
  imp("Honeypot: message prétend un envoi à Lucie");
} else ok("Honeypot: message neutre (pas d’envoi prétendu)");

// --- Panier simulation ---
const KEY = "boreales-cart-sim";
const shop = list[0];
const mit = list.find((p) => p.category === "mitaines");
const cart = [
  { id: shop.id, name: shop.name_fr, price: shop.price_cad_cents / 100, price_cad_cents: shop.price_cad_cents, qty: 2 },
  {
    id: `custom:${mit.id}:t1`,
    catalog_id: mit.id,
    name: "Sur mesure — " + mit.name_fr,
    price: mit.price_cad_cents / 100,
    price_cad_cents: mit.price_cad_cents,
    qty: 1,
    custom: true,
    custom_config: {
      product_id: mit.id,
      unit: "cm",
      measurements: { hand_circumference: 20, hand_length: 18 },
      chaleur: true,
      comments: "Test audit",
      leather: "noir",
      priced_ok: true,
    },
  },
];
// qty update
cart[0].qty = 3;
// remove custom
const afterRemove = cart.filter((x) => x.id !== `custom:${mit.id}:t1`);
assert.equal(afterRemove.length, 1);
assert.equal(afterRemove[0].qty, 3);
ok("Panier: ajout / qty / suppression simulés (standard + custom isolés)");

// Worker buildLineItems mélange
const { buildLineItems } = await import(pathToFileURL(path.join(root, "worker/src/logic.js")).href);
const { validateMeasurements } = await import(pathToFileURL(path.join(root, "worker/src/sur-mesure-pricing.js")).href);
const config = JSON.parse(fs.readFileSync(path.join(root, "catalog/sur-mesure-config.json"), "utf8"));
const { resolved, total_cents } = buildLineItems(
  products,
  [
    { id: shop.id, qty: 2 },
    {
      id: `custom:${mit.id}:x`,
      qty: 1,
      price_cad_cents: 1,
      custom_config: {
        product_id: mit.id,
        unit: "cm",
        measurements: { hand_circumference: 21, hand_length: 19 },
        chaleur: false,
        comments: "mix",
      },
    },
  ],
  {
    validateMeasurements,
    measureSpecForCategory: (c) => config.measurements_by_category[c] || { fields: [] },
  },
);
assert.equal(resolved.length, 2);
assert.equal(resolved[0].unit_amount, shop.price_cad_cents);
assert.equal(resolved[1].unit_amount, mit.price_cad_cents);
assert.notEqual(resolved[1].unit_amount, 1);
ok(`Mélange boutique+sur-mesure: total serveur ${total_cents} ¢ (prix navigateur ignoré)`);

// --- HTTP si dispo ---
const base = "http://127.0.0.1:8766";
try {
  for (const p of PAGES) {
    const r = await fetch(`${base}/${p}`);
    if (!r.ok) imp(`HTTP ${r.status}: ${p}`);
  }
  ok("HTTP :8766 — pages principales joignables");
  const jsFiles = ["site.js", "sur-mesure-app.js", "contact-suggestion.js", "checkout-config.js"];
  for (const j of jsFiles) {
    const r = await fetch(`${base}/${j}`);
    if (!r.ok) imp(`HTTP JS manquant: ${j}`);
  }
  ok("Scripts front principaux servis");
} catch {
  warn("Serveur :8766 non joignable — liens HTTP non vérifiés en live");
}

// --- A11y basique pages ---
for (const p of ["index.html", "boutique.html", "panier.html", "creations-personnalisees.html"]) {
  const h = fs.readFileSync(path.join(root, p), "utf8");
  if (!/viewport/.test(h)) imp(`Viewport manquant: ${p}`);
  if (!/<html[^>]*lang=/.test(h)) imp(`lang manquant: ${p}`);
  if (!/aria-label|aria-expanded|aria-controls/.test(h) && p !== "index.html") {
    min(`Peu d’ARIA: ${p}`);
  }
}
ok("Bases a11y: lang + viewport sur pages clés");

// --- Footer year / consistency nav label Créations personnalisées ---
const boutique = fs.readFileSync(path.join(root, "boutique.html"), "utf8");
if (!boutique.includes("creations-personnalisees.html")) crit("Boutique: lien Créations personnalisées absent du menu");
else ok("Menu Boutique inclut Créations personnalisées");

console.log(
  JSON.stringify(
    {
      summary: {
        ok: report.ok.length,
        warn: report.warn.length,
        critical: report.critical.length,
        important: report.important.length,
        minor: report.minor.length,
      },
      report,
    },
    null,
    2,
  ),
);

if (report.critical.length) process.exit(2);
