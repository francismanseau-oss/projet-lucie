/**
 * Suite Phase A — tests SIMULÉS (mocks).
 * Aucune clé secrète Lucie. Aucun appel Stripe réel.
 *
 *   npm test              → mocks + logique
 *   npm run test:catalog  → parité HTML ↔ serveur (fichiers réels)
 *
 * Ces tests ≠ validation Stripe Dashboard / clés réelles.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertLiveSaleAllowed,
  assertNoShippingFeesInParams,
  assertStripeKeyMode,
  buildCheckoutParams,
  buildLineItems,
  createMemoryKv,
  hmacSha256Hex,
  processWebhookEvent,
  verifyStripeWebhook,
} from "../src/logic.js";

import {
  installMockStripeFetch,
  MOCK_MODE,
  mockSkLive,
  mockSkTest,
  mockWebhookSecret,
  parseFormBody,
  signWebhook,
} from "./mock-stripe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "src", "products.json"), "utf8"));
const worker = (await import("../src/index.js")).default;

function envBase(extra = {}) {
  return {
    STRIPE_SECRET_KEY: mockSkTest(),
    STRIPE_WEBHOOK_SECRET: mockWebhookSecret(),
    PUBLIC_SITE_URL: "https://example.pages.dev",
    SITE_ORIGIN: "https://example.pages.dev",
    ALLOWED_ORIGINS: "https://example.pages.dev,http://127.0.0.1:5500",
    WORKER_ENV: "test",
    FORCE_TEST_KEYS_ONLY: "true",
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

async function callWorker(path, { method = "GET", body, headers = {}, env } = {}) {
  const req = new Request(`https://worker.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.pages.dev",
      ...headers,
    },
    body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  return worker.fetch(req, env || envBase());
}

// ─── Meta ───────────────────────────────────────────────────────────────────

test("META: suite marquée simulated — pas de réseau Stripe", () => {
  assert.equal(MOCK_MODE, "simulated");
  assert.ok(mockSkTest().startsWith("sk_test_"));
  assert.ok(mockSkTest().includes("simulated"));
  assert.ok(mockSkLive().startsWith("sk_live_"));
});

// ─── Catalogue 66 prix ──────────────────────────────────────────────────────

test("catalogue serveur : 66 produits avec price_cad_cents", () => {
  assert.equal(catalog.currency, "CAD");
  assert.equal(catalog.products.length, 66);
  for (const p of catalog.products) {
    assert.ok(p.id);
    assert.ok(Number.isInteger(p.price_cad_cents));
    assert.ok(p.price_cad_cents >= 0);
  }
});

test("verify:catalog — parité boutique.html ↔ products.json (66/66)", () => {
  const r = spawnSync(process.execPath, [join(root, "scripts", "verify-catalog.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.catalog, 66);
  assert.equal(j.html_ids, 66);
  assert.equal(j.mismatches, 0);
  assert.equal(j.missing, 0);
  assert.equal(j.ok, true);
});

test("worker/src/products.json synchronisé avec catalog/products.json", () => {
  const a = JSON.parse(readFileSync(join(root, "src", "products.json"), "utf8"));
  const b = JSON.parse(readFileSync(join(root, "..", "catalog", "products.json"), "utf8"));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ─── Quantités et totaux CAD ────────────────────────────────────────────────

test("buildLineItems : totaux en cents CAD, qty respectée", () => {
  const sample = catalog.products.slice(0, 3);
  const items = sample.map((p, i) => ({ id: p.id, qty: i + 1 }));
  const { resolved, total_cents, currency } = buildLineItems(catalog, items);
  assert.equal(currency, "cad");
  const expected = sample.reduce((s, p, i) => s + p.price_cad_cents * (i + 1), 0);
  assert.equal(total_cents, expected);
});

test("buildLineItems : qty hors bornes / panier vide rejetés", () => {
  const id = catalog.products[0].id;
  assert.throws(() => buildLineItems(catalog, [{ id, qty: 0 }]), /invalide/i);
  assert.throws(() => buildLineItems(catalog, [{ id, qty: 21 }]), /invalide/i);
  assert.throws(() => buildLineItems(catalog, []), /vide/i);
});

// ─── Prix manipulés ─────────────────────────────────────────────────────────

test("prix client ignoré — total = catalogue serveur uniquement", () => {
  const p = catalog.products[0];
  const { resolved, total_cents } = buildLineItems(catalog, [
    { id: p.id, qty: 2, price: 0.01, price_cad: 0.01, price_cad_cents: 1 },
  ]);
  assert.equal(resolved[0].unit_amount, p.price_cad_cents);
  assert.equal(total_cents, p.price_cad_cents * 2);
  assert.ok(resolved[0].client_price_ignored != null);
});

// ─── Identifiants ───────────────────────────────────────────────────────────

test("produit inconnu / inactif rejeté", () => {
  assert.throws(() => buildLineItems(catalog, [{ id: "does-not-exist", qty: 1 }]), /inconnu/i);
  assert.throws(
    () =>
      buildLineItems(
        { products: [{ id: "x", name_fr: "X", price_cad_cents: 100, active: false }] },
        [{ id: "x", qty: 1 }],
      ),
    /inconnu/i,
  );
});

// ─── Doublons ───────────────────────────────────────────────────────────────

test("webhook : événement dupliqué ignoré (KV ORDERS)", async () => {
  const env = envBase();
  const event = {
    id: "evt_sim_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_sim_1",
        payment_status: "paid",
        amount_total: 5000,
        currency: "cad",
        customer_details: { email: "test@example.com" },
        metadata: {},
      },
    },
  };
  const a = await processWebhookEvent(env, event);
  const b = await processWebhookEvent(env, event);
  assert.equal(a.confirmed, true);
  assert.equal(b.duplicate, true);
  assert.equal(JSON.parse(await env.ORDERS.get("order:cs_sim_1")).status, "paid_confirmed");
});

// ─── Signatures webhook ─────────────────────────────────────────────────────

test("webhook : signature valide acceptée", async () => {
  const secret = mockWebhookSecret();
  const raw = JSON.stringify({ id: "evt_ok", type: "ping" });
  const { header } = signWebhook(secret, raw);
  await verifyStripeWebhook(secret, raw, header);
});

test("webhook : signature invalide / expirée / absente refusée", async () => {
  const secret = mockWebhookSecret();
  const raw = "{}";
  await assert.rejects(() => verifyStripeWebhook(secret, raw, ""), /absente/i);
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(
    () => verifyStripeWebhook(secret, raw, `t=${now},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`),
    /invalide/i,
  );
  const old = now - 60 * 10;
  const { header } = signWebhook(secret, raw, old);
  await assert.rejects(() => verifyStripeWebhook(secret, raw, header), /expir/i);
});

test("hmacSha256Hex cohérent avec signWebhook", async () => {
  const secret = "whsec_x";
  const raw = "body";
  const t = 1700000000;
  const { v1 } = signWebhook(secret, raw, t);
  assert.equal(await hmacSha256Hex(secret, `${t}.${raw}`), v1);
});

// ─── Refus clés live ────────────────────────────────────────────────────────

test("sk_live refusé sans gates production", () => {
  assert.throws(
    () =>
      assertStripeKeyMode({
        STRIPE_SECRET_KEY: mockSkLive(),
        PRODUCTION_UNLOCKED: "false",
        SHIPPING_CONFIGURED: "false",
        AVAILABILITY_CONFIGURED: "false",
      }),
    /bloqués|sk_live/i,
  );
});

test("sk_live accepté seulement hors Worker test + gates production", () => {
  assert.doesNotThrow(() =>
    assertStripeKeyMode({
      STRIPE_SECRET_KEY: mockSkLive(),
      WORKER_ENV: "production",
      FORCE_TEST_KEYS_ONLY: "false",
      PRODUCTION_UNLOCKED: "true",
      SHIPPING_CONFIGURED: "true",
      AVAILABILITY_CONFIGURED: "true",
    }),
  );
});

test("clé non test / non live rejetée", () => {
  assert.throws(() => assertStripeKeyMode({ STRIPE_SECRET_KEY: "pk_test_x" }), /invalide/i);
  assert.throws(() => assertStripeKeyMode({ STRIPE_SECRET_KEY: "" }), /manquante/i);
});

// ─── Livraison ──────────────────────────────────────────────────────────────

test("buildCheckoutParams : aucun shipping_options / frais inventés", () => {
  const p = catalog.products[0];
  const { resolved } = buildLineItems(catalog, [{ id: p.id, qty: 1 }]);
  const params = buildCheckoutParams({
    resolved,
    successUrl: "https://x/ok",
    cancelUrl: "https://x/ko",
  });
  assert.equal(params["metadata[shipping]"], "not_charged_phase_a");
  assertNoShippingFeesInParams(params);
  assert.ok(!Object.keys(params).some((k) => k.startsWith("shipping_options")));
});

test("paiement réel live bloqué si livraison non configurée", () => {
  assert.throws(
    () =>
      assertLiveSaleAllowed(
        {
          STRIPE_SECRET_KEY: mockSkLive(),
          SHIPPING_CONFIGURED: "false",
          AVAILABILITY_CONFIGURED: "true",
        },
        [{ id: "a", availability: "available" }],
      ),
    /livraison/i,
  );
});

// ─── Disponibilité ──────────────────────────────────────────────────────────

test("tous les produits Phase A sont availability=contact (pas de vente live)", () => {
  for (const p of catalog.products) {
    assert.equal(p.availability, "contact");
  }
});

test("sk_test : articles contact OK (Phase A test)", () => {
  assert.doesNotThrow(() =>
    assertLiveSaleAllowed(
      { STRIPE_SECRET_KEY: mockSkTest(), SHIPPING_CONFIGURED: "false" },
      [{ id: "a", availability: "contact" }],
    ),
  );
});

test("sk_live : articles non available refusés", () => {
  assert.throws(
    () =>
      assertLiveSaleAllowed(
        {
          STRIPE_SECRET_KEY: mockSkLive(),
          WORKER_ENV: "production",
          FORCE_TEST_KEYS_ONLY: "false",
          PRODUCTION_UNLOCKED: "true",
          SHIPPING_CONFIGURED: "true",
          AVAILABILITY_CONFIGURED: "true",
          PACKAGE_PROFILES_CONFIGURED: "true",
          COMMERCIAL_TERMS_CONFIGURED: "true",
        },
        [
          { id: "ok", availability: "available" },
          { id: "no", availability: "contact" },
        ],
      ),
    /disponibles/i,
  );
});

test("sk_live : AVAILABILITY_CONFIGURED false refuse toute vente", () => {
  assert.throws(
    () =>
      assertLiveSaleAllowed(
        {
          STRIPE_SECRET_KEY: mockSkLive(),
          WORKER_ENV: "production",
          FORCE_TEST_KEYS_ONLY: "false",
          PRODUCTION_UNLOCKED: "true",
          SHIPPING_CONFIGURED: "true",
          AVAILABILITY_CONFIGURED: "false",
          PACKAGE_PROFILES_CONFIGURED: "true",
          COMMERCIAL_TERMS_CONFIGURED: "true",
        },
        [{ id: "a", availability: "available" }],
      ),
    /disponibilit/i,
  );
});

// ─── Mock Stripe HTTP ───────────────────────────────────────────────────────

test("MOCK Stripe : POST /api/checkout succès (pas de clé réelle)", async () => {
  const mock = installMockStripeFetch({ mode: "success" });
  try {
    const p = catalog.products[0];
    const res = await callWorker("/api/checkout", {
      method: "POST",
      body: {
        items: [{ id: p.id, qty: 1, price: 999999 }],
        successUrl: "https://example.pages.dev/ok",
        cancelUrl: "https://example.pages.dev/ko",
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.url.includes("checkout.stripe.com"));
    assert.equal(data.amount_total_cents, p.price_cad_cents);
    assert.equal(data.shipping_mode, "phase_a_deferred_test_only");
    const form = parseFormBody(mock.calls[0].body);
    assert.equal(form["line_items[0][price_data][currency]"], "cad");
    assert.equal(Number(form["line_items[0][price_data][unit_amount]"]), p.price_cad_cents);
  } finally {
    mock.restore();
  }
});

test("MOCK Stripe : erreur réseau → 500", async () => {
  const mock = installMockStripeFetch({ mode: "network_error" });
  try {
    const p = catalog.products[0];
    const res = await callWorker("/api/checkout", {
      method: "POST",
      body: { items: [{ id: p.id, qty: 1 }] },
    });
    assert.ok(res.status >= 500);
  } finally {
    mock.restore();
  }
});

test("MOCK Stripe : paiement interrompu (AbortError)", async () => {
  const mock = installMockStripeFetch({ mode: "interrupted" });
  try {
    const p = catalog.products[0];
    const res = await callWorker("/api/checkout", {
      method: "POST",
      body: { items: [{ id: p.id, qty: 1 }] },
    });
    assert.ok(res.status >= 500);
  } finally {
    mock.restore();
  }
});

test("MOCK Stripe : carte refusée (api_error) → 502", async () => {
  const mock = installMockStripeFetch({ mode: "api_error" });
  try {
    const p = catalog.products[0];
    const res = await callWorker("/api/checkout", {
      method: "POST",
      body: { items: [{ id: p.id, qty: 1 }] },
    });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /declined|simulated/i);
  } finally {
    mock.restore();
  }
});

test("HTTP : sk_live via Worker refusé (403), aucun fetch Stripe", async () => {
  const mock = installMockStripeFetch({ mode: "success" });
  try {
    const p = catalog.products[0];
    const res = await callWorker("/api/checkout", {
      method: "POST",
      body: { items: [{ id: p.id, qty: 1 }] },
      env: envBase({ STRIPE_SECRET_KEY: mockSkLive() }),
    });
    assert.equal(res.status, 403);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("HTTP webhook : signature mock valide + duplicate", async () => {
  const env = envBase();
  const event = {
    id: "evt_http_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_http_1",
        payment_status: "paid",
        amount_total: 1200,
        currency: "cad",
        metadata: {},
      },
    },
  };
  const raw = JSON.stringify(event);
  const { header } = signWebhook(mockWebhookSecret(), raw);
  const res1 = await callWorker("/api/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "stripe-signature": header },
    env,
  });
  assert.equal(res1.status, 200);
  const j2 = await (
    await callWorker("/api/webhooks/stripe", {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", "stripe-signature": header },
      env,
    })
  ).json();
  assert.equal(j2.duplicate, true);
});

test("HTTP : /api/catalog lecture seule — POST/PUT refusés", async () => {
  const get = await callWorker("/api/catalog");
  assert.equal(get.status, 200);
  assert.equal((await get.json()).count, 66);

  const post = await callWorker("/api/catalog", { method: "POST", body: { products: [] } });
  assert.equal(post.status, 405);

  const putRes = await worker.fetch(
    new Request("https://worker.test/api/catalog", { method: "PUT", body: "{}" }),
    envBase(),
  );
  assert.equal(putRes.status, 405);
});

test("HTTP : /health n'expose aucun secret", async () => {
  const data = await (await callWorker("/health")).json();
  assert.equal(data.ok, true);
  assert.equal(data.products, 66);
  assert.equal(data.stripe_mode, "test");
  const s = JSON.stringify(data);
  assert.ok(!s.includes("sk_test"));
  assert.ok(!s.includes("whsec"));
});

// ─── Frontend mobile / secrets client ───────────────────────────────────────

test("frontend mobile : paiement.html viewport + config sans secret", () => {
  const html = readFileSync(join(root, "..", "paiement.html"), "utf8");
  assert.match(html, /viewport/i);
  assert.match(html, /checkout-config\.js/);
  assert.match(html, /\/api\/checkout/);
  assert.match(html, /Failed to fetch|Worker local|réseau|network|Échec/i);
});

test("checkout-config.js : aucune clé secrète", () => {
  const js = readFileSync(join(root, "..", "checkout-config.js"), "utf8");
  assert.doesNotMatch(js, /sk_live|sk_test_|whsec_/);
  assert.match(js, /apiBase/);
});

test("gitignore protège .dev.vars", () => {
  const gi = readFileSync(join(root, "..", ".gitignore"), "utf8");
  assert.match(gi, /\.dev\.vars/);
});

test("wrangler.toml : gates production à false + instructions KV", () => {
  const toml = readFileSync(join(root, "wrangler.toml"), "utf8");
  assert.match(toml, /PRODUCTION_UNLOCKED\s*=\s*"false"/);
  assert.match(toml, /SHIPPING_CONFIGURED\s*=\s*"false"/);
  assert.match(toml, /AVAILABILITY_CONFIGURED\s*=\s*"false"/);
  assert.match(toml, /kv namespace create ORDERS/);
  assert.match(toml, /binding = "ORDERS"/);
});
