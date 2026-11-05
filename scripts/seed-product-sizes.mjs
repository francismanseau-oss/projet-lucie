#!/usr/bin/env node
/**
 * Génère catalog/product-sizes.json + sync lucie-inventory.
 * Formats combinés (M-L, L-XL, pointures 7-8…) → sélecteur + inventaire distinct par grandeur.
 * Pas de nouveaux product_id / prix. Pas de XL/XXL hors formats déjà nommés (L-XL).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { displaySizeLabels } from "../worker/src/product-sizes-core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(readFileSync(join(root, "catalog", "products.json"), "utf8")).products;
const invPath = join(root, "inventory", "admin", "data", "lucie-inventory.json");
const inv = JSON.parse(readFileSync(invPath, "utf8"));

const QTY = 3;

function labeled(code, extra = null) {
  const L = displaySizeLabels(code, extra);
  return { code, label_fr: L.fr, label_en: L.en };
}

function withQty(sizes) {
  return sizes.map((s) => ({ ...s, qty_on_hand: QTY }));
}

/** Décisions explicites (codes inchangés). */
const DECISIONS = {
  "mitaines-bebe-sans-pouces-vison-fermeture-eclair": {
    selector: false,
    sizes: [labeled("unique")],
  },
  "mitaines-dame-renard-roux": {
    selector: true,
    sizes: [labeled("M"), labeled("L")],
  },
  "mitaines-dame-vison-et-renard": {
    selector: true,
    sizes: [labeled("M"), labeled("L")],
  },
  "mitaines-style-inuit-coyote": {
    selector: true,
    sizes: [labeled("M"), labeled("L")],
  },
  "semelles-fourrure-recyclee-pointures-5-a-12": {
    selector: false,
    sizes: [
      labeled("unique", {
        label_fr: "Universelle (pointures 5 à 12, à découper)",
        label_en: "Universal (sizes 5–12, cut to fit)",
      }),
    ],
  },
};

/** M-L / L-XL / S-M → 2 grandeurs, 2 stocks. */
const LETTER_SPLIT = {
  "M-L": ["M", "L"],
  "L-XL": ["L", "XL"],
  "S-M": ["S", "M"],
};

const SIZE_LETTER = /\b(XXL|XL|L-XL|M-L|S-M|Small)\b/i;
const SIZE_SINGLE = /(^|[\s—–-])([SML])(?=$|[\s—–-])/;
const MOIS = /(\d+\s*[-–à]\s*\d+\s*mois)/i;
const ANS = /(\d+\s*[-–à]\s*\d+\s*ans)/i;
const AGE = /\b(8-10-12|10-14|13-1|0-7|5-12|7-18|8-18|8-24|2-4|4-6|6-8|8-10|10-12|2-3)\b/i;
const POINTURES = /pointures?\s*\d+\s*[àa]\s*\d+/i;
const SHOE = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/;
const A18 = /\bà\s*18\s*mois\b/i;

/** Tranches d’âge / multi-valeurs à garder mono (pas 2 inventaires artificiels). */
const AGE_BAND_KEEP_MONO = new Set([
  "8-10-12",
  "10-14",
  "13-1",
  "0-7",
  "5-12",
  "7-18",
  "8-18",
  "8-24",
  "2-4",
  "4-6",
  "6-8",
  "8-10",
  "10-12",
  "8-24 mois",
  "7-18 mois",
  "8-18 mois",
  "0-7 mois",
  "5-12 mois",
  "2-4 ans",
  "à 18 mois",
]);

function extractRaw(p) {
  const name = p.name_fr;
  const letters = [];
  let n2 = name;
  const mL = name.match(SIZE_LETTER);
  if (mL) {
    letters.push(mL[1].toLowerCase() === "small" ? "S" : mL[1].toUpperCase());
    n2 = n2.replace(mL[0], " ");
  }
  const mS = n2.match(SIZE_SINGLE);
  if (mS) letters.push(mS[2].toUpperCase());

  let age = null;
  for (const re of [MOIS, ANS, AGE]) {
    const m = name.match(re) || p.id.match(re);
    if (m) {
      age = m[0].replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!age && A18.test(name)) age = "à 18 mois";

  let shoe = null;
  if (["pantoufles", "mukluks"].includes(p.category)) {
    const m = name.match(SHOE);
    if (m && !/mois/i.test(name)) shoe = `${m[1]}-${m[2]}`;
  }

  if (letters.length) return { kind: "letter", code: letters[0] };
  if (age) return { kind: "age", code: age };
  if (shoe) return { kind: "shoe", code: shoe };
  if (POINTURES.test(name)) return { kind: "unique", code: "unique" };
  return { kind: "unique", code: "unique" };
}

/**
 * Si le code représente 2 grandeurs (M-L, 7-8…), ouvrir un sélecteur + stock par grandeur.
 * Sinon : format unique / tranche mono.
 */
function entryFromRaw(p, raw) {
  if (raw.kind === "letter" && LETTER_SPLIT[raw.code]) {
    return {
      selector: true,
      sizes: LETTER_SPLIT[raw.code].map((c) => labeled(c)),
    };
  }
  if (raw.kind === "shoe") {
    const m = String(raw.code).match(/^(\d{1,2})-(\d{1,2})$/);
    if (m && !AGE_BAND_KEEP_MONO.has(raw.code)) {
      const a = m[1];
      const b = m[2];
      if (a !== b) {
        return {
          selector: true,
          sizes: [labeled(a), labeled(b)],
        };
      }
    }
  }
  // âge enfant 2-3 en pantoufles = pointures : déjà kind shoe
  // âge mitaines 2-3 dans AGE_BAND → mono
  if (raw.kind === "age" && !AGE_BAND_KEEP_MONO.has(raw.code)) {
    const m = String(raw.code).match(/^(\d{1,2})-(\d{1,2})$/);
    if (m && p.category === "pantoufles") {
      return { selector: true, sizes: [labeled(m[1]), labeled(m[2])] };
    }
  }
  return {
    selector: false,
    sizes: [labeled(raw.code, { label_fr: raw.code, label_en: raw.code })],
  };
}

const out = {
  version: 2,
  provisional: true,
  default_qty_per_size: QTY,
  note_fr:
    "Formats combinés (ex. M-L) = sélecteur + 3 unités par grandeur. Tranches d’âge / unique restent mono. Lucie peut corriger.",
  note_en:
    "Combined formats (e.g. M-L) = selector + 3 units per size. Age bands / one-size stay single. Lucie may correct.",
  products: {},
};

for (const p of products) {
  const decided = DECISIONS[p.id];
  let entry;
  if (decided) {
    entry = {
      product_number: p.product_number,
      category: p.category,
      selector: decided.selector,
      sizes: withQty(decided.sizes),
    };
  } else {
    const built = entryFromRaw(p, extractRaw(p));
    entry = {
      product_number: p.product_number,
      category: p.category,
      selector: built.selector,
      sizes: withQty(built.sizes),
    };
  }
  out.products[p.id] = entry;
}

const sizesPath = join(root, "catalog", "product-sizes.json");
writeFileSync(sizesPath, JSON.stringify(out, null, 2) + "\n", "utf8");

const workerCopy = join(root, "worker/src/product-sizes.json");
writeFileSync(workerCopy, JSON.stringify(out, null, 2) + "\n", "utf8");
mkdirSync(join(root, "docs/catalog"), { recursive: true });
writeFileSync(join(root, "docs/catalog/product-sizes.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("OK", sizesPath, Object.keys(out.products).length, "products");
const selectors = Object.values(out.products).filter((e) => e.selector);
console.log("selectors", selectors.length);
const p107 = out.products["mitaines-dame-m-l-chat-sauvage"];
console.log("#107", p107);

for (const item of inv.items) {
  const cfg = out.products[item.product_id];
  if (!cfg) continue;
  item.sizes = cfg.sizes.map((s) => ({
    code: s.code,
    label_fr: s.label_fr,
    label_en: s.label_en,
    qty_on_hand: s.qty_on_hand,
  }));
  item.size_selector = !!cfg.selector;
  item.qty_on_hand = item.sizes.reduce((sum, s) => sum + (Number(s.qty_on_hand) || 0), 0);
  item.provisional_qty_on_hand = item.qty_on_hand;
  item.out_of_stock = item.qty_on_hand === 0;
}
inv.size_inventory_note_fr =
  "Stock par grandeur (provisoire, 3 / format). Formats combinés M-L etc. = inventaires séparés.";
writeFileSync(invPath, JSON.stringify(inv, null, 2) + "\n", "utf8");
console.log("OK", invPath, "sizes synced");
