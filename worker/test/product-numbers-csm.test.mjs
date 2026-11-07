/**
 * Régression numérotation 66 + CSM + inventaire provisoire (pas de vente live).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLineItems } from "../src/logic.js";
import { buildPaidOrderEmail } from "../src/lucie-notify.js";
import { csmCode, formatLucieLineLabel } from "../src/product-codes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));
const numbers = JSON.parse(
  fs.readFileSync(path.join(root, "catalog/product-numbers.json"), "utf8"),
);
const provisional = JSON.parse(
  fs.readFileSync(path.join(root, "inventory/provisional-inventory.json"), "utf8"),
);

test("65 unique permanent product numbers in family ranges", () => {
  assert.equal(catalog.products.length, 65);
  assert.equal(numbers.items.length, 65);
  const nums = catalog.products.map((p) => p.product_number);
  assert.equal(new Set(nums).size, 65);
  const ranges = {
    mitaines: [100, 199],
    chapeaux: [200, 299],
    pantoufles: [300, 399],
    mukluks: [400, 499],
    "cache-oreilles": [500, 599],
    foulards: [600, 699],
    semelles: [700, 799],
  };
  for (const p of catalog.products) {
    const [lo, hi] = ranges[p.category];
    assert.ok(p.product_number >= lo && p.product_number <= hi, p.id);
    assert.equal(p.price_cad_cents, numbers.items.find((i) => i.product_id === p.id).price_cad_cents);
  }
});

test("provisional inventory is 65×3=195 and not live-sale", () => {
  assert.equal(provisional.totals.units_provisional, 198);
  assert.equal(provisional.items.length, 65);
  assert.ok(provisional.warning_fr.includes("PROVISOIRE"));
  assert.ok(provisional.items.every((i) => i.qty_physical_provisional === 3));
  assert.ok(provisional.items.every((i) => i.lucie_validated === false));
  const inv = JSON.parse(fs.readFileSync(path.join(root, "inventory/inventory.json"), "utf8"));
  assert.ok(inv.items.every((i) => i.qty_on_hand === null), "real qty stays null");
  assert.equal(inv.policy.provisional_not_for_live_sale, true);
});

test("CSM label formatting and email highlight", () => {
  assert.equal(csmCode(119), "119-CSM");
  assert.equal(
    formatLucieLineLabel({ product_number: 119, name: "Mitaines M — renard", custom: true }),
    "119-CSM — Mitaines M — renard",
  );
  const mit = catalog.products.find((p) => p.id === "mitaines-m-renard");
  const { resolved } = buildLineItems(catalog, [
    {
      id: "custom:mitaines-m-renard:test1",
      qty: 1,
      custom_config: {
        product_id: "mitaines-m-renard",
        product_number: mit.product_number,
        unit: "cm",
        measurements: { tour_main: 19, longueur_main: 18 },
        measurements_cm: { tour_main: 19, longueur_main: 18 },
        chaleur: false,
        comments: "test",
        leather: "noir",
      },
    },
  ]);
  assert.equal(resolved[0].skip_inventory, true);
  assert.equal(resolved[0].custom_config.csm_code, `${mit.product_number}-CSM`);
  assert.deepEqual(resolved[0].custom_config.measurements, {
    tour_main: 19,
    longueur_main: 18,
  });

  const mail = buildPaidOrderEmail(
    { id: "cs_test_x", amount_total: resolved[0].unit_amount, currency: "cad", payment_status: "paid" },
    { items: resolved, session_id: "cs_test_x" },
    { SUGGESTION_MOCK: "true", SUGGESTION_TO_EMAIL: "test@example.com" },
  );
  assert.match(mail.html, /color:#b00020/);
  assert.match(mail.html, new RegExp(`${mit.product_number}-CSM`));
  assert.match(mail.text, /Mensurations/);
});

test("boutique shows product-code badges for all 65", () => {
  const html = fs.readFileSync(path.join(root, "boutique.html"), "utf8");
  const badges = html.match(/class="product-code"/g) || [];
  assert.equal(badges.length, 65);
});
