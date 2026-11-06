import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLineItems, buildCheckoutParams, httpError } from "../src/logic.js";
import {
  expandInventoryRowsForStore,
  inventoryStockId,
  resolveSizeForLine,
} from "../src/product-sizes-core.js";
import { createMemoryTxStore } from "../src/store/memory-tx.js";
import { assertInventorySellable, reserveStock, commitReservation } from "../src/inventory.js";
import { FULFILLMENT } from "../src/inventory-core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(join(root, "catalog/products.json"), "utf8"));
const productSizes = JSON.parse(readFileSync(join(root, "catalog/product-sizes.json"), "utf8"));

test("product-sizes : décisions Lucie #101/#104/#105/#126/#700", () => {
  const p101 = productSizes.products["mitaines-bebe-sans-pouces-vison-fermeture-eclair"];
  assert.equal(p101.selector, false);
  assert.equal(p101.sizes.length, 1);
  assert.equal(p101.sizes[0].qty_on_hand, 3);

  for (const id of ["mitaines-dame-renard-roux", "mitaines-dame-vison-et-renard"]) {
    const e = productSizes.products[id];
    assert.equal(e.selector, false);
    assert.deepEqual(
      e.sizes.map((s) => s.code),
      ["M"],
    );
    assert.equal(e.sizes[0].qty_on_hand, 3);
  }

  const p126 = productSizes.products["mitaines-style-inuit-coyote"];
  assert.equal(p126.selector, true);
  assert.deepEqual(
    p126.sizes.map((s) => s.code),
    ["M", "L"],
  );
  assert.ok(p126.sizes.every((s) => s.qty_on_hand === 3));

  const p700 = productSizes.products["semelles-fourrure-recyclee-pointures-5-a-12"];
  assert.equal(p700.selector, false);
  assert.equal(p700.sizes.length, 1);
  assert.match(p700.sizes[0].label_fr, /universelle/i);
});

test("formats confirmés : #202 L seul, #107 M seul, un M-L reste séparé", () => {
  const e = productSizes.products["chapeau-dame-m-l-coyote"];
  assert.equal(e.selector, false);
  assert.deepEqual(
    e.sizes.map((s) => s.code),
    ["L"],
  );
  assert.equal(e.sizes[0].qty_on_hand, 3);
  const p107 = productSizes.products["mitaines-dame-m-l-chat-sauvage"];
  assert.equal(p107.selector, false);
  assert.deepEqual(
    p107.sizes.map((s) => s.code),
    ["M"],
  );
  const still = productSizes.products["chapeau-dame-m-l-fourrure-recyclee"];
  assert.equal(still.selector, true);
  assert.deepEqual(
    still.sizes.map((s) => s.code),
    ["M", "L"],
  );
});

test("resolveSizeForLine : taille obligatoire + épuisée", () => {
  const entry = productSizes.products["mitaines-style-inuit-coyote"];
  assert.equal(resolveSizeForLine(entry, null).ok, false);
  assert.equal(resolveSizeForLine(entry, "XL").reason, "size_invalid");
  assert.equal(resolveSizeForLine(entry, "M").ok, true);

  const sold = {
    selector: true,
    sizes: [
      { code: "M", label_fr: "M", label_en: "M", qty_on_hand: 0 },
      { code: "L", label_fr: "L", label_en: "L", qty_on_hand: 3 },
    ],
  };
  assert.equal(resolveSizeForLine(sold, "M").reason, "size_sold_out");
  assert.equal(resolveSizeForLine(sold, "L").ok, true);
});

test("inventoryStockId : multi = id::taille, mono = id", () => {
  const multi = productSizes.products["mitaines-style-inuit-coyote"];
  assert.equal(inventoryStockId("mitaines-style-inuit-coyote", "M", multi), "mitaines-style-inuit-coyote::M");
  const mono = productSizes.products["mitaines-bebe-sans-pouces-vison-fermeture-eclair"];
  assert.equal(mono.sizes[0].code, "8-24 mois");
  assert.equal(
    inventoryStockId("mitaines-bebe-sans-pouces-vison-fermeture-eclair", "8-24 mois", mono),
    "mitaines-bebe-sans-pouces-vison-fermeture-eclair",
  );
});

test("buildLineItems : taille dans ligne + metadata Stripe", () => {
  const { resolved } = buildLineItems(
    catalog,
    [{ id: "mitaines-style-inuit-coyote", qty: 1, size: "M" }],
    { productSizes },
  );
  assert.equal(resolved[0].id, "mitaines-style-inuit-coyote");
  assert.equal(resolved[0].size, "M");
  assert.equal(resolved[0].inventory_id, "mitaines-style-inuit-coyote::M");
  assert.match(resolved[0].name, /— Moyen/);
  assert.equal(resolved[0].size_label_fr, "Moyen");
  assert.equal(resolved[0].size_label_en, "Medium");

  const params = buildCheckoutParams({
    resolved,
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/cancel",
  });
  assert.equal(params["line_items[0][price_data][product_data][metadata][size]"], "M");
  assert.equal(params["line_items[0][price_data][product_data][metadata][size_label_fr]"], "Moyen");
  assert.equal(params["line_items[0][price_data][product_data][metadata][size_label_en]"], "Medium");
  assert.equal(
    params["line_items[0][price_data][product_data][metadata][product_id]"],
    "mitaines-style-inuit-coyote",
  );
  assert.equal(
    params["line_items[0][price_data][product_data][metadata][inventory_id]"],
    "mitaines-style-inuit-coyote::M",
  );
});

test("buildLineItems : refus sans taille si sélecteur", () => {
  assert.throws(
    () =>
      buildLineItems(catalog, [{ id: "mitaines-style-inuit-coyote", qty: 1 }], { productSizes }),
    (err) => err instanceof Error && /taille requise/i.test(err.message),
  );
});

test("buildLineItems : #101 et #700 sans sélecteur OK", () => {
  const a = buildLineItems(
    catalog,
    [{ id: "mitaines-bebe-sans-pouces-vison-fermeture-eclair", qty: 1 }],
    { productSizes },
  );
  assert.equal(a.resolved[0].size, "8-24 mois");
  assert.equal(a.resolved[0].size_label_fr, "8 à 24 mois");
  assert.equal(a.resolved[0].size_label_en, "8 to 24 months");
  assert.equal(a.resolved[0].inventory_id, "mitaines-bebe-sans-pouces-vison-fermeture-eclair");

  const b = buildLineItems(
    catalog,
    [{ id: "semelles-fourrure-recyclee-pointures-5-a-12", qty: 1 }],
    { productSizes },
  );
  assert.equal(b.resolved[0].size, "unique");
  assert.match(b.resolved[0].size_label_fr, /universelle/i);
});

test("stock serveur : survente bloquée par taille", async () => {
  const seedItem = {
    product_id: "mitaines-style-inuit-coyote",
    name_fr: "Mitaines dame — renard roux",
    category: "mitaines",
    fulfillment_type: FULFILLMENT.UNIQUE,
    lucie_confirmed: true,
    sizes: [
      { code: "M", label_fr: "M", label_en: "M", qty_on_hand: 1 },
      { code: "L", label_fr: "L", label_en: "L", qty_on_hand: 3 },
    ],
  };
  const store = createMemoryTxStore(
    expandInventoryRowsForStore(seedItem, {
      fulfillment_type: FULFILLMENT.UNIQUE,
      lucie_confirmed: true,
    }),
  );

  const { resolved } = buildLineItems(
    catalog,
    [{ id: "mitaines-style-inuit-coyote", qty: 1, size: "M" }],
    { productSizes },
  );
  assertInventorySellable(store, [{ id: resolved[0].inventory_id, qty: 1 }]);
  const r = await reserveStock(store, {
    lines: [{ id: resolved[0].inventory_id, qty: 1 }],
  });
  assert.equal(store.getInventory("mitaines-style-inuit-coyote::M").qty_available, 0);

  await assert.rejects(
    () => reserveStock(store, { lines: [{ id: "mitaines-style-inuit-coyote::M", qty: 1 }] }),
    /insuffisant/i,
  );

  // L reste achetable
  await reserveStock(store, { lines: [{ id: "mitaines-style-inuit-coyote::L", qty: 1 }] });
  assert.equal(store.getInventory("mitaines-style-inuit-coyote::L").qty_available, 2);

  await commitReservation(store, r.reservation_id);
  assert.equal(store.getInventory("mitaines-style-inuit-coyote::M").qty_on_hand, 0);
});

test("CSM inchangé : skip_inventory + pas de taille boutique obligatoire", () => {
  const product = catalog.products.find((p) => p.id === "mitaines-style-inuit-coyote");
  const { resolved } = buildLineItems(
    catalog,
    [
      {
        id: "custom:mitaines-style-inuit-coyote",
        qty: 1,
        custom_config: {
          product_id: "mitaines-style-inuit-coyote",
          product_number: product.product_number,
          unit: "cm",
          measurements: {},
        },
      },
    ],
    { productSizes },
  );
  assert.equal(resolved[0].custom, true);
  assert.equal(resolved[0].skip_inventory, true);
});

test("httpError taille épuisée côté catalogue provisoire", () => {
  const soldSizes = structuredClone(productSizes);
  soldSizes.products["mitaines-style-inuit-coyote"].sizes.find((s) => s.code === "M").qty_on_hand = 0;
  assert.throws(
    () =>
      buildLineItems(
        catalog,
        [{ id: "mitaines-style-inuit-coyote", qty: 1, size: "M" }],
        { productSizes: soldSizes },
      ),
    (err) => err.status === 409 && /épuisée/i.test(err.message),
  );
  // silence unused
  void httpError;
});
