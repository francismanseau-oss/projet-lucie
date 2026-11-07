/**
 * Construit le dossier docs/ = contenu UNIQUE destiné à GitHub Pages.
 * N’inclut PAS worker, inventory, shipping, guides, orders, scripts serveur.
 * Ne pousse rien — préparation locale seulement.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");

const PUBLIC_FILES = [
  "index.html",
  "boutique.html",
  "panier.html",
  "paiement.html",
  "commande-confirmee.html",
  "commande-annulee.html",
  "creations.html",
  "creations-personnalisees.html",
  "creations-personnalisees.css",
  "creations-personnalisees.js",
  "sur-mesure.html",
  "sur-mesure.css",
  "sur-mesure-app.js",
  "sur-mesure-pricing.js",
  "lucie.html",
  "contact.html",
  "contact-suggestion.js",
  "style.css",
  "site.js",
  "cart-i18n.js",
  "product-codes.js",
  "product-sizes.js",
  "size-guide.js",
  "politique-garantie.html",
  "checkout-config.js",
  "favicon.png",
  "favicon-32.png",
  "favicon.svg",
  "apple-touch-icon.png",
  "robots.txt",
  "sitemap.xml",
  "serve.json",
];

const PUBLIC_DIRS = [
  "assets",
  "produits",
  "categories",
  "images",
];

const FORBIDDEN_IN_DOCS = [
  "worker",
  "inventory",
  "shipping",
  "orders",
  "guides",
  "scripts",
  "seo",
  "node_modules",
  ".dev.vars",
  "wrangler.toml",
  "admin-orders.json",
];

function rmDirContents(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

// 1) Régénérer SEO (chemins relatifs) à la racine projet
const seo = spawnSync(process.execPath, [path.join(root, "scripts/generate-seo.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (seo.status !== 0) {
  console.error(seo.stderr || seo.stdout);
  process.exit(seo.status || 1);
}

// 2) Vider docs/ puis copier uniquement le public
rmDirContents(outDir);

const copied = [];
for (const f of PUBLIC_FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.warn("skip missing", f);
    continue;
  }
  copyFile(src, path.join(outDir, f));
  copied.push(f);
}
for (const d of PUBLIC_DIRS) {
  const src = path.join(root, d);
  if (!fs.existsSync(src)) {
    console.warn("skip missing dir", d);
    continue;
  }
  copyDir(src, path.join(outDir, d));
  copied.push(d + "/");
}

// Catalogue public (tailles + sur-mesure) — pas de secrets
const publicCatalogFiles = [
  "product-sizes.json",
  "size-guide.json",
  "sur-mesure-config.json",
  "sur-mesure-illustrations.json",
  "sur-mesure.json",
  "products.json",
  "product-numbers.json",
];
for (const name of publicCatalogFiles) {
  const src = path.join(root, "catalog", name);
  if (!fs.existsSync(src)) continue;
  copyFile(src, path.join(outDir, "catalog", name));
  copied.push("catalog/" + name);
}

// 3) Notice Pages (lisible si quelqu’un ouvre docs/ sur GitHub)
fs.writeFileSync(
  path.join(outDir, "PAGES-README.txt"),
  `Les Fourrures Boréales — contenu GitHub Pages UNIQUEMENT
========================================================
Ce dossier "docs/" est prévu comme source GitHub Pages (Settings → Pages → Folder: /docs).

Inclus : pages boutique, fiches produits, catégories, assets, SEO.
Exclus : worker, inventory, shipping, guides, orders, scripts, secrets.

Ne pas y déposer de clés Stripe / Resend / Cloudflare.
Généré localement par : node scripts/build-pages-site.mjs
Aucun push automatique.
`,
);

// 4) Garde-fous : rien d’interdit dans docs/
const leaks = [];
function walk(dir, rel = "") {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (FORBIDDEN_IN_DOCS.includes(ent.name)) leaks.push(r);
    if (ent.isDirectory()) walk(path.join(dir, ent.name), r);
  }
}
walk(outDir);

const produitCount = fs.existsSync(path.join(outDir, "produits"))
  ? fs.readdirSync(path.join(outDir, "produits")).filter((f) => f.endsWith(".html")).length
  : 0;
const catCount = fs.existsSync(path.join(outDir, "categories"))
  ? fs.readdirSync(path.join(outDir, "categories")).filter((f) => f.endsWith(".html")).length
  : 0;
const sitemap = fs.readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;

console.log(
  JSON.stringify(
    {
      ok: leaks.length === 0,
      out: "docs/",
      copied,
      produits: produitCount,
      categories: catCount,
      sitemap_urls: sitemapUrls,
      forbidden_leaks: leaks,
    },
    null,
    2,
  ),
);

if (leaks.length) process.exit(2);
if (produitCount !== 65 || catCount !== 7 || sitemapUrls < 78) {
  console.error("Contrôle quantités SEO échoué");
  process.exit(3);
}
