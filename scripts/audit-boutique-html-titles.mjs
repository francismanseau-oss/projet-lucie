import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "boutique.html"), "utf8");
const products = JSON.parse(readFileSync(join(root, "catalog/products.json"), "utf8")).products;
const sizes = JSON.parse(readFileSync(join(root, "catalog/product-sizes.json"), "utf8")).products;

const LETTERS = ["S", "M", "L", "XL"];
const FIXED = new Set(); // vidé 2026-11-07 — grille lettres pour tous les S/M/L/XL

function titleHasSize(s) {
  const t = String(s || "");
  return (
    /(?:^|[\s—\-–])(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL)(?=$|[\s—\-–])/i.test(t) ||
    /\b\d+\s*[-–àa]\s*\d+\s*ans?\b/i.test(t) ||
    /\b(8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10|8-14|13-1)\b/i.test(t)
  );
}

function cleanTitle(name) {
  return String(name || "")
    .replace(/\s*[—\-–]\s*(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/\b(M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/(?:^|[\s—\-–])(S|M|L|XL|P|G|TG)(?=$|[\s—\-–])/gi, " ")
    .replace(/\b\d+\s*[-–àa]\s*\d+\s*ans?\b/gi, "")
    .replace(/\b(8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10|8-14|13-1)\b/gi, "")
    .replace(/\s*[—\-–]\s*[—\-–]/g, " — ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[—\-–]\s*$/g, "")
    .replace(/^\s*[—\-–]\s*/g, "")
    .replace(/\s+—\s+—/g, " — ")
    .trim();
}

const cards = [];
const articleRe =
  /<article class="shop-product"[^>]*\bid="produit-([^"]+)"[^>]*data-product-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g;
let m;
while ((m = articleRe.exec(html))) {
  const body = m[3];
  const id = m[2];
  const num = Number(((body.match(/N°\s*(\d+)/) || [])[1]) || 0);
  const h3 = body.match(/<h3([^>]*)>([\s\S]*?)<\/h3>/);
  const attrs = h3 ? h3[1] : "";
  const fr = (attrs.match(/data-fr="([^"]*)"/) || [])[1] || "";
  const en = (attrs.match(/data-en="([^"]*)"/) || [])[1] || "";
  const visible = h3 ? h3[2].replace(/<[^>]+>/g, "").trim() : "";
  const dataName = ((m[0].match(/data-name="([^"]*)"/) || [])[1]) || "";
  cards.push({ id, n: num, fr: fr || visible, en, dataName });
}

const rows = [];
for (const c of cards) {
  const p = products.find((x) => x.id === c.id);
  const cfg = sizes[c.id];
  const sizeCodes = (cfg?.sizes || []).map((s) => `${s.code}:${s.qty_on_hand ?? "?"}`);
  const letterOnly =
    !!cfg?.sizes?.length &&
    cfg.sizes.every((s) => LETTERS.includes(String(s.code || "").toUpperCase()));
  const htmlSized = titleHasSize(c.fr) || titleHasSize(c.dataName);
  const jsonSized = titleHasSize(p?.name_fr);
  const desired =
    cfg?.adapted_contact
      ? "adapted"
      : letterOnly
        ? "LETTER_GRID"
        : cfg?.sizes?.some((s) => String(s.code).toUpperCase() === "UNIQUE")
          ? "unique"
          : cfg?.sizes?.length
            ? "INFO_SIZES"
            : "NEED_CONFIG";

  // Current UI logic approximation
  const blocked = FIXED.has(c.id);
  let ui = "none";
  if (cfg?.adapted_contact) ui = "adapted";
  else if (!blocked && letterOnly) ui = "LETTER_GRID";
  else if (cfg?.selector && cfg.sizes?.length > 1) ui = "MULTI";
  else if (cfg?.sizes?.length === 1) ui = "SINGLE_NOTE";
  else ui = "EMPTY";

  const gaps = [];
  if (htmlSized) gaps.push("HTML_TITLE_SIZE");
  if (jsonSized) gaps.push("JSON_TITLE_SIZE");
  if (p && p.name_fr !== c.fr) gaps.push("HTML_NE_JSON");
  if (desired === "LETTER_GRID" && ui !== "LETTER_GRID") gaps.push("NEED_PMGTG_GOT_" + ui);
  if (desired === "INFO_SIZES" && ui === "none") gaps.push("NEED_INFO");
  // INFO: UI runtime = cases informatives (site.js) — pas d’écart si titre propre

  rows.push({
    n: c.n,
    id: c.id,
    cat: p?.category || "",
    html_fr: c.fr,
    html_en: c.en,
    json_fr: p?.name_fr || "MISSING",
    proposed_fr: cleanTitle(p?.name_fr || c.fr),
    proposed_en: cleanTitle(c.en || p?.name_en || ""),
    sizes: sizeCodes.join(", "),
    desired,
    ui,
    fixed: blocked,
    gap: gaps.join(" | ") || "OK",
  });
}

rows.sort((a, b) => a.n - b.n);
const bad = rows.filter((r) => r.gap !== "OK");
const ok = rows.filter((r) => r.gap === "OK");

console.log("cards", rows.length, "OK", ok.length, "GAP", bad.length);
console.log("\n=== ÉCARTS ===");
for (const r of bad) {
  console.log(
    `#${r.n} [${r.cat}] ui=${r.ui} desired=${r.desired}\n  HTML: ${r.html_fr}\n  JSON: ${r.json_fr}\n  → ${r.gap}\n  sizes: ${r.sizes}\n  proposé: ${r.proposed_fr}\n`,
  );
}

writeFileSync(
  join(root, "scripts/audit-boutique-html-titles-out.json"),
  JSON.stringify({ total: rows.length, ok: ok.length, gaps: bad.length, bad, all: rows }, null, 2),
);
