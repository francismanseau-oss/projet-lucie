/**
 * Préproduction — tests SIMULÉS (mocks).
 * Redirect navigateur ≠ commande payée.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertStripeKeyMode,
  createMemoryKv,
  processWebhookEvent,
  resolveOrderStatus,
} from "../src/logic.js";
import {
  installMockStripeFetch,
  mockSkLive,
  mockSkTest,
  mockWebhookSecret,
  signWebhook,
} from "./mock-stripe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const site = join(root, "..");
const worker = (await import("../src/index.js")).default;
const catalog = JSON.parse(readFileSync(join(root, "src", "products.json"), "utf8"));

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
    ORDERS: createMemoryKv(),
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

test("wrangler.test.toml existe et force le mode test", () => {
  const toml = readFileSync(join(root, "wrangler.test.toml"), "utf8");
  assert.match(toml, /fourrures-boreales-checkout-test/);
  assert.match(toml, /WORKER_ENV\s*=\s*"test"/);
  assert.match(toml, /FORCE_TEST_KEYS_ONLY\s*=\s*"true"/);
  assert.match(toml, /PRODUCTION_UNLOCKED\s*=\s*"false"/);
});

test("Worker test : sk_live toujours refusé même avec gates prod", () => {
  assert.throws(
    () =>
      assertStripeKeyMode({
        STRIPE_SECRET_KEY: mockSkLive(),
        WORKER_ENV: "test",
        FORCE_TEST_KEYS_ONLY: "true",
        PRODUCTION_UNLOCKED: "true",
        SHIPPING_CONFIGURED: "true",
        AVAILABILITY_CONFIGURED: "true",
      }),
    /TEST|sk_live/i,
  );
});

test("resolveOrderStatus : sans fetch ni KV → pas confirmed (redirect seule insuffisante)", async () => {
  const env = envBase();
  const r = await resolveOrderStatus(env, "cs_test_fake_redirect_only", null);
  assert.equal(r.confirmed, false);
  assert.equal(r.ui_state, "pending");
  assert.match(r.note, /redirection/i);
});

test("resolveOrderStatus : session_id invalide / absent", async () => {
  await assert.rejects(() => resolveOrderStatus(envBase(), "", null), /invalide/i);
  await assert.rejects(() => resolveOrderStatus(envBase(), "../evil", null), /invalide/i);
});

test("resolveOrderStatus : confirmed seulement après KV webhook", async () => {
  const env = envBase();
  await processWebhookEvent(env, {
    id: "evt_pre_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_paid_1",
        payment_status: "paid",
        amount_total: 6000,
        currency: "cad",
        customer_details: { email: "a@b.ca" },
        metadata: {},
      },
    },
  });
  const r = await resolveOrderStatus(env, "cs_test_paid_1", null);
  assert.equal(r.confirmed, true);
  assert.equal(r.source, "webhook_kv");
  assert.equal(r.ui_state, "confirmed");
});

test("resolveOrderStatus : confirmed via retrieve Stripe (mock), pas via redirect", async () => {
  const env = envBase();
  const r = await resolveOrderStatus(env, "cs_test_retrieve_1", async () => ({
    id: "cs_test_retrieve_1",
    payment_status: "paid",
    amount_total: 12000,
    currency: "cad",
    status: "complete",
    customer_details: { email: "x@y.ca" },
    metadata: {},
  }));
  assert.equal(r.confirmed, true);
  assert.equal(r.source, "stripe_retrieve");
});

test("resolveOrderStatus : retrieve unpaid → confirmed false", async () => {
  const r = await resolveOrderStatus(envBase(), "cs_test_unpaid_1", async () => ({
    id: "cs_test_unpaid_1",
    payment_status: "unpaid",
    status: "open",
  }));
  assert.equal(r.confirmed, false);
  assert.ok(["pending", "unpaid"].includes(r.ui_state));
});

test("HTTP GET /api/order-status : redirect seule ne suffit pas (session inconnue mock)", async () => {
  const mock = installMockStripeFetch({ mode: "api_error" });
  try {
    // mock api_error sur POST ; pour GET sessions on étend le mock
  } finally {
    mock.restore();
  }

  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("checkout/sessions/")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: "cs_test_x", payment_status: "unpaid", status: "open", amount_total: null };
        },
      };
    }
    return original(url);
  };
  try {
    const res = await call("/api/order-status?session_id=cs_test_x");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.confirmed, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("webhook async_payment_failed + duplicate", async () => {
  const env = envBase();
  const event = {
    id: "evt_fail_1",
    type: "checkout.session.async_payment_failed",
    data: { object: { id: "cs_test_fail", payment_status: "unpaid" } },
  };
  const a = await processWebhookEvent(env, event);
  const b = await processWebhookEvent(env, event);
  assert.equal(a.failed, true);
  assert.equal(b.duplicate, true);
  const st = await resolveOrderStatus(env, "cs_test_fail", null);
  assert.equal(st.confirmed, false);
  assert.equal(st.ui_state, "failed");
});

test("webhook événement inconnu → received ignored, pas de confirmation", async () => {
  const r = await processWebhookEvent(envBase(), {
    id: "evt_other",
    type: "customer.created",
    data: { object: {} },
  });
  assert.equal(r.ignored, true);
  assert.ok(!r.confirmed);
});

test("webhook signature invalide → HTTP 400", async () => {
  const res = await call("/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=nope" },
  });
  assert.equal(res.status, 400);
});

test("checkout success_url pointe vers commande-confirmee + session_id", async () => {
  const mock = installMockStripeFetch({ mode: "success" });
  try {
    const p = catalog.products[0];
    const res = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: p.id, qty: 1 }] },
    });
    assert.equal(res.status, 200);
    // inspect form body for success_url
    const body = mock.calls[0].body;
    assert.match(body, /commande-confirmee\.html/);
    assert.match(body, /session_id/);
    assert.match(body, /commande-annulee\.html/);
  } finally {
    mock.restore();
  }
});

test("pages HTML : succès ne confirme pas sans API ; annulation présente", () => {
  const ok = readFileSync(join(site, "commande-confirmee.html"), "utf8");
  const ko = readFileSync(join(site, "commande-annulee.html"), "utf8");
  assert.match(ok, /order-status/);
  assert.match(ok, /confirmed === true/);
  assert.match(ok, /redirection/i);
  assert.match(ok, /api\/order-status/);
  assert.match(ok, /viewport/i);
  assert.match(ko, /annul/i);
  assert.match(ko, /panier/i);
});

test("docs Lucie + CLI + checklist préprod présents", () => {
  assert.ok(readFileSync(join(site, "docs", "LUCIE-SECRETS-CLOUDFLARE.md"), "utf8").includes("sk_test"));
  assert.ok(readFileSync(join(site, "docs", "STRIPE-CLI-TEST.md"), "utf8").includes("4242"));
  assert.ok(readFileSync(join(site, "docs", "PREPROD-CHECKLIST.md"), "utf8").includes("SHIPPING"));
});

test("paiement.html envoie vers les nouvelles pages", () => {
  const html = readFileSync(join(site, "paiement.html"), "utf8");
  assert.match(html, /commande-confirmee\.html\?session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(html, /commande-annulee\.html/);
});
