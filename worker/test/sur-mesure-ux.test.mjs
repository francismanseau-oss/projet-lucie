import test from "node:test";
import assert from "node:assert/strict";
import { toCm, INCH_TO_CM } from "../src/sur-mesure-pricing.js";

/** Simule la conversion côté UI au changement d’unité (conserve la valeur physique). */
function convertStore(measurements, fromUnit, toUnit) {
  const out = {};
  for (const [id, val] of Object.entries(measurements)) {
    if (val === "" || val == null) continue;
    const cm = toCm(val, fromUnit);
    if (cm == null) continue;
    out[id] = toUnit === "cm" ? cm : cm / INCH_TO_CM;
  }
  return out;
}

test("changement d’unité conserve la mesure physique (cm → po → cm)", () => {
  const start = { hand_circumference: 20, hand_length: 18 };
  const inches = convertStore(start, "cm", "in");
  assert.ok(Math.abs(inches.hand_circumference - 20 / 2.54) < 1e-9);
  assert.ok(Math.abs(inches.hand_length - 18 / 2.54) < 1e-9);
  const back = convertStore(inches, "in", "cm");
  assert.ok(Math.abs(back.hand_circumference - 20) < 1e-9);
  assert.ok(Math.abs(back.hand_length - 18) < 1e-9);
});

test("mitaines: toujours exactement 2 champs dans la config Worker", async () => {
  const cfg = (await import("../src/sur-mesure-config.json", { with: { type: "json" } })).default;
  const fields = cfg.measurements_by_category.mitaines.fields;
  assert.equal(fields.length, 2);
  assert.deepEqual(
    fields.map((f) => f.id),
    ["hand_circumference", "hand_length"],
  );
  assert.equal(cfg.measurements_by_category.mitaines.awaiting_lucie_validation, false);
});
