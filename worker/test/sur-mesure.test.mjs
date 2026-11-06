import test from "node:test";
import assert from "node:assert/strict";
import { buildLineItems } from "../src/logic.js";
import {
  validateMeasurements,
  toCm,
  officialBoutiquePrice,
  INCH_TO_CM,
} from "../src/sur-mesure-pricing.js";
import catalog from "../src/products.json" with { type: "json" };
import surMesureConfig from "../src/sur-mesure-config.json" with { type: "json" };

const measureSpecForCategory = (category) =>
  surMesureConfig.measurements_by_category?.[category] || { fields: [] };

const mitaine = catalog.products.find((p) => p.category === "mitaines" && p.active !== false);
const foulard = catalog.products.find((p) => p.category === "foulards" && p.active !== false);

test("conversion pouces → cm précise (×2.54) — 20 cm ≈ 7,87 po", () => {
  assert.equal(INCH_TO_CM, 2.54);
  assert.equal(toCm(10, "in"), 25.4);
  assert.equal(toCm(25.4, "cm"), 25.4);
  const inches = 20 / INCH_TO_CM;
  assert.ok(Math.abs(inches - 7.874015748) < 1e-9);
});

test("catalogue Boutique : 66 produits, 66 prix entiers CAD", () => {
  assert.equal(catalog.products.length, 66);
  for (const p of catalog.products) {
    assert.ok(Number.isInteger(p.price_cad_cents), p.id);
    assert.ok(p.price_cad_cents >= 0, p.id);
  }
});

test("officialBoutiquePrice = price_cad_cents du SKU", () => {
  assert.ok(mitaine);
  const r = officialBoutiquePrice(mitaine);
  assert.equal(r.ok, true);
  assert.equal(r.total_cad_cents, mitaine.price_cad_cents);
});

test("validateMeasurements : mitaines = 2 champs Lucie (pas de majeur)", () => {
  const spec = measureSpecForCategory("mitaines");
  assert.equal(spec.fields.length, 2);
  assert.equal(spec.fields.map((f) => f.id).join(","), "hand_circumference,hand_length");
  assert.equal(validateMeasurements(spec, null, {}).ok, false);
  assert.equal(validateMeasurements(spec, "cm", { hand_circumference: 20 }).ok, false);
  assert.equal(
    validateMeasurements(spec, "in", {
      hand_circumference: 8,
      hand_length: 7.5,
    }).ok,
    true,
  );
  assert.equal(
    validateMeasurements(spec, "cm", {
      hand_circumference: 20,
      hand_length: 18,
      middle_finger_length: 8,
    }).ok,
    true,
    "champ retiré ignoré s’il traîne dans d’anciennes données",
  );
});

test("validateMeasurements : foulards provisoires = longueur + largeur", () => {
  const spec = measureSpecForCategory("foulards");
  assert.equal(spec.fields.length, 2);
  assert.equal(spec.fields.map((f) => f.id).join(","), "scarf_length,scarf_width");
  assert.equal(validateMeasurements(spec, null, {}).ok, false);
  assert.equal(
    validateMeasurements(spec, "cm", { scarf_length: 150, scarf_width: 30 }).ok,
    true,
  );
});

test("buildLineItems : custom = prix Boutique (ignore price navigateur)", () => {
  assert.ok(mitaine);
  const { resolved, total_cents } = buildLineItems(
    catalog,
    [
      {
        id: "custom:" + mitaine.id + ":xyz",
        qty: 1,
        price: 1.0,
        price_cad_cents: 100,
        custom_config: {
          product_id: mitaine.id,
          unit: "cm",
          measurements: {
            hand_circumference: 20,
            hand_length: 18,
          },
          measurements_cm: {
            hand_circumference: 20,
            hand_length: 18,
          },
          chaleur: true,
          comments: "Doigté large",
        },
      },
    ],
    { validateMeasurements, measureSpecForCategory, audienceByProductId: { [mitaine.id]: "femmes" } },
  );
  assert.equal(resolved[0].unit_amount, mitaine.price_cad_cents);
  assert.equal(total_cents, mitaine.price_cad_cents);
  assert.equal(resolved[0].custom, true);
  assert.equal(resolved[0].skip_inventory, true);
  assert.equal(resolved[0].custom_config.chaleur, true);
  assert.equal(resolved[0].custom_config.leather, "noir");
  assert.equal(resolved[0].custom_config.price_source, "catalog/products.json");
  assert.ok(resolved[0].client_price_ignored != null);
});

test("buildLineItems : produit boutique inconnu → erreur", () => {
  assert.throws(
    () =>
      buildLineItems(
        catalog,
        [
          {
            id: "custom:fake:1",
            qty: 1,
            custom_config: { product_id: "does-not-exist", unit: "cm", measurements: {} },
          },
        ],
        { validateMeasurements, measureSpecForCategory },
      ),
    /inconnu/i,
  );
});

test("buildLineItems : mélange boutique + sur mesure même prix catalogue", () => {
  assert.ok(foulard);
  const shop = catalog.products.find((p) => p.id !== foulard.id);
  const { resolved, total_cents } = buildLineItems(
    catalog,
    [
      { id: shop.id, qty: 2 },
      {
        id: "custom:" + foulard.id + ":1",
        qty: 1,
        custom_config: {
          product_id: foulard.id,
          unit: "cm",
          measurements: { scarf_length: 150, scarf_width: 30 },
          comments: "Longueur 1,5 m si possible",
        },
      },
    ],
    { validateMeasurements, measureSpecForCategory },
  );
  assert.equal(resolved.length, 2);
  assert.equal(total_cents, shop.price_cad_cents * 2 + foulard.price_cad_cents);
  assert.equal(resolved[1].unit_amount, foulard.price_cad_cents);
});
