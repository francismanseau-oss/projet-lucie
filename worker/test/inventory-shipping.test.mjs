/**
 * Stocks, réservations, annulations, livraison — SIMULÉ.
 * Aucune quantité / tarif inventé dans les fixtures de prod ;
 * les tests utilisent des jeux de données EXPLICITEMENT marqués fixture.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertInventorySellable,
  canSellLine,
  commitReservation,
  expireReservations,
  FULFILLMENT,
  releaseReservation,
  reserveStock,
} from "../src/inventory.js";
import {
  assertShippingGate,
  buildStripeShippingOption,
  listShippingMethods,
  quoteShipping,
} from "../src/shipping.js";
import { createMemoryTxStore } from "../src/store/memory-tx.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const inventoryFile = JSON.parse(readFileSync(join(root, "inventory", "inventory.json"), "utf8"));
const shippingConfig = JSON.parse(readFileSync(join(root, "shipping", "shipping-config.json"), "utf8"));

test("inventory.json : 66 articles, qty_on_hand tous null, pending_lucie", () => {
  assert.equal(inventoryFile.items.length, 66);
  assert.equal(inventoryFile.policy.no_fictional_qty, true);
  for (const i of inventoryFile.items) {
    assert.equal(i.qty_on_hand, null);
    assert.equal(i.fulfillment_type, "pending_lucie");
    assert.equal(i.lucie_confirmed, false);
    assert.equal(i.qty_reserved, 0);
  }
});

test("INVENTAIRE-LUCIE.csv : 66 lignes data + en-tête", () => {
  const csv = readFileSync(join(root, "inventory", "INVENTAIRE-LUCIE.csv"), "utf8").trim().split(/\n/);
  assert.equal(csv.length, 67);
  assert.match(csv[0], /fulfillment_type/);
  assert.match(csv[0], /qty_on_hand/);
});

test("canSellLine : pending / qty null refusés ; MTO et unique OK", () => {
  assert.equal(canSellLine({ fulfillment_type: FULFILLMENT.PENDING, lucie_confirmed: false }, 1).ok, false);
  assert.equal(
    canSellLine({ fulfillment_type: FULFILLMENT.UNIQUE, lucie_confirmed: true, qty_on_hand: null, qty_reserved: 0 }, 1)
      .ok,
    false,
  );
  assert.equal(
    canSellLine(
      { fulfillment_type: FULFILLMENT.MTO, lucie_confirmed: true, qty_on_hand: null, qty_reserved: 0 },
      1,
    ).ok,
    true,
  );
  const u = canSellLine(
    { fulfillment_type: FULFILLMENT.UNIQUE, lucie_confirmed: true, qty_on_hand: 2, qty_reserved: 1 },
    1,
  );
  assert.equal(u.ok, true);
  assert.equal(u.reserve, true);
  assert.equal(
    canSellLine(
      { fulfillment_type: FULFILLMENT.UNIQUE, lucie_confirmed: true, qty_on_hand: 1, qty_reserved: 1 },
      1,
    ).ok,
    false,
  );
});

/** Fixture de test seulement — pas le fichier Lucie. */
function fixtureStore() {
  return createMemoryTxStore([
    {
      product_id: "fix-unique-a",
      name_fr: "Fixture unique A",
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 1,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
    {
      product_id: "fix-unique-b",
      name_fr: "Fixture unique B",
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 2,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
    {
      product_id: "fix-mto",
      name_fr: "Fixture MTO",
      fulfillment_type: FULFILLMENT.MTO,
      qty_on_hand: null,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
    {
      product_id: "fix-pending",
      name_fr: "Fixture pending",
      fulfillment_type: FULFILLMENT.PENDING,
      qty_on_hand: null,
      qty_reserved: 0,
      lucie_confirmed: false,
    },
  ]);
}

test("réservation atomique unique : hold puis commit décrémente stock", async () => {
  const store = fixtureStore();
  const r = await reserveStock(store, { lines: [{ id: "fix-unique-a", qty: 1 }], sessionId: "cs_test_1" });
  assert.ok(r.reservation_id);
  assert.equal(store.getInventory("fix-unique-a").qty_reserved, 1);
  assert.equal(store.getInventory("fix-unique-a").qty_available, 0);

  await assert.rejects(
    () => reserveStock(store, { lines: [{ id: "fix-unique-a", qty: 1 }] }),
    /insuffisant/i,
  );

  const c = await commitReservation(store, r.reservation_id);
  assert.equal(c.committed, true);
  assert.equal(store.getInventory("fix-unique-a").qty_on_hand, 0);
  assert.equal(store.getInventory("fix-unique-a").qty_reserved, 0);
});

test("made_to_order : réservation sans decrement reserved", async () => {
  const store = fixtureStore();
  const r = await reserveStock(store, { lines: [{ id: "fix-mto", qty: 1 }] });
  assert.equal(r.lines[0].reserved, false);
  assert.equal(store.getInventory("fix-mto").qty_reserved, 0);
  await commitReservation(store, r.reservation_id);
  assert.equal(store.getInventory("fix-mto").qty_on_hand, null);
});

test("annulation : release remet qty_reserved", async () => {
  const store = fixtureStore();
  const r = await reserveStock(store, { lines: [{ id: "fix-unique-b", qty: 2 }] });
  assert.equal(store.getInventory("fix-unique-b").qty_available, 0);
  await releaseReservation(store, r.reservation_id);
  assert.equal(store.getInventory("fix-unique-b").qty_reserved, 0);
  assert.equal(store.getInventory("fix-unique-b").qty_available, 2);
});

test("expiration : held périmée libérée", async () => {
  const store = fixtureStore();
  const now = Date.now();
  const r = await reserveStock(store, {
    lines: [{ id: "fix-unique-b", qty: 1 }],
    now,
    ttlMs: 1000,
  });
  const exp = await expireReservations(store, { now: now + 5000 });
  assert.equal(exp.expired, 1);
  assert.equal(store.getReservation(r.reservation_id).status, "expired");
  assert.equal(store.getInventory("fix-unique-b").qty_reserved, 0);
});

test("concurrence simulée : une seule réservation pour qty=1", async () => {
  const store = fixtureStore();
  const results = await Promise.allSettled([
    reserveStock(store, { lines: [{ id: "fix-unique-a", qty: 1 }] }),
    reserveStock(store, { lines: [{ id: "fix-unique-a", qty: 1 }] }),
    reserveStock(store, { lines: [{ id: "fix-unique-a", qty: 1 }] }),
  ]);
  const ok = results.filter((x) => x.status === "fulfilled");
  const ko = results.filter((x) => x.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(ko.length, 2);
  assert.equal(store.getInventory("fix-unique-a").qty_reserved, 1);
});

test("rollback multi-lignes : si 2e ligne échoue, 1re non réservée", async () => {
  const store = fixtureStore();
  await assert.rejects(
    () =>
      reserveStock(store, {
        lines: [
          { id: "fix-unique-b", qty: 1 },
          { id: "fix-unique-a", qty: 2 }, // only 1 on hand
        ],
      }),
    /insuffisant|non vendable|Quantité/i,
  );
  assert.equal(store.getInventory("fix-unique-b").qty_reserved, 0);
  assert.equal(store.getInventory("fix-unique-a").qty_reserved, 0);
});

test("assertInventorySellable refuse pending_lucie du fichier réel", () => {
  const store = createMemoryTxStore(inventoryFile.items);
  const id = inventoryFile.items[0].product_id;
  assert.throws(() => assertInventorySellable(store, [{ id, qty: 1 }]), /Inventaire non prêt/i);
});

test("shipping-config : no_invented_rates, fees null, canada_post unset", () => {
  assert.equal(shippingConfig.policy.no_invented_rates, true);
  assert.equal(shippingConfig.methods.canada_post.rates_source, "unset");
  assert.equal(shippingConfig.methods.canada_post.rate_table_cad_cents, null);
  assert.equal(shippingConfig.methods.bus_quebec.fee_cad_cents, null);
  assert.equal(shippingConfig.methods.bus_quebec.requires_manual_validation, true);
  const methods = listShippingMethods(shippingConfig);
  assert.ok(methods.every((m) => m.configured_for_charge === false));
});

test("quote Postes Canada refusée si rates unset / sans cote réelle", () => {
  const cfg = structuredClone(shippingConfig);
  cfg.methods.canada_post.enabled = true;
  assert.throws(
    () =>
      quoteShipping(cfg, {
        methodId: "canada_post",
        destination: { country: "CA", province: "QC", postal_code: "H2X1Y4" },
      }),
    /non configurés|unset|inventé/i,
  );

  cfg.methods.canada_post.rates_source = "lucie_manual_table";
  cfg.methods.canada_post.rate_table_cad_cents = {}; // table présente mais cote injectée absente
  cfg.methods.canada_post.package_profile.weight_g = 500;
  assert.throws(
    () =>
      quoteShipping(cfg, {
        methodId: "canada_post",
        destination: { country: "CA", province: "QC", postal_code: "H2X1Y4" },
      }),
    /Aucune cote|inventé/i,
  );

  const q = quoteShipping(cfg, {
    methodId: "canada_post",
    destination: { country: "CA", province: "QC", postal_code: "G1R4P5" },
    canadaPostQuoteCadCents: 1850, // injecté comme venant d'une grille/API — pas hardcodé dans la config
  });
  assert.equal(q.fee_cad_cents, 1850);
  assert.equal(q.invented, false);
});

test("quote autobus QC : refuse sans validation manuelle Lucie", () => {
  const cfg = structuredClone(shippingConfig);
  cfg.methods.bus_quebec.enabled = true;
  assert.throws(
    () => quoteShipping(cfg, { methodId: "bus_quebec", destination: { province: "QC" } }),
    /non validés|Lucie/i,
  );
  const q = quoteShipping(cfg, {
    methodId: "bus_quebec",
    destination: { province: "QC" },
    manualBusFeeCadCents: 2500,
  });
  assert.equal(q.fee_cad_cents, 2500);
  assert.equal(q.manual_validated, true);
  assert.throws(
    () =>
      quoteShipping(cfg, {
        methodId: "bus_quebec",
        destination: { province: "ON" },
        manualBusFeeCadCents: 2500,
      }),
    /Québec/i,
  );
});

test("SHIPPING_CONFIGURED=false bloque facturation Stripe shipping", () => {
  assert.throws(
    () =>
      assertShippingGate(
        { SHIPPING_CONFIGURED: "false" },
        { fee_cad_cents: 100, invented: false },
      ),
    /SHIPPING_CONFIGURED/i,
  );
  const opt = buildStripeShippingOption({
    method_id: "canada_post",
    fee_cad_cents: 1850,
    invented: false,
  });
  assert.equal(opt["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], 1850);
});

test("docs inventaire / D1 présents ; migration SQL", () => {
  assert.match(readFileSync(join(root, "inventory", "README-LUCIE.md"), "utf8"), /unique_stock/);
  assert.match(readFileSync(join(__dirname, "..", "src", "store", "d1-notes.md"), "utf8"), /KV/);
  assert.match(
    readFileSync(join(__dirname, "..", "migrations", "0001_inventory.sql"), "utf8"),
    /qty_reserved/,
  );
});
