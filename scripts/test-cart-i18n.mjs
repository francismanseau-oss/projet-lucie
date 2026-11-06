/**
 * Tests unitaires affichage panier bilingue (sans DOM).
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "cart-i18n.js"), "utf8");

function loadI18n(lang) {
  const document = { documentElement: { lang: lang === "en" ? "en-CA" : "fr-CA" } };
  const rootObj = { document };
  vm.runInNewContext(src, { window: rootObj, document, globalThis: rootObj });
  return rootObj.BOREALES_CART_I18N;
}

const fr = loadI18n("fr");
const en = loadI18n("en");

const shop = {
  id: "chapeau-fille-8-10-renard",
  name: "Chapeau fille 8-10 — renard",
  name_fr: "Chapeau fille 8-10 — renard",
  name_en: "Girl's hat 8-10 — fox",
  price: 60,
  qty: 2,
};

const custom = {
  id: "custom:mitaines-x:1",
  name_fr: "Sur mesure — Mitaines dame",
  name_en: "Custom — Ladies mittens",
  price: 120,
  qty: 1,
  custom: true,
  custom_config: {
    product_id: "mitaines-dame-m-renard",
    unit: "cm",
    measurements: { hand_circumference: 20, hand_length: 18 },
    measurement_labels: {
      hand_circumference: { fr: "Tour de main", en: "Hand circumference" },
      hand_length: { fr: "Longueur de la main", en: "Hand length" },
    },
    chaleur: true,
    leather: "noir",
    comments: "OK",
  },
};

assert.equal(fr.itemTitle(shop), shop.name_fr);
assert.equal(en.itemTitle(shop), shop.name_en);
assert.equal(fr.itemTitle(custom), custom.name_fr);
assert.equal(en.itemTitle(custom), custom.name_en);

const bitsFr = fr.customDetailBits(custom.custom_config).join(" ");
const bitsEn = en.customDetailBits(custom.custom_config).join(" ");
assert.match(bitsFr, /Tour de main/);
assert.match(bitsEn, /Hand circumference/);
assert.match(bitsFr, /Chaleur renforcée/);
assert.equal(shop.id, "chapeau-fille-8-10-renard");
assert.equal(custom.custom_config.product_id, "mitaines-dame-m-renard");

// Multi-articles + cycle FR → EN → FR (quantités / prix / ids stables)
const cart = [
  shop,
  custom,
  {
    id: "pantoufles-dame-vison-coyote-8-9",
    name_fr: "Pantoufles dame 8-9 — vison/coyote",
    name_en: "Women's slippers 8-9 — mink/coyote",
    price: 95,
    qty: 3,
  },
];
const snap = cart.map((x) => ({
  id: x.id,
  qty: x.qty,
  price: x.price,
  product_id: x.custom_config?.product_id,
}));
const titlesFr1 = cart.map((x) => fr.itemTitle(x));
const titlesEn = cart.map((x) => en.itemTitle(x));
const titlesFr2 = cart.map((x) => fr.itemTitle(x));
assert.deepEqual(titlesFr1, titlesFr2);
assert.notDeepEqual(titlesFr1, titlesEn);
assert.match(titlesEn[0], /Girl/);
assert.match(titlesEn[1], /Custom/);
assert.deepEqual(
  cart.map((x) => ({
    id: x.id,
    qty: x.qty,
    price: x.price,
    product_id: x.custom_config?.product_id,
  })),
  snap,
);

console.log("OK cart i18n FR→EN→FR multi-articles (ids/qty/prix inchangés)");
