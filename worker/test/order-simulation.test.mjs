/**
 * Simulation complète de commandes — LOCAL / MOCKS uniquement.
 * Aucune clé Stripe réelle, aucun Resend réel, aucun stock/tarif inventé
 * dans inventory.json ni shipping-config.json.
 *
 *   node --test test/order-simulation.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertStripeKeyMode,
  buildCheckoutParams,
  buildLineItems,
  createMemoryKv,
  processWebhookEvent,
  resolveOrderStatus,
} from "../src/logic.js";
import { resolveCheckoutShipping, quoteShipping } from "../src/shipping.js";
import { buildPaidOrderEmail, notifyLucieOrderPaid } from "../src/lucie-notify.js";
import {
  validateMeasurements,
} from "../src/sur-mesure-pricing.js";
import surMesureConfig from "../src/sur-mesure-config.json" with { type: "json" };
import {
  installMockStripeFetch,
  MOCK_MODE,
  mockSkLive,
  mockSkTest,
  mockWebhookSecret,
  parseFormBody,
} from "./mock-stripe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "src", "products.json"), "utf8"));
const shippingConfig = JSON.parse(
  readFileSync(join(root, "src", "shipping-config.json"), "utf8"),
);
const inventoryOfficial = JSON.parse(
  readFileSync(join(root, "..", "inventory", "inventory.json"), "utf8"),
);
const worker = (await import("../src/index.js")).default;

const measureSpecForCategory = (category) =>
  surMesureConfig.measurements_by_category?.[category] || { fields: [] };

const shop = catalog.products.find((p) => p.category === "chapeaux" && p.active !== false);
const mitaine = catalog.products.find((p) => p.category === "mitaines" && p.active !== false);
assert.ok(shop && mitaine);

function envBase(extra = {}) {
  return {
    STRIPE_SECRET_KEY: mockSkTest(),
    STRIPE_WEBHOOK_SECRET: mockWebhookSecret(),
    PUBLIC_SITE_URL: "https://example.pages.dev",
    SITE_ORIGIN: "https://example.pages.dev",
    ALLOWED_ORIGINS: "https://example.pages.dev",
    WORKER_ENV: "test",
    FORCE_TEST_KEYS_ONLY: "true",
    PRODUCTION_UNLOCKED: "false",
    SHIPPING_CONFIGURED: "false",
    AVAILABILITY_CONFIGURED: "false",
    PACKAGE_PROFILES_CONFIGURED: "false",
    COMMERCIAL_TERMS_CONFIGURED: "false",
    FREE_SHIPPING_AUTHORIZED: "false",
    ALLOW_CHECKOUT_WITHOUT_SHIPPING: "true",
    SUGGESTION_MOCK: "true",
    ORDERS: createMemoryKv(),
    ...extra,
  };
}

async function call(path, { method = "GET", body, env } = {}) {
  const req = new Request(`https://worker.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.pages.dev",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, env || envBase());
}

function customLine(product, suffix, measurements, extras = {}) {
  return {
    id: `custom:${product.id}:${suffix}`,
    qty: 1,
    price: 0.01,
    price_cad_cents: 1,
    custom_config: {
      product_id: product.id,
      unit: "cm",
      measurements,
      measurements_cm: { ...measurements },
      raynaud: !!extras.raynaud,
      comments: extras.comments || "",
      leather: "noir",
    },
  };
}

// ─── Garde-fous données officielles ─────────────────────────────────────────

test("SIM — données commerciales officielles non altérées (stock null, livraison off)", () => {
  assert.equal(inventoryOfficial.items.length, 66);
  assert.ok(inventoryOfficial.items.every((i) => i.qty_on_hand === null));
  assert.equal(shippingConfig.methods.canada_post.enabled, true);
  assert.equal(shippingConfig.methods.canada_post.fee_cad_cents, 1800);
  assert.equal(shippingConfig.methods.canada_post.fee_scope, "per_order");
  assert.equal(shippingConfig.policy.customer_chooses_carrier, true);
  assert.equal(shippingConfig.methods.canada_post.customer_selectable, true);
  assert.equal(shippingConfig.methods.bus_quebec.customer_selectable, true);
  assert.ok(!shippingConfig.methods.purolator);
  assert.equal(MOCK_MODE, "simulated");
});

// ─── 1. Parcours panier / lignes ────────────────────────────────────────────

test("SIM — A1 produit standard : ids + qty + prix serveur", () => {
  const { resolved, total_cents } = buildLineItems(catalog, [
    { id: shop.id, qty: 2, price: 1 },
  ]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, shop.id);
  assert.equal(resolved[0].qty, 2);
  assert.equal(resolved[0].unit_amount, shop.price_cad_cents);
  assert.equal(total_cents, shop.price_cad_cents * 2);
  assert.notEqual(resolved[0].unit_amount, 100);
});

test("SIM — A2 produit sur mesure : mesures / Raynaud / cuir conservés, prix catalogue", () => {
  const line = customLine(
    mitaine,
    "sim-a2",
    { hand_circumference: 21, hand_length: 19 },
    { raynaud: true, comments: "Doigté souple" },
  );
  const { resolved, total_cents } = buildLineItems(catalog, [line], {
    validateMeasurements,
    measureSpecForCategory,
  });
  assert.equal(resolved[0].custom, true);
  assert.equal(resolved[0].unit_amount, mitaine.price_cad_cents);
  assert.equal(total_cents, mitaine.price_cad_cents);
  assert.equal(resolved[0].custom_config.product_id, mitaine.id);
  assert.deepEqual(resolved[0].custom_config.measurements, {
    hand_circumference: 21,
    hand_length: 19,
  });
  assert.equal(resolved[0].custom_config.raynaud, true);
  assert.equal(resolved[0].custom_config.leather, "noir");
  assert.equal(resolved[0].custom_config.comments, "Doigté souple");
});

test("SIM — A3 panier mixte boutique + sur mesure", () => {
  const { resolved, total_cents } = buildLineItems(
    catalog,
    [
      { id: shop.id, qty: 1, price_cad_cents: 99999 },
      customLine(mitaine, "mix", { hand_circumference: 20, hand_length: 18 }),
    ],
    { validateMeasurements, measureSpecForCategory },
  );
  assert.equal(resolved.length, 2);
  assert.equal(total_cents, shop.price_cad_cents + mitaine.price_cad_cents);
  assert.equal(resolved[0].id, shop.id);
  assert.equal(resolved[1].custom_config.product_id, mitaine.id);
});

test("SIM — A4 deux personnalisations du même produit (ids distincts, mêmes SKU)", () => {
  const a = customLine(
    mitaine,
    "perso-a",
    { hand_circumference: 19, hand_length: 17 },
    { raynaud: false, comments: "Main A" },
  );
  const b = customLine(
    mitaine,
    "perso-b",
    { hand_circumference: 22, hand_length: 20 },
    { raynaud: true, comments: "Main B" },
  );
  const { resolved, total_cents } = buildLineItems(catalog, [a, b], {
    validateMeasurements,
    measureSpecForCategory,
  });
  assert.equal(resolved.length, 2);
  assert.notEqual(resolved[0].id, resolved[1].id);
  assert.equal(resolved[0].custom_config.product_id, mitaine.id);
  assert.equal(resolved[1].custom_config.product_id, mitaine.id);
  assert.equal(resolved[0].custom_config.raynaud, false);
  assert.equal(resolved[1].custom_config.raynaud, true);
  assert.match(resolved[0].custom_config.comments, /Main A/);
  assert.match(resolved[1].custom_config.comments, /Main B/);
  assert.equal(total_cents, mitaine.price_cad_cents * 2);
});

// ─── 2. Checkout mock + adresse CA + statut paiement ────────────────────────

test("SIM — checkout params : Canada seulement + mesures en metadata Stripe", () => {
  const { resolved } = buildLineItems(
    catalog,
    [customLine(mitaine, "ca", { hand_circumference: 20, hand_length: 18 }, { raynaud: true })],
    { validateMeasurements, measureSpecForCategory },
  );
  const params = buildCheckoutParams({
    resolved,
    successUrl: "https://example.pages.dev/ok",
    cancelUrl: "https://example.pages.dev/ko",
  });
  assert.equal(params["shipping_address_collection[allowed_countries][0]"], "CA");
  assert.equal(params["line_items[0][price_data][unit_amount]"], mitaine.price_cad_cents);
  assert.match(params["line_items[0][price_data][product_data][metadata][measurements]"], /hand_circumference/);
  assert.equal(params["line_items[0][price_data][product_data][metadata][raynaud]"], "1");
});

test("SIM — B1 paiement réussi (mock) : confirmed seulement après webhook", async () => {
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_test_sim_ok" });
  try {
    const res = await call("/api/checkout", {
      method: "POST",
      body: {
        items: [{ id: shop.id, qty: 1, price: 1 }],
        successUrl: "https://example.pages.dev/ok",
        cancelUrl: "https://example.pages.dev/ko",
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.url || data.sessionId || data.id);
    const form = parseFormBody(mock.calls[0].body);
    assert.equal(Number(form["line_items[0][price_data][unit_amount]"]), shop.price_cad_cents);
    assert.equal(form["shipping_address_collection[allowed_countries][0]"], "CA");
  } finally {
    mock.restore();
  }

  const env = envBase();
  const before = await resolveOrderStatus(env, "cs_test_sim_ok", null);
  assert.equal(before.confirmed, false);

  await processWebhookEvent(env, {
    id: "evt_sim_ok",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_sim_ok",
        payment_status: "paid",
        amount_total: shop.price_cad_cents,
        currency: "cad",
        customer_details: {
          email: "client.sim@exemple.ca",
          name: "Client Sim",
          address: { country: "CA", postal_code: "J9X1A1", state: "QC" },
        },
      },
    },
  });
  const after = await resolveOrderStatus(env, "cs_test_sim_ok", null);
  assert.equal(after.confirmed, true);
  assert.equal(after.ui_state, "confirmed");
});

test("SIM — B2 paiement annulé / session expirée : pas « payé »", async () => {
  const env = envBase();
  await processWebhookEvent(env, {
    id: "evt_sim_cancel",
    type: "checkout.session.expired",
    data: { object: { id: "cs_test_sim_cancel", payment_status: "unpaid" } },
  });
  const r = await resolveOrderStatus(env, "cs_test_sim_cancel", null);
  assert.equal(r.confirmed, false);
  assert.ok(["canceled", "expired", "failed", "pending"].includes(r.ui_state) || r.confirmed === false);
});

test("SIM — B3 paiement refusé (mock api_error) + interrompu (AbortError)", async () => {
  const refused = installMockStripeFetch({ mode: "api_error" });
  try {
    const res = await call("/api/checkout", {
      method: "POST",
      body: {
        items: [{ id: shop.id, qty: 1 }],
        successUrl: "https://example.pages.dev/ok",
        cancelUrl: "https://example.pages.dev/ko",
      },
    });
    assert.ok(res.status >= 400);
  } finally {
    refused.restore();
  }

  const aborted = installMockStripeFetch({ mode: "interrupted" });
  try {
    const res = await call("/api/checkout", {
      method: "POST",
      body: {
        items: [{ id: shop.id, qty: 1 }],
        successUrl: "https://example.pages.dev/ok",
        cancelUrl: "https://example.pages.dev/ko",
      },
    });
    assert.ok(res.status >= 400);
  } finally {
    aborted.restore();
  }
});

test("SIM — redirect seule ne confirme jamais le paiement", async () => {
  const r = await resolveOrderStatus(envBase(), "cs_test_redirect_only_sim", null);
  assert.equal(r.confirmed, false);
});

// ─── 3. Stock / livraison — refus sans contourner ───────────────────────────

test("SIM — forfait client Postes Canada / Express Bus à 18$", () => {
  const cp = quoteShipping(shippingConfig, {
    methodId: "canada_post",
    destination: { country: "CA", postal_code: "J9X1A1", province: "QC" },
  });
  assert.equal(cp.fee_cad_cents, 1800);
  assert.equal(cp.fee_scope, "per_order");
  assert.equal(cp.lucie_assigns_carrier, false);
  const bus = quoteShipping(shippingConfig, {
    methodId: "bus_quebec",
    destination: { country: "CA", province: "QC", postal_code: "J9X1A1" },
  });
  assert.equal(bus.fee_cad_cents, 1800);
  assert.equal(bus.customer_pickup_required, true);
});

test("SIM — checkout réel bloqué si livraison non autorisée (pas de contournement)", () => {
  assert.throws(
    () =>
      resolveCheckoutShipping({
        FREE_SHIPPING_AUTHORIZED: "false",
        SHIPPING_CONFIGURED: "false",
        ALLOW_CHECKOUT_WITHOUT_SHIPPING: "false",
      }),
    /livraison|shipping/i,
  );
});

test("SIM — sk_live refusé (Worker test / production non déverrouillée)", () => {
  assert.throws(
    () =>
      assertStripeKeyMode({
        STRIPE_SECRET_KEY: mockSkLive(),
        WORKER_ENV: "test",
        FORCE_TEST_KEYS_ONLY: "true",
        PRODUCTION_UNLOCKED: "false",
        SHIPPING_CONFIGURED: "false",
        AVAILABILITY_CONFIGURED: "false",
      }),
    /TEST|sk_live/i,
  );
});

// ─── 4. Notifications mock ──────────────────────────────────────────────────

test("SIM — courriel Lucie mock : contenu commande, mocked=true, pas d’envoi réel", async () => {
  const pending = {
    items: [
      {
        id: `custom:${mitaine.id}:mail`,
        name: `Sur mesure — ${mitaine.name_fr}`,
        qty: 1,
        unit_amount: mitaine.price_cad_cents,
        custom: true,
        custom_config: {
          product_id: mitaine.id,
          unit: "cm",
          measurements: { hand_circumference: 20, hand_length: 18 },
          raynaud: true,
          leather: "noir",
          comments: "Sim test",
        },
      },
    ],
  };
  const mail = buildPaidOrderEmail(
    {
      id: "cs_test_mail",
      amount_total: mitaine.price_cad_cents,
      currency: "cad",
      payment_status: "paid",
      customer_details: { name: "Pat Sim", email: "pat.sim@exemple.ca" },
    },
    pending,
    { SUGGESTION_MOCK: "true" },
  );
  assert.match(mail.subject, /SUR MESURE/);
  assert.match(mail.text, /webhook|BON DE COMMANDE/);
  assert.match(mail.text, /hand_circumference/);
  assert.doesNotMatch(mail.text, /envoyé avec succès à Resend/i);

  const { createMemoryKv } = await import("../src/logic.js");
  const ORDERS = createMemoryKv();
  await ORDERS.put("pending:cs_test_mail", JSON.stringify(pending));
  const r = await notifyLucieOrderPaid(
    {
      SUGGESTION_MOCK: "true",
      ORDERS,
    },
    {
      id: "cs_test_mail",
      amount_total: mitaine.price_cad_cents,
      currency: "cad",
      payment_status: "paid",
      customer_details: { email: "pat.sim@exemple.ca", name: "Pat Sim" },
    },
  );
  assert.equal(r.ok, true);
  assert.equal(r.mocked, true);
});

// ─── 5. Sécurité ────────────────────────────────────────────────────────────

test("SIM — falsification prix navigateur ignorée", () => {
  const { total_cents, resolved } = buildLineItems(catalog, [
    { id: shop.id, qty: 1, price: 0.01, price_cad_cents: 1 },
  ]);
  assert.equal(total_cents, shop.price_cad_cents);
  assert.equal(resolved[0].client_price_ignored, 1);
});

test("SIM — doublon webhook ignoré (idempotence)", async () => {
  const env = envBase();
  const event = {
    id: "evt_sim_dup",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_dup",
        payment_status: "paid",
        amount_total: shop.price_cad_cents,
        currency: "cad",
      },
    },
  };
  const a = await processWebhookEvent(env, event);
  const b = await processWebhookEvent(env, event);
  assert.equal(a.confirmed || a.received, true);
  assert.equal(b.duplicate, true);
});

test("SIM — erreur réseau Stripe mock → échec contrôlé", async () => {
  const mock = installMockStripeFetch({ mode: "network_error" });
  try {
    const res = await call("/api/checkout", {
      method: "POST",
      body: {
        items: [{ id: shop.id, qty: 1 }],
        successUrl: "https://example.pages.dev/ok",
        cancelUrl: "https://example.pages.dev/ko",
      },
    });
    assert.ok(res.status >= 500);
  } finally {
    mock.restore();
  }
});
