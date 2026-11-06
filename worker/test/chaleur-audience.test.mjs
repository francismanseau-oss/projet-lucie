import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLineItems } from "../src/logic.js";
import audience from "../src/audience.json" with { type: "json" };

const catalog = JSON.parse(readFileSync(new URL("../src/products.json", import.meta.url), "utf8"));
const opts = {
  audienceByProductId: audience.products,
  chaleurRule: {
    applies_to_categories: ["mitaines", "pantoufles"],
    applies_to_audiences: ["femmes", "hommes"],
  },
};

function line(id, measurements) {
  return {
    id: `custom:${id}:chaleur`,
    qty: 1,
    price: 1,
    custom_config: {
      product_id: id,
      unit: "cm",
      measurements,
      chaleur: "1",
    },
  };
}

function byId(id) {
  return catalog.products.find((p) => p.id === id);
}

test("Chaleur + refusée pour une mitaine enfant, même via le paramètre", () => {
  assert.throws(
    () => buildLineItems(catalog, [line("mitaines-fille-8-10-renard", { hand_circumference: 12, hand_length: 10 })], opts),
    /Chaleur \+ non offerte/,
  );
});

test("Chaleur + refusée si le public n'est pas confirmé", () => {
  const id = "mitaines-small-vison";
  assert.equal(audience.products[id], undefined);
  assert.ok(byId(id));
  assert.throws(
    () => buildLineItems(catalog, [line(id, { hand_circumference: 20, hand_length: 18 })], opts),
    /Chaleur \+ non offerte/,
  );
});

test("Chaleur + adulte : prix catalogue inchangé, option non facturée", () => {
  const id = "mitaines-dame-renard-roux";
  const product = byId(id);
  assert.equal(audience.products[id].audience, "femmes");
  const { resolved, total_cents } = buildLineItems(
    catalog,
    [line(id, { hand_circumference: 20, hand_length: 18 })],
    opts,
  );
  assert.equal(resolved[0].unit_amount, product.price_cad_cents);
  assert.equal(total_cents, product.price_cad_cents);
  assert.equal(resolved[0].custom_config.chaleur, undefined);
});
