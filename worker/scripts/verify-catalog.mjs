import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(path.join(root, "boutique.html"), "utf8");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"),
);

const fromHtml = new Map();
for (const m of html.matchAll(/data-id="([^"]+)"[^>]*data-price="([^"]+)"/g)) {
  fromHtml.set(m[1], Math.round(Number(m[2]) * 100));
}
// boutique order is data-id then data-price on same button — also try reverse order patterns
for (const m of html.matchAll(/data-price="([^"]+)"[^>]*data-id="([^"]+)"/g)) {
  fromHtml.set(m[2], Math.round(Number(m[1]) * 100));
}

let mismatches = 0;
let missing = 0;
for (const p of catalog.products) {
  if (!fromHtml.has(p.id)) {
    console.error("MISSING IN HTML", p.id);
    missing++;
    continue;
  }
  if (fromHtml.get(p.id) !== p.price_cad_cents) {
    console.error("PRICE MISMATCH", p.id, fromHtml.get(p.id), p.price_cad_cents);
    mismatches++;
  }
}

console.log(
  JSON.stringify(
    {
      html_ids: fromHtml.size,
      catalog: catalog.products.length,
      mismatches,
      missing,
      ok: mismatches === 0 && missing === 0 && fromHtml.size === catalog.products.length,
    },
    null,
    2,
  ),
);
if (mismatches || missing || fromHtml.size !== catalog.products.length) process.exit(1);
