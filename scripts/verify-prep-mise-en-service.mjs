/**
 * Vérifie la doc de préparation : 66 lignes, prix = catalogue, pas d'activation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog", "products.json"), "utf8"),
);
const products = catalog.products;
const csv = fs.readFileSync(
  path.join(root, "docs", "INVENTAIRE-VALIDATION-LUCIE.csv"),
  "utf8",
);
const shipping = JSON.parse(
  fs.readFileSync(path.join(root, "shipping", "shipping-config.json"), "utf8"),
);
const inventory = JSON.parse(
  fs.readFileSync(path.join(root, "inventory", "inventory.json"), "utf8"),
);

const lines = csv.trim().split(/\r?\n/);
assert.equal(lines.length - 1, 66, "CSV doit avoir 66 lignes données");

const byId = new Map(products.map((p) => [p.id, p]));
for (const line of lines.slice(1)) {
  const cols = line.match(/(".*?"|[^,]+)/g).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
  const [, id, , , price, deja, qty, mto] = cols;
  const p = byId.get(id);
  assert.ok(p, `id inconnu ${id}`);
  assert.equal(Number(price), p.price_cad, `prix ${id}`);
  assert.equal(p.availability, "contact");
  assert.equal(deja, "à confirmer");
  assert.equal(qty, "à confirmer");
  assert.equal(mto, "à confirmer");
  // aucune quantité numérique inventée
  assert.ok(!/^\d+$/.test(qty));
}

assert.equal(products.filter((p) => p.availability === "contact").length, 66);
assert.equal(shipping.methods.canada_post.enabled, false);
assert.equal(shipping.methods.bus_quebec.enabled, false);
assert.equal(shipping.methods.pickup.enabled, false);
assert.equal(shipping.methods.canada_post.rate_table_cad_cents, null);
assert.equal(shipping.methods.bus_quebec.fee_cad_cents, null);

assert.equal(inventory.items.length, 66);
assert.ok(inventory.items.every((i) => i.qty_on_hand === null));
assert.ok(inventory.items.every((i) => i.fulfillment_type === "pending_lucie"));

const docs = [
  "INVENTAIRE-VALIDATION-LUCIE.md",
  "INVENTAIRE-VALIDATION-LUCIE.csv",
  "LIVRAISON-VALIDATION-LUCIE.md",
  "STRIPE-PREPARATION.md",
  "RESEND-CONNEXION.md",
  "DECISIONS-RESTANTES-LUCIE.md",
];
for (const d of docs) {
  assert.ok(fs.existsSync(path.join(root, "docs", d)), d);
}

console.log(
  JSON.stringify({
    ok: true,
    csv_rows: 66,
    prices_match_catalog: true,
    all_availability_contact: true,
    shipping_methods_disabled: true,
    inventory_qty_still_null: true,
    docs_present: docs.length,
  }),
);
