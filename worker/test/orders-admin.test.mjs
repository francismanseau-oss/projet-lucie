/**
 * Admin commandes Lucie — filtres, CSM, livraison sans frais inventés.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertNoInventedShippingFee,
  assertNotTouchingPayment,
  filterOrders,
  normalizeOrder,
} from "../../orders/orders-core.js";
import { createAdminOrdersStore } from "../../orders/admin-orders-store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sampleOrders() {
  return [
    normalizeOrder({
      session_id: "cs_test_std_1",
      payment_status: "paid",
      payment_verified: true,
      amount_total_cents: 14000,
      customer_email: "a@example.com",
      fulfillment_status: "a_preparer",
      source: "stripe_test",
      items: [{ id: "mitaines-m-renard", product_number: 119, name: "Mitaines", qty: 1 }],
    }),
    normalizeOrder({
      session_id: "cs_test_csm_1",
      payment_status: "paid",
      payment_verified: true,
      amount_total_cents: 14000,
      customer_email: "b@example.com",
      fulfillment_status: "a_fabriquer",
      source: "stripe_test",
      items: [
        {
          id: "custom:x:1",
          product_number: 119,
          name: "Sur mesure — Mitaines",
          qty: 1,
          custom: true,
          custom_config: {
            csm_code: "119-CSM",
            product_id: "mitaines-m-renard",
            unit: "cm",
            measurements: { tour_main: 19 },
            comments: "souple",
          },
        },
      ],
    }),
    normalizeOrder({
      session_id: "cs_test_mix_1",
      payment_status: "paid",
      payment_verified: true,
      amount_total_cents: 28000,
      fulfillment_status: "a_fabriquer",
      source: "test_fixture",
      items: [
        { id: "mitaines-m-renard", product_number: 119, name: "Mitaines", qty: 1 },
        {
          id: "custom:y:2",
          product_number: 200,
          custom: true,
          name: "Sur mesure — Chapeau",
          custom_config: { csm_code: "200-CSM", measurements: { tour_tete: 56 }, unit: "cm" },
        },
      ],
    }),
  ];
}

test("filter payees / a_fabriquer / search CSM", () => {
  const all = sampleOrders();
  assert.equal(filterOrders(all, { filter: "payees" }).length, 3);
  assert.equal(filterOrders(all, { filter: "a_fabriquer" }).length, 2);
  assert.equal(filterOrders(all, { filter: "a_preparer" }).length, 1);
  assert.equal(filterOrders(all, { search: "119-CSM" }).length, 1);
  assert.equal(filterOrders(all, { search: "a@example.com" }).length, 1);
});

test("cannot invent shipping fee while a_confirmer; agreement before facture", () => {
  assert.throws(() =>
    assertNoInventedShippingFee({ fee_status: "a_confirmer", fee_cad_cents: 1200 }),
  );
  assert.throws(() =>
    assertNoInventedShippingFee({
      fee_status: "facture",
      fee_cad_cents: 1200,
      client_fee_agreed: false,
    }),
  );
  assert.doesNotThrow(() =>
    assertNoInventedShippingFee({
      fee_status: "accepte_client",
      fee_cad_cents: 1200,
      client_fee_agreed: true,
    }),
  );
});

test("payment fields locked", () => {
  assert.throws(() => assertNotTouchingPayment({ payment_status: "paid" }));
});

test("store updates fulfillment + shipping + history; no duplicate session", () => {
  const file = path.join(os.tmpdir(), `boreales-orders-${Date.now()}.json`);
  const store = createAdminOrdersStore(file);
  const a = sampleOrders()[1];
  store.upsertFromImport(a);
  store.upsertFromImport({ ...a, amount_total_cents: 14000 });
  assert.equal(store.list().length, 1);

  const updated = store.updateFulfillment({
    id: a.session_id,
    fulfillment_status: "en_fabrication",
    confirm: true,
    note: "démarré",
  });
  assert.equal(updated.fulfillment_status, "en_fabrication");
  assert.equal(updated.payment_status, "paid");
  assert.ok(updated.status_history.length >= 1);

  const shipped = store.updateShipping({
    id: a.session_id,
    confirm: true,
    shipping: {
      method: "canada_post",
      fee_status: "a_confirmer",
      fee_cad_cents: null,
      tracking_number: null,
    },
  });
  assert.equal(shipped.shipping.method, "canada_post");
  assert.equal(shipped.shipping.fee_cad_cents, null);

  assert.throws(() =>
    store.updateShipping({
      id: a.session_id,
      confirm: true,
      shipping: { fee_status: "a_confirmer", fee_cad_cents: 999 },
    }),
  );

  fs.unlinkSync(file);
});

test("shipping-config forbids invented rates; client choisit Postes Canada / Express Bus", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "shipping/shipping-config.json"), "utf8"));
  assert.equal(cfg.policy.no_invented_rates, true);
  assert.equal(cfg.policy.no_purolator, true);
  assert.equal(cfg.policy.customer_chooses_carrier, true);
  assert.equal(cfg.policy.customer_does_not_choose_carrier, false);
  assert.equal(cfg.methods.canada_post.fee_cad_cents, 1800);
  assert.equal(cfg.methods.bus_quebec.customer_selectable, true);
  assert.equal(cfg.methods.canada_post.customer_selectable, true);
  assert.ok(!cfg.methods.purolator);
});

test("admin-orders.json starts empty (no fake real orders)", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "orders/admin-orders.json"), "utf8"));
  assert.equal(Array.isArray(raw.orders), true);
  assert.equal(raw.orders.length, 0);
  assert.equal(raw.policy.no_fictional_orders_as_real, true);
});

test("orders UI and server routes exist", () => {
  const html = fs.readFileSync(path.join(root, "inventory/admin/public/orders.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "inventory/admin/public/orders.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "inventory/admin/server.mjs"), "utf8");
  assert.match(html, /Actualiser depuis Stripe TEST/);
  assert.match(js, /product-code--csm/);
  assert.match(server, /import-stripe-test/);
  assert.match(server, /fulfillment/);
});
