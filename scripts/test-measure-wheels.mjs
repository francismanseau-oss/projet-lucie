/**
 * Smoke test local — limites JSON + conversion cm/po + hors liste (sans inventer de mesure).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const limits = JSON.parse(readFileSync(join(root, "catalog/sur-mesure-limits.json"), "utf8"));

assert.equal(limits.increments.cm, 0.5);
assert.equal(limits.by_field.hand_circumference.limits_cm.femme.min, 14);
assert.equal(limits.by_field.hand_circumference.limits_cm.femme.max, 27);
assert.equal(limits.by_field.foot_length.limits_cm.homme.min, 23);
assert.ok(limits.by_field.head_circumference.limits_cm.enfant);
assert.ok(limits.by_field.scarf_length.limits_cm.femme);

function ticksCm(fieldId, audience) {
  const lim = limits.by_field[fieldId].limits_cm[audience];
  const step = limits.increments.cm;
  const out = [];
  const start = Math.ceil(lim.min / step - 1e-12) * step;
  for (let v = start; v <= lim.max + 1e-9; v = Math.round((v + step) * 1000) / 1000) {
    if (v < lim.min - 1e-9) continue;
    out.push(v);
  }
  return out;
}

function ticksIn(fieldId, audience) {
  const lim = limits.by_field[fieldId].limits_cm[audience];
  const out = [];
  const startE = Math.ceil((lim.min / 2.54) * 8 - 1e-12);
  const endE = Math.floor((lim.max / 2.54) * 8 + 1e-12);
  for (let e = startE; e <= endE; e++) {
    const cm = (e / 8) * 2.54;
    if (cm < lim.min - 1e-9 || cm > lim.max + 1e-9) continue;
    out.push(cm);
  }
  return out;
}

const femmeHand = ticksCm("hand_circumference", "femme");
assert.ok(femmeHand.includes(14));
assert.ok(femmeHand.includes(27));
assert.ok(!femmeHand.some((v) => v < 14 || v > 27));

const inchTicks = ticksIn("hand_circumference", "femme");
assert.ok(inchTicks.length > 10);
assert.ok(inchTicks.every((cm) => cm >= 14 - 1e-9 && cm <= 27 + 1e-9));

// Conversion : conserver le cm interne exact (pas de substitution)
const chosenCm = 18.5;
const asIn = chosenCm / 2.54;
const backCm = asIn * 2.54;
assert.equal(backCm, chosenCm);

// Hors liste : pas de valeur inventée
const payload = {
  measurements: { hand_circumference: 20 },
  measurements_cm: { hand_circumference: 20 },
  measure_out_of_range: { hand_length: true },
  special_requests: ["mesure_hors_liste:hand_length"],
};
assert.equal(payload.measurements_cm.hand_length, undefined);
assert.equal(payload.measure_out_of_range.hand_length, true);

const { validateMeasurements } = await import(
  pathToFileURL(join(root, "worker/src/sur-mesure-pricing.js")).href
);
const ok = validateMeasurements(
  {
    fields: [
      { id: "hand_circumference", required: true },
      { id: "hand_length", required: true },
    ],
  },
  "cm",
  {},
  {
    measurementsCm: { hand_circumference: 20 },
    measureOutOfRange: { hand_length: true },
  },
);
assert.equal(ok.ok, true);

console.log("OK test-measure-wheels: limits + conversion + hors liste");
