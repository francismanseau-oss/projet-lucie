/**
 * Remplace les <img> produits boutique par <picture> WebP + fallback PNG.
 * Premières cartes visibles : fetchpriority=high, loading=eager.
 * Autres : lazy + async.
 * Ne touche pas data-fr/en, boutons, ids, prix.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "boutique.html");
const webpDir = path.join(root, "assets", "produits", "webp");

let html = fs.readFileSync(file, "utf8");
const imgRe =
  /<img src="(assets\/produits\/([^"]+\.png))" alt="([^"]*)" loading="lazy">/g;

let index = 0;
let missing = [];
let replaced = 0;

html = html.replace(imgRe, (full, pngSrc, fileName, alt) => {
  const stem = fileName.replace(/\.png$/i, "");
  const webpRel = `assets/produits/webp/${stem}.webp`;
  const webpAbs = path.join(webpDir, `${stem}.webp`);
  if (!fs.existsSync(webpAbs)) {
    missing.push(fileName);
    return full;
  }
  const eager = index < 8; // ~2 rangées desktop / grille
  index += 1;
  replaced += 1;
  const loading = eager ? "eager" : "lazy";
  const prio = eager ? ' fetchpriority="high"' : ' fetchpriority="low"';
  return (
    `<picture>` +
    `<source type="image/webp" srcset="${webpRel}">` +
    `<img src="${pngSrc}" alt="${alt}" loading="${loading}" decoding="async"${prio} width="800" height="600">` +
    `</picture>`
  );
});

if (missing.length) {
  console.error("WebP manquants:", missing);
  process.exit(1);
}

fs.writeFileSync(file, html);
console.log(JSON.stringify({ replaced, eager_first: Math.min(8, replaced), missing: 0 }));
