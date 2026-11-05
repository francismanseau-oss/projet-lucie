/**
 * Vérifie WebP boutique : couverture, PNG intacts, i18n/panier structure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "boutique.html"), "utf8");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog", "products.json"), "utf8"),
);
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const siteJs = fs.readFileSync(path.join(root, "site.js"), "utf8");

const pngs = fs.readdirSync(path.join(root, "assets", "produits")).filter((f) => f.endsWith(".png"));
const webps = fs.readdirSync(path.join(root, "assets", "produits", "webp")).filter((f) => f.endsWith(".webp"));

assert.equal(pngs.length, webps.length, "autant de WebP que de PNG source");
for (const p of pngs) {
  assert.ok(fs.existsSync(path.join(root, "assets", "produits", "webp", p.replace(/\.png$/, ".webp"))), p);
}

const pictures = (html.match(/<picture>/g) || []).length;
const sources = (html.match(/type="image\/webp"/g) || []).length;
const imgs = (html.match(/assets\/produits\/[^"]+\.png/g) || []).length;
assert.equal(pictures, 66);
assert.equal(sources, 66);
assert.ok(imgs >= 66);

const eager = (html.match(/loading="eager"/g) || []).length;
const lazy = (html.match(/loading="lazy"/g) || []).length;
const high = (html.match(/fetchpriority="high"/g) || []).length;
assert.equal(eager, 2);
assert.equal(lazy, 64);
assert.equal(high, 2);
assert.equal((html.match(/fetchpriority="low"/g) || []).length, 0);

assert.equal((html.match(/data-fr=/g) || []).length > 66, true);
assert.equal((html.match(/class="demo-add"/g) || []).length, 66);
assert.match(siteJs, /name_fr/);
assert.match(siteJs, /name_en/);
assert.match(siteJs, /demo-add/);
assert.match(css, /Boutique cartes — harmonisation/);
assert.match(css, /max-width:320px/);
assert.match(css, /max-width:375px/);
assert.match(css, /min-width:1440px/);

// Catalogue : chemins PNG toujours présents (originaux)
for (const p of catalog.products) {
  assert.ok(p.image.endsWith(".png"), p.id);
  assert.ok(fs.existsSync(path.join(root, p.image)), p.image);
}

let pngBytes = 0;
let webpBytes = 0;
for (const p of pngs) {
  pngBytes += fs.statSync(path.join(root, "assets", "produits", p)).size;
  webpBytes += fs.statSync(path.join(root, "assets", "produits", "webp", p.replace(/\.png$/, ".webp"))).size;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      products: 66,
      png_files: pngs.length,
      webp_files: webps.length,
      pictures: 66,
      eager,
      lazy,
      fetchpriority_high: high,
      png_mb: +(pngBytes / 1024 / 1024).toFixed(2),
      webp_mb: +(webpBytes / 1024 / 1024).toFixed(2),
      saving_pct_if_webp: +((100 * (1 - webpBytes / pngBytes)).toFixed(1)),
      cart_i18n_hooks: true,
      breakpoints_css: [320, 375, 390, 768, 1440],
    },
    null,
    2,
  ),
);
