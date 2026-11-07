/**
 * Articles ambigus à signaler avant uniformisation boutique.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "boutique.html"), "utf8");
const products = JSON.parse(readFileSync(join(root, "catalog/products.json"), "utf8")).products;
const sizes = JSON.parse(readFileSync(join(root, "catalog/product-sizes.json"), "utf8")).products;
const LETTERS = new Set(["S", "M", "L", "XL"]);

function stripSize(s) {
  return String(s || "")
    .replace(/\s*[—\-–]\s*(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/\b(M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/(?:^|[\s—\-–])(S|M|L|XL|P|G|TG)(?=$|[\s—\-–])/gi, " ")
    .replace(/\b\d+\s*[-–àa]\s*\d+\s*ans?\b/gi, "")
    .replace(/\b(8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10|8-14|13-1|2-4|4-6|6-8)\b/gi, "")
    .replace(/\b\d+\s*[-–]\s*\d+\s*mois\b/gi, "")
    .replace(/\b\d+\s*mois\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[—\-–]\s*$/g, "")
    .replace(/^\s*[—\-–]\s*/g, "")
    .trim()
    .toLowerCase();
}

function norm(s) {
  return stripSize(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const cards = [];
const re =
  /<article class="shop-product"[^>]*data-product-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g;
let m;
while ((m = re.exec(html))) {
  const id = m[1];
  const body = m[2];
  const n = Number((body.match(/N°\s*(\d+)/) || [])[1] || 0);
  const h3 = body.match(/<h3([^>]*)>/);
  const fr = ((h3?.[1] || "").match(/data-fr="([^"]*)"/) || [])[1] || "";
  const en = ((h3?.[1] || "").match(/data-en="([^"]*)"/) || [])[1] || "";
  cards.push({ id, n, fr, en });
}

const ambiguous = [];
const clearLetter = [];
const clearInfo = [];
const clearSpecial = [];

for (const c of cards) {
  const p = products.find((x) => x.id === c.id);
  const cfg = sizes[c.id];
  const codes = (cfg?.sizes || []).map((s) => String(s.code || ""));
  const letterish = codes.length && codes.every((code) => LETTERS.has(code.toUpperCase()));
  const issues = [];

  if (!p) issues.push("missing_product_json");
  if (!cfg) issues.push("missing_sizes");
  if (p && norm(p.name_fr) && norm(c.fr) && norm(p.name_fr) !== norm(c.fr)) {
    // beyond size tokens — identity mismatch
    const a = norm(p.name_fr);
    const b = norm(c.fr);
    if (a !== b) issues.push(`title_identity_html≠json html="${c.fr}" json="${p.name_fr}"`);
  }
  if (letterish) {
    const stocked = (cfg.sizes || []).filter((s) => Number(s.qty_on_hand) > 0);
    if (!stocked.length) issues.push("letter_no_positive_stock");
    // M-L in id but only one letter in sizes — OK per Lucie corrections, not ambiguous
  }
  if (cfg?.adapted_contact) {
    clearSpecial.push({ n: c.n, id: c.id, kind: "adapted" });
    continue;
  }
  if (codes.some((x) => x.toUpperCase() === "UNIQUE")) {
    clearSpecial.push({ n: c.n, id: c.id, kind: "unique", codes });
    continue;
  }
  // baby mukluks / cache-oreilles flagged as special handling but not ambiguous if codes exist
  if (p?.category === "mukluks" && /bebe|bébé|baby/i.test(c.id + c.fr + (p.name_fr || ""))) {
    clearSpecial.push({ n: c.n, id: c.id, kind: "baby_mukluk", codes });
    continue;
  }
  if (p?.category === "cache-oreilles") {
    clearSpecial.push({ n: c.n, id: c.id, kind: "cache-oreilles", codes });
    continue;
  }

  if (issues.length) {
    ambiguous.push({
      n: c.n,
      id: c.id,
      cat: p?.category,
      html_fr: c.fr,
      json_fr: p?.name_fr,
      sizes: (cfg?.sizes || []).map((s) => `${s.code}:${s.qty_on_hand ?? "?"}`).join(", "),
      issues,
    });
  } else if (letterish) {
    clearLetter.push({
      n: c.n,
      id: c.id,
      stock: (cfg.sizes || []).map((s) => `${s.code}:${s.qty_on_hand ?? "?"}`).join(", "),
      title: p.name_fr,
    });
  } else {
    clearInfo.push({
      n: c.n,
      id: c.id,
      cat: p?.category,
      sizes: codes.join(", "),
      title: p?.name_fr,
    });
  }
}

console.log("AMBIGUOUS", ambiguous.length);
for (const a of ambiguous) {
  console.log(`#${a.n} ${a.id}\n  sizes: ${a.sizes}\n  → ${a.issues.join(" | ")}\n`);
}
console.log("CLEAR letter", clearLetter.length, "info", clearInfo.length, "special", clearSpecial.length);
console.log(
  "special kinds",
  clearSpecial.reduce((acc, x) => {
    acc[x.kind] = (acc[x.kind] || 0) + 1;
    return acc;
  }, {}),
);
