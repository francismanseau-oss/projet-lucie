/**
 * Audit boutique : titre propre + UI tailles type article 106.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(readFileSync(join(root, "catalog/products.json"), "utf8")).products;
const sizesDoc = JSON.parse(readFileSync(join(root, "catalog/product-sizes.json"), "utf8"));
const sizes = sizesDoc.products || {};

const LETTERS = ["S", "M", "L", "XL"];
const FIXED = new Set([
  "chapeau-dame-m-l-coyote",
  "chapeau-dame-m-l-fourrure-recyclee",
  "chapeau-dame-m-l-renard-argente",
  "chapeau-dame-m-l-renard-norvegien",
  "chapeau-dame-m-l-renard-roux",
  "chapeau-dame-m-l-vison",
  "chapeau-dame-vison-et-renard",
  "chapeau-homme-m-l-renard-roux",
  "chapeau-homme-l-xl-raton",
  "mitaines-dame-m-l-chat-sauvage",
  "mitaines-dame-m-l-fourrure-recyclee",
  "mitaines-dame-renard-roux",
  "mitaines-dame-vison-et-renard",
  "mitaines-homme-m-l-castor",
  "mitaines-homme-m-l-coyote",
  "mitaines-homme-m-l-renard-roux",
  "mitaines-small-vison",
  "mitaines-m-renard",
  "mitaines-motoneige-m-renard-argente",
  "mitaines-m-l-renard",
  "mitaines-m-l-vison-et-chat-sauvage",
  "mitaines-m-l-vison-et-renard",
  "mitaines-motoneige-m-l-renard-norvegien",
  "mitaines-style-inuit-coyote",
]);

function titleSizeTokens(name) {
  const s = String(name || "");
  const hits = [];
  const re =
    /(?:^|[\s—\-–])(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL|8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10)(?:\s*mois)?(?=$|[\s—\-–])/gi;
  let m;
  while ((m = re.exec(s))) hits.push(m[1]);
  if (/\b\d+\s*[-–àa]\s*\d+\s*ans?\b/i.test(s)) hits.push("age-words");
  return [...new Set(hits.map((x) => String(x).toUpperCase()))];
}

function letterScale(cfg, id) {
  if (FIXED.has(id)) return false;
  return !!(
    cfg &&
    cfg.sizes &&
    cfg.sizes.length &&
    cfg.sizes.every((sz) => LETTERS.includes(String(sz.code || "").toUpperCase()))
  );
}

function uiMode(cfg, id) {
  if (!cfg) return "NO_SIZES_ENTRY";
  if (cfg.adapted_contact) return "adapted";
  const letter = letterScale(cfg, id);
  if ((cfg.selector && cfg.sizes && cfg.sizes.length > 1) || letter) {
    if (letter) return "LETTER_GRID";
    if (cfg.size_groups) return "SIZE_GROUPS";
    return "MULTI_CHOICE";
  }
  const only = cfg.sizes && cfg.sizes[0];
  if (only && only.code === "unique") return "UNIQUE";
  if (only) return "SINGLE:" + only.code + (FIXED.has(id) ? "+FIXED" : "");
  return "EMPTY";
}

function desiredMode(cfg, id, cat) {
  if (!cfg) return "NEED_CONFIG";
  if (cfg.adapted_contact || id.includes("mobilite-reduite")) return "adapted";
  const codes = (cfg.sizes || []).map((s) => String(s.code || "").toUpperCase());
  if (!codes.length) return "NEED_CONFIG";
  if (codes.every((c) => c === "UNIQUE")) return "unique_info";
  if (codes.every((c) => LETTERS.includes(c))) return "LETTER_GRID";
  // age / pointure / other informational
  return "INFO_SIZES";
}

function cleanTitleGuess(name) {
  return String(name || "")
    .replace(/\s*[—\-–]\s*(S|M|L|XL|P|G|TG|M-L|L-XL|M\/L|L\/XL)\b/gi, "")
    .replace(/\b(S|M|L|XL|P|G|TG|M-L|L-XL)\b(?=\s*[—\-–]|\s+renard|\s+castor|\s+coyote|\s+vison|\s+raton|\s+chat|\s+fourrure|\s*$)/gi, "")
    .replace(/\b\d+\s*[-–àa]\s*\d+\s*ans?\b/gi, "")
    .replace(/\b(8-10|8-12|10-12|0-12|0-6|6-12|12-24|6-9|7-8|8-9|9-10)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[—\-–]\s*$/g, "")
    .replace(/^\s*[—\-–]\s*/g, "")
    .trim();
}

const rows = [];
for (const p of products.filter((x) => x.active !== false)) {
  const cfg = sizes[p.id];
  const codes = (cfg && cfg.sizes ? cfg.sizes : [])
    .map((s) => `${s.code}:${s.qty_on_hand ?? "?"}`)
    .join(", ");
  const tokens = titleSizeTokens(p.name_fr);
  const mode = uiMode(cfg, p.id);
  const desired = desiredMode(cfg, p.id, p.category);
  const gaps = [];
  if (tokens.length) gaps.push("TITLE:" + tokens.join("+"));
  if (desired === "LETTER_GRID" && mode !== "LETTER_GRID") {
    gaps.push("UI_WANT_LETTER_GOT_" + mode);
  }
  if (desired === "INFO_SIZES" && !(mode === "MULTI_CHOICE" || mode === "SIZE_GROUPS" || mode.startsWith("SINGLE:"))) {
    gaps.push("UI_WANT_INFO_GOT_" + mode);
  }
  if (desired === "NEED_CONFIG") gaps.push("NO_CONFIG");
  if (FIXED.has(p.id) && desired === "LETTER_GRID") gaps.push("FIXED_BLOCKS_GRID");
  // single letter size without full grid = user complaint
  if (mode.startsWith("SINGLE:") && LETTERS.includes(String(cfg.sizes[0].code).toUpperCase())) {
    gaps.push("SINGLE_LETTER_NOT_GRID");
  }
  rows.push({
    n: p.product_number,
    id: p.id,
    cat: p.category,
    name_fr: p.name_fr,
    name_en: p.name_en || "",
    title_clean_guess_fr: cleanTitleGuess(p.name_fr),
    codes,
    mode,
    desired,
    gap: gaps.join(" | ") || "OK",
    fixed: FIXED.has(p.id),
    selector: !!(cfg && cfg.selector),
  });
}

rows.sort((a, b) => (a.n || 0) - (b.n || 0));
const bad = rows.filter((r) => r.gap !== "OK");
const ok = rows.filter((r) => r.gap === "OK");

const out = {
  total: rows.length,
  ok: ok.length,
  gaps: bad.length,
  bad,
  ok_ids: ok.map((r) => r.n + " " + r.name_fr),
  by_desired: {},
};
for (const r of rows) {
  out.by_desired[r.desired] = (out.by_desired[r.desired] || 0) + 1;
}

writeFileSync(join(root, "scripts/audit-boutique-sizes-out.json"), JSON.stringify(out, null, 2));
console.log("TOTAL", out.total, "OK", out.ok, "GAP", out.gaps);
console.log("by_desired", out.by_desired);
console.log("\n=== TOUS LES ÉCARTS ===");
for (const r of bad) {
  console.log(
    `#${r.n} [${r.cat}] ${r.name_fr}\n  mode=${r.mode} desired=${r.desired}\n  sizes=[${r.codes}]\n  → ${r.gap}\n  titre proposé: ${r.title_clean_guess_fr}\n`,
  );
}
