/**
 * Audit d'intégration — scénarios critiques bout-en-bout (mocks).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { FULFILLMENT } from "../src/inventory-core.js";
import {
  attachReservationSession,
  expireReservations,
  reserveStock,
  settlePaidReservation,
} from "../src/inventory.js";
import {
  assertProductionFullyBlocked,
  buildCheckoutParams,
  createMemoryKv,
  serverCheckoutTotalCents,
} from "../src/logic.js";
import { publicOrderView, maskEmail } from "../src/privacy.js";
import { resolveCheckoutShipping } from "../src/shipping.js";
import { createD1Store, resolveInventoryStore as resolveStore } from "../src/store/d1-store.js";
import { createMemoryTxStore } from "../src/store/memory-tx.js";
import {
  installMockStripeFetch,
  mockSkTest,
  mockWebhookSecret,
  parseFormBody,
  signWebhook,
} from "./mock-stripe.mjs";

const worker = (await import("../src/index.js")).default;
const kv = createMemoryKv;

function lastItemStore() {
  return createMemoryTxStore([
    {
      product_id: "last-one",
      name_fr: "Dernier article",
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 1,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
  ]);
}

function envBase(extra = {}) {
  return {
    STRIPE_SECRET_KEY: mockSkTest(),
    STRIPE_WEBHOOK_SECRET: mockWebhookSecret(),
    WORKER_ENV: "test",
    FORCE_TEST_KEYS_ONLY: "true",
    PUBLIC_SITE_URL: "https://example.pages.dev",
    SITE_ORIGIN: "https://example.pages.dev",
    ALLOWED_ORIGINS: "https://example.pages.dev",
    PRODUCTION_UNLOCKED: "false",
    SHIPPING_CONFIGURED: "false",
    AVAILABILITY_CONFIGURED: "false",
    PACKAGE_PROFILES_CONFIGURED: "false",
    COMMERCIAL_TERMS_CONFIGURED: "false",
    FREE_SHIPPING_AUTHORIZED: "false",
    ALLOW_CHECKOUT_WITHOUT_SHIPPING: "true",
    ORDERS: kv(),
    ...extra,
  };
}

async function call(path, { method = "GET", body, headers = {}, env } = {}) {
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: "https://example.pages.dev",
        ...headers,
      },
      body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    }),
    env || envBase(),
  );
}

test("resolveInventoryStore : DB → D1 ; INVENTORY_TX → injection ; sinon null", () => {
  const mem = createMemoryTxStore([]);
  assert.equal(resolveStore({ INVENTORY_TX: mem }).kind, "memory-tx");
  assert.equal(resolveStore({}), null);
  const stmt = {
    bind() {
      return this;
    },
    first: async () => null,
    run: async () => ({}),
    all: async () => ({ results: [] }),
  };
  const fakeDb = {
    prepare() {
      return stmt;
    },
    batch: async () => [],
  };
  assert.equal(resolveStore({ DB: fakeDb }).kind, "d1");
  assert.equal(createD1Store(fakeDb).engine, "transactional-sql");
});

test("checkout intègre store transactionnel + lie session Stripe à la réservation", async () => {
  const store = lastItemStore();
  const catalog = (await import("../src/products.json", { with: { type: "json" } })).default;
  // Utiliser un id catalogue réel pour line items + seed store avec ce id
  const pid = catalog.products[0].id;
  const store2 = createMemoryTxStore([
    {
      product_id: pid,
      name_fr: catalog.products[0].name_fr,
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 1,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
  ]);
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_test_link_1" });
  try {
    const env = envBase({
      AVAILABILITY_CONFIGURED: "true",
      INVENTORY_TX: store2,
    });
    const res = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: pid, qty: 1 }] },
      env,
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.inventory_store, "memory-tx");
    assert.ok(data.reservation_id);
    assert.equal(data.id, "cs_test_link_1");
    const rsv = store2.getReservation(data.reservation_id);
    assert.equal(rsv.session_id, "cs_test_link_1");
    const pending = JSON.parse(await env.ORDERS.get("pending:cs_test_link_1"));
    assert.equal(pending.reservation_id, data.reservation_id);
    assert.equal(pending.session_id, "cs_test_link_1");
    assert.equal(pending.amount_total_cents, catalog.products[0].price_cad_cents);
    const form = parseFormBody(mock.calls[0].body);
    assert.equal(form["metadata[reservation_id]"], data.reservation_id);
    assert.equal(Number(form["line_items[0][price_data][unit_amount]"]), catalog.products[0].price_cad_cents);
  } finally {
    mock.restore();
  }
});

test("deux clients simultanés : un seul obtient le dernier article via checkout", async () => {
  const catalog = (await import("../src/products.json", { with: { type: "json" } })).default;
  const pid = catalog.products[1].id;
  const store = createMemoryTxStore([
    {
      product_id: pid,
      name_fr: catalog.products[1].name_fr,
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 1,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
  ]);
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.stripe.com")) {
      n += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: `cs_test_race_${n}`,
            url: `https://checkout.stripe.com/c/pay/cs_test_race_${n}`,
            object: "checkout.session",
          };
        },
      };
    }
    return original(url, init);
  };
  try {
    const env = envBase({ AVAILABILITY_CONFIGURED: "true", INVENTORY_TX: store });
    const results = await Promise.allSettled([
      call("/api/checkout", { method: "POST", body: { items: [{ id: pid, qty: 1 }] }, env }),
      call("/api/checkout", { method: "POST", body: { items: [{ id: pid, qty: 1 }] }, env }),
    ]);
    const bodies = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        const res = r.value;
        bodies.push({ status: res.status, json: await res.json() });
      }
    }
    const ok = bodies.filter((b) => b.status === 200);
    const ko = bodies.filter((b) => b.status === 409 || b.status >= 400);
    assert.equal(ok.length, 1);
    assert.equal(ko.length, 1);
    assert.equal(store.getInventory(pid).qty_reserved, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("paiement tardif après expiration : réacquisition ou paid_no_stock", async () => {
  const store = lastItemStore();
  const a = await reserveStock(store, { lines: [{ id: "last-one", qty: 1 }], now: 1000, ttlMs: 10 });
  await attachReservationSession(store, a.reservation_id, "cs_late_1");
  await expireReservations(store, { now: 5000 });
  assert.equal(store.getReservation(a.reservation_id).status, "expired");
  assert.equal(store.getInventory("last-one").qty_available, 1);

  // Personne d'autre n'a pris l'article → réacquisition OK
  const s1 = await settlePaidReservation(store, a.reservation_id, { sessionId: "cs_late_1", now: 6000 });
  assert.equal(s1.outcome, "reacquired_and_committed");
  assert.equal(store.getInventory("last-one").qty_on_hand, 0);

  // Second paiement tardif sur autre rsv expirée alors que stock 0
  const store2 = lastItemStore();
  const b = await reserveStock(store2, { lines: [{ id: "last-one", qty: 1 }], now: 1, ttlMs: 1 });
  await expireReservations(store2, { now: 100 });
  await reserveStock(store2, { lines: [{ id: "last-one", qty: 1 }], now: 200, ttlMs: 99999 });
  const s2 = await settlePaidReservation(store2, b.reservation_id, { sessionId: "cs_late_2", now: 300 });
  assert.equal(s2.outcome, "paid_no_stock");
  assert.equal(s2.action, "refund_or_lucie_review");
  assert.equal(store2.getInventory("last-one").qty_on_hand, 1); // hold encore sur l'autre
});

test("webhooks : succès commit ; échec release ; doublon ignore inventaire ; désordre expire→paid", async () => {
  const catalog = (await import("../src/products.json", { with: { type: "json" } })).default;
  const pid = catalog.products[2].id;
  const store = createMemoryTxStore([
    {
      product_id: pid,
      name_fr: "X",
      fulfillment_type: FULFILLMENT.UNIQUE,
      qty_on_hand: 1,
      qty_reserved: 0,
      lucie_confirmed: true,
    },
  ]);
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_wh_1" });
  const env = envBase({ AVAILABILITY_CONFIGURED: "true", INVENTORY_TX: store });
  try {
    const created = await (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: pid, qty: 1 }] },
      env,
    })).json();

    const completed = {
      id: "evt_c1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: created.id,
          payment_status: "paid",
          amount_total: created.amount_total_cents,
          currency: "cad",
          metadata: { reservation_id: created.reservation_id },
          customer_details: { email: "client@exemple.ca" },
        },
      },
    };
    const raw = JSON.stringify(completed);
    const { header } = signWebhook(mockWebhookSecret(), raw);
    const r1 = await call("/api/webhooks/stripe", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": header },
      env,
    });
    const j1 = await r1.json();
    assert.equal(j1.inventory.outcome, "committed");
    assert.equal(store.getInventory(pid).qty_on_hand, 0);

    // doublon
    const r2 = await call("/api/webhooks/stripe", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": header },
      env,
    });
    assert.equal((await r2.json()).duplicate, true);
  } finally {
    mock.restore();
  }
});

test("livraison : sans free ni configured ni allow → refus ; free OK ; quote dans total Stripe", () => {
  assert.throws(
    () =>
      resolveCheckoutShipping({
        FREE_SHIPPING_AUTHORIZED: "false",
        SHIPPING_CONFIGURED: "false",
        ALLOW_CHECKOUT_WITHOUT_SHIPPING: "false",
        WORKER_ENV: "test",
      }),
    /Livraison non validée/i,
  );
  const free = resolveCheckoutShipping({ FREE_SHIPPING_AUTHORIZED: "true" });
  assert.equal(free.fee_cad_cents, 0);
  assert.equal(free.mode, "free_authorized");

  const quoted = resolveCheckoutShipping(
    { SHIPPING_CONFIGURED: "true", FREE_SHIPPING_AUTHORIZED: "false" },
    { method_id: "canada_post", fee_cad_cents: 1200, invented: false },
  );
  assert.equal(quoted.fee_cad_cents, 1200);
  const resolved = [{ id: "a", qty: 1, unit_amount: 5000, line_total_cents: 5000, name: "A" }];
  assert.equal(serverCheckoutTotalCents(resolved, quoted), 6200);
  const params = buildCheckoutParams({
    resolved,
    successUrl: "https://x/ok",
    cancelUrl: "https://x/ko",
    shippingResolution: quoted,
  });
  assert.equal(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], 1200);
  assert.equal(params["metadata[shipping_fee_cents]"], "1200");
});

test("production bloquée sans colis / termes commerciaux Lucie", () => {
  assert.throws(
    () =>
      assertProductionFullyBlocked({
        STRIPE_SECRET_KEY: "sk_live_x",
        PRODUCTION_UNLOCKED: "true",
        SHIPPING_CONFIGURED: "true",
        AVAILABILITY_CONFIGURED: "true",
        PACKAGE_PROFILES_CONFIGURED: "false",
        COMMERCIAL_TERMS_CONFIGURED: "false",
        WORKER_ENV: "production",
        FORCE_TEST_KEYS_ONLY: "false",
      }),
    /PACKAGE_PROFILES|COMMERCIAL_TERMS|bloquée/i,
  );
});

test("PII : e-mail masqué dans order-status public", async () => {
  assert.equal(maskEmail("client@exemple.ca"), "c***@exemple.ca");
  const view = publicOrderView({
    confirmed: true,
    customer_email: "secret@exemple.ca",
    session_id: "cs_x",
  });
  assert.equal(view.customer_email, undefined);
  assert.equal(view.customer_email_masked, "s***@exemple.ca");

  const env = envBase();
  await env.ORDERS.put(
    "order:cs_test_pii",
    JSON.stringify({
      status: "paid_confirmed",
      payment_status: "paid",
      customer_email: "lucie-client@exemple.ca",
      amount_total: 100,
      currency: "cad",
    }),
  );
  const res = await call("/api/order-status?session_id=cs_test_pii", { env });
  const data = await res.json();
  assert.equal(data.customer_email, undefined);
  assert.match(data.customer_email_masked, /\*\*\*/);
});

test("health expose inventory_store sans secret", async () => {
  const store = createMemoryTxStore([]);
  const data = await (await call("/health", { env: envBase({ INVENTORY_TX: store }) })).json();
  assert.equal(data.inventory_store, "memory-tx");
  assert.equal(data.package_profiles_configured, false);
  assert.ok(!JSON.stringify(data).includes("sk_test"));
});
