/**
 * Sync titres boutique HTML ↔ products.json (FR/EN), sans grandeurs dans le titre.
 * Local only — ne touche pas aux prix, photos, descriptions, stocks.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function cleanTitle(name) {
  return String(name || "")
    .replace(/\s*[—\-–]\s*(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/\b(M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/(?:^|[\s—\-–])(S|M|L|XL|P|G|TG)(?=$|[\s—\-–])/gi, " ")
    .replace(/\bpointure\s+/gi, "")
    .replace(/\bsize\s+/gi, "")
    .replace(/\b\d+\s*[-–àato]+\s*\d+\s*ans?\b/gi, "")
    .replace(/\b\d+\s*[-–to]+\s*\d+\s*(years?|yrs?|months?)\b/gi, "")
    .replace(/\b\d+\s*[-–]\s*\d+\s*mois\b/gi, "")
    .replace(/\b\d+\s*mois\b/gi, "")
    .replace(/\b(8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10|8-14|13-1|2-3|2-4|4-6|6-8|10-11)\b/gi, "")
    .replace(/\s*[—\-–]\s*[—\-–]+/g, " — ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[—\-–]\s*$/g, "")
    .replace(/^\s*[—\-–]\s*/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const productsPath = join(root, "catalog/products.json");
const productsDoc = JSON.parse(readFileSync(productsPath, "utf8"));
let html = readFileSync(join(root, "boutique.html"), "utf8");

const byId = new Map(productsDoc.products.map((p) => [p.id, p]));
const report = [];

html = html.replace(
  /<article class="shop-product"([^>]*)>([\s\S]*?)<\/article>/g,
  (full, attrs, body) => {
    const id = ((attrs.match(/data-product-id="([^"]+)"/) || [])[1]) || "";
    const p = byId.get(id);
    if (!p) {
      report.push({ id, status: "skip_no_product" });
      return full;
    }

    const h3m = body.match(/<h3([^>]*)>([\s\S]*?)<\/h3>/);
    const oldFr = ((h3m?.[1] || "").match(/data-fr="([^"]*)"/) || [])[1] || "";
    const oldEn = ((h3m?.[1] || "").match(/data-en="([^"]*)"/) || [])[1] || "";

    const fr = cleanTitle(p.name_fr || oldFr);
    let enName = p.name_en ? cleanTitle(p.name_en) : cleanTitle(oldEn);
    if (!enName) enName = fr;
    p.name_fr = fr;
    p.name_en = enName;

    let nextAttrs = attrs;
    if (/data-name="/.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/data-name="[^"]*"/, `data-name="${escAttr(fr)}"`);
    } else {
      nextAttrs += ` data-name="${escAttr(fr)}"`;
    }

    let nextBody = body;
    if (h3m) {
      let h3attrs = h3m[1];
      if (/data-fr="/.test(h3attrs)) h3attrs = h3attrs.replace(/data-fr="[^"]*"/, `data-fr="${escAttr(fr)}"`);
      else h3attrs += ` data-fr="${escAttr(fr)}"`;
      if (/data-en="/.test(h3attrs)) h3attrs = h3attrs.replace(/data-en="[^"]*"/, `data-en="${escAttr(enName)}"`);
      else h3attrs += ` data-en="${escAttr(enName)}"`;
      nextBody = nextBody.replace(h3m[0], `<h3${h3attrs}>${fr}</h3>`);
    }

    nextBody = nextBody.replace(
      /(<button\b[^>]*class="demo-add"[^>]*data-name=")[^"]*(")/,
      `$1${escAttr(fr)}$2`,
    );

    report.push({
      n: p.product_number,
      id,
      fr,
      en: enName,
      changed: oldFr !== fr || oldEn !== enName,
    });
    return `<article class="shop-product"${nextAttrs}>${nextBody}</article>`;
  },
);

// JSON-LD ItemList names
html = html.replace(
  /("url":"https:\/\/lesfourruresboreales\.ca\/produits\/)([^"]+)(","name":")([^"]*)(")/g,
  (full, a, id, b, _old, c) => {
    const p = byId.get(id);
    if (!p) return full;
    return `${a}${id}${b}${escAttr(p.name_fr)}${c}`;
  },
);

writeFileSync(join(root, "boutique.html"), html);
writeFileSync(productsPath, JSON.stringify(productsDoc, null, 2) + "\n");

const changed = report.filter((r) => r.changed).length;
console.log("cards", report.length, "titles_changed", changed);
console.log(
  "sample",
  report.filter((r) => r.changed).slice(0, 8).map((r) => `#${r.n} ${r.fr}`),
);
