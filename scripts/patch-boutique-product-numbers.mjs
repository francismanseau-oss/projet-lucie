/**
 * Pastille N° hors des éléments data-fr/data-en (sinon i18n écrase le badge).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const numbers = JSON.parse(
  fs.readFileSync(path.join(root, "catalog/product-numbers.json"), "utf8"),
);
const byId = new Map(numbers.items.map((i) => [i.product_id, i.product_number]));

const boutiquePath = path.join(root, "boutique.html");
let html = fs.readFileSync(boutiquePath, "utf8");

if (!html.includes("product-codes.js")) {
  html = html.replace(
    '<script src="site.js" defer></script>',
    '<script src="product-codes.js"></script><script src="site.js" defer></script>',
  );
}

let patched = 0;
html = html.replace(
  /<article class="shop-product"([^>]*)>([\s\S]*?)<\/article>/g,
  (full, attrs, inner) => {
    const btn = inner.match(/data-id="([^"]+)"/);
    if (!btn) return full;
    const id = btn[1];
    const num = byId.get(id);
    if (num == null) return full;

    let nextInner = inner.replace(
      /data-id="([^"]+)"(?:\s+data-product-number="[^"]*")?/,
      `data-id="$1" data-product-number="${num}"`,
    );
    nextInner = nextInner.replace(/<span class="product-code">N° \d+<\/span>\s*/g, "");

    const badge = `<span class="product-code" aria-label="Numéro produit">N° ${num}</span>`;
    if (/<div class="shop-product-info">/.test(nextInner)) {
      nextInner = nextInner.replace(
        /<div class="shop-product-info">/,
        `<div class="shop-product-info">${badge}`,
      );
    } else {
      nextInner = badge + nextInner;
    }

    patched++;
    return `<article class="shop-product"${attrs}>${nextInner}</article>`;
  },
);

fs.writeFileSync(boutiquePath, html, "utf8");
console.log(JSON.stringify({ patched_cards: patched, expected: 66, ok: patched === 66 }));
