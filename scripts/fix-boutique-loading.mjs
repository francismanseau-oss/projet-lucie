/**
 * Corrige la stratégie de chargement boutique :
 * - fetchpriority=high seulement pour les 2 premières cartes (1re rangée mobile 2-col / candidates LCP)
 * - loading=eager seulement pour ces 2 ; tout le reste lazy
 * - pas de fetchpriority=low superflu (laisse le navigateur décider)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "boutique.html");
let html = fs.readFileSync(file, "utf8");

const re =
  /<picture><source type="image\/webp" srcset="([^"]+)"><img src="([^"]+)" alt="([^"]*)" loading="[^"]*" decoding="async"(?: fetchpriority="[^"]*")? width="(\d+)" height="(\d+)"><\/picture>/g;

let i = 0;
html = html.replace(re, (_, webp, png, alt, w, h) => {
  const n = i++;
  const priority = n < 2;
  const loading = priority ? "eager" : "lazy";
  const fp = priority ? ' fetchpriority="high"' : "";
  return (
    `<picture>` +
    `<source type="image/webp" srcset="${webp}">` +
    `<img src="${png}" alt="${alt}" loading="${loading}" decoding="async"${fp} width="${w}" height="${h}">` +
    `</picture>`
  );
});

if (i !== 66) {
  console.error("Attendu 66 pictures, obtenu", i);
  process.exit(1);
}

fs.writeFileSync(file, html);
console.log(
  JSON.stringify({
    pictures: i,
    eager_high: 2,
    lazy: 64,
    rationale:
      "Mobile ~2 col: 2 cartes 1re rangée visibles ; desktop 4 col: 2 high suffisent pour LCP sans forcer 8 téléchargements",
  }),
);
