/**
 * Simulation locale. Stripe est mocké en sk_test (aucun réseau, aucune clé réelle).
 * Ne doit pas modifier lucie-inventory.json, inventory/inventory.json, ni wrangler.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";

import { availabilityFromStore, rowsFromProductSizes } from "../src/sim-snapshot.js";
import { expireReservations, reserveStock } from "../src/inventory.js";
import { createMemoryKv } from "../src/logic.js";
import { createMemoryTxStore } from "../src/store/memory-tx.js";
import { installMockStripeFetch, mockSkTest, mockWebhookSecret, signWebhook } from "./mock-stripe.mjs";

const root = join(import.meta.dirname, "..", "..");
const workerDir = join(root, "worker");
const paths = {
  lucie: join(root, "inventory", "admin", "data", "lucie-inventory.json"),
  official: join(root, "inventory", "inventory.json"),
  sizes: join(root, "catalog", "product-sizes.json"),
  wrangler: join(root, "worker", "wrangler.toml"),
  wranglerTest: join(root, "worker", "wrangler.test.toml"),
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const before = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, hash(file)]));
const sizesDoc = JSON.parse(readFileSync(paths.sizes, "utf8"));
const PID = "mitaines-fille-8-10-renard";
const fileQty = sizesDoc.products[PID].sizes[0].qty_on_hand;

const worker = (await import("../src/index.js")).default;

function storeFrom(rows) {
  return { store: createMemoryTxStore(rows), rows };
}

function envFor(store) {
  return {
    STRIPE_SECRET_KEY: mockSkTest(),
    STRIPE_WEBHOOK_SECRET: mockWebhookSecret(),
    WORKER_ENV: "test",
    FORCE_TEST_KEYS_ONLY: "true",
    PUBLIC_SITE_URL: "http://127.0.0.1:8766",
    SITE_ORIGIN: "http://127.0.0.1:8766",
    ALLOWED_ORIGINS: "http://127.0.0.1:8766",
    PRODUCTION_UNLOCKED: "false",
    SHIPPING_CONFIGURED: "false",
    AVAILABILITY_CONFIGURED: "true",
    PACKAGE_PROFILES_CONFIGURED: "false",
    COMMERCIAL_TERMS_CONFIGURED: "false",
    FREE_SHIPPING_AUTHORIZED: "false",
    ALLOW_CHECKOUT_WITHOUT_SHIPPING: "true",
    ORDERS: createMemoryKv(),
    INVENTORY_TX: store,
  };
}

async function call(path, { method = "GET", body, headers = {}, env } = {}) {
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:8766", ...headers },
      body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    }),
    env,
  );
}

async function webhook(env, event) {
  const raw = JSON.stringify(event);
  const { header } = signWebhook(mockWebhookSecret(), raw);
  const res = await call("/api/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "stripe-signature": header },
    env,
  });
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
}

after(() => {
  for (const [key, file] of Object.entries(paths)) {
    assert.equal(hash(file), before[key], `${key} a été modifié`);
  }
});

test("les fichiers officiels restent hors vente et la production reste fermée", () => {
  const official = JSON.parse(readFileSync(paths.official, "utf8"));
  const sample = official.items.find((item) => item.product_id === PID);
  assert.equal(sample.qty_on_hand, null);
  assert.equal(sample.lucie_confirmed, false);
  assert.match(readFileSync(paths.wrangler, "utf8"), /AVAILABILITY_CONFIGURED = "false"/);
  assert.match(readFileSync(paths.wranglerTest, "utf8"), /AVAILABILITY_CONFIGURED = "false"/);
  assert.equal(fileQty >= 1, true);
});

test("la copie mémoire reprend les quantités du fichier sans l'écrire", () => {
  const rows = rowsFromProductSizes(sizesDoc);
  const { store } = storeFrom(rows);
  const view = availabilityFromStore(store, rows);
  const row = view.products[PID].sizes[0];
  assert.equal(row.qty_on_hand, fileQty);
  assert.equal(row.qty_reserved, 0);
  assert.equal(row.qty_available, fileQty);
  assert.equal(view.durable, false);
  assert.equal(view.writes_real_inventory, false);
  const hat = "chapeau-dame-m-l-fourrure-recyclee";
  assert.equal(store.getInventory(`${hat}::M`).qty_on_hand, sizesDoc.products[hat].sizes.find((s) => s.code === "M").qty_on_hand);
  assert.notEqual(store.getInventory(`${hat}::M`).product_id, store.getInventory(`${hat}::L`).product_id);
});

test("deux acheteurs : un seul obtient la dernière unité", async () => {
  const rows = rowsFromProductSizes(sizesDoc).map((row) =>
    row.product_id === PID ? { ...row, qty_on_hand: 1 } : row,
  );
  const { store } = storeFrom(rows);
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.stripe.com")) {
      n += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: `cs_test_race_${n}`, url: "https://checkout.stripe.com/c/pay/cs_test_race", object: "checkout.session" };
        },
      };
    }
    return original(url, init);
  };
  try {
    const env = envFor(store);
    const results = await Promise.all([
      call("/api/checkout", { method: "POST", body: { items: [{ id: PID, qty: 1 }] }, env }),
      call("/api/checkout", { method: "POST", body: { items: [{ id: PID, qty: 1 }] }, env }),
    ]);
    const statuses = [];
    for (const res of results) statuses.push(res.status);
    statuses.sort();
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(store.getInventory(PID).qty_on_hand, 1);
    assert.equal(store.getInventory(PID).qty_available, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("paiement confirmé déduit une fois ; le second webhook ne déduit plus", async () => {
  const { store, rows } = storeFrom(rowsFromProductSizes(sizesDoc));
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_test_paid_sim" });
  const env = envFor(store);
  try {
    const created = await (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: PID, qty: 1 }] },
      env,
    })).json();
    assert.equal(store.getInventory(PID).qty_available, fileQty - 1);
    assert.equal(store.getInventory(PID).qty_on_hand, fileQty);
    const event = {
      id: "evt_sim_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: created.id,
          payment_status: "paid",
          amount_total: created.amount_total_cents,
          currency: "cad",
          metadata: { reservation_id: created.reservation_id },
        },
      },
    };
    const first = await webhook(env, event);
    assert.equal(first.inventory.outcome, "committed");
    assert.equal(store.getInventory(PID).qty_on_hand, fileQty - 1);
    assert.equal(store.getInventory(PID).qty_reserved, 0);
    const second = await webhook(env, event);
    assert.equal(second.duplicate, true);
    assert.equal(store.getInventory(PID).qty_on_hand, fileQty - 1);
    const shown = availabilityFromStore(store, rows).products[PID].sizes[0];
    assert.equal(shown.qty_available, fileQty - 1);
  } finally {
    mock.restore();
  }
});

test("paiement refusé et session Stripe refusée libèrent sans déduire", async () => {
  const { store } = storeFrom(rowsFromProductSizes(sizesDoc));
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_test_fail_sim" });
  const env = envFor(store);
  try {
    const created = await (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: PID, qty: 2 }] },
      env,
    })).json();
    await webhook(env, {
      id: "evt_sim_fail",
      type: "checkout.session.async_payment_failed",
      data: { object: { id: created.id, payment_status: "unpaid", metadata: { reservation_id: created.reservation_id } } },
    });
    assert.equal(store.getInventory(PID).qty_on_hand, fileQty);
    assert.equal(store.getInventory(PID).qty_reserved, 0);
  } finally {
    mock.restore();
  }

  const again = storeFrom(rowsFromProductSizes(sizesDoc));
  const declined = installMockStripeFetch({ mode: "api_error" });
  try {
    const res = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: PID, qty: 1 }] },
      env: envFor(again.store),
    });
    assert.equal(res.status >= 400, true);
    assert.equal(again.store.getInventory(PID).qty_on_hand, fileQty);
    assert.equal(again.store.getInventory(PID).qty_reserved, 0);
  } finally {
    declined.restore();
  }
});

test("paiement abandonné libère la réservation", async () => {
  const { store } = storeFrom(rowsFromProductSizes(sizesDoc));
  const mock = installMockStripeFetch({ mode: "success", sessionId: "cs_test_leave_sim" });
  const env = envFor(store);
  try {
    const created = await (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ id: PID, qty: 1 }] },
      env,
    })).json();
    await webhook(env, {
      id: "evt_sim_expired",
      type: "checkout.session.expired",
      data: { object: { id: created.id, metadata: { reservation_id: created.reservation_id } } },
    });
    assert.equal(store.getInventory(PID).qty_on_hand, fileQty);
    assert.equal(store.getInventory(PID).qty_available, fileQty);
  } finally {
    mock.restore();
  }
});

test("une réservation expirée rend la quantité disponible", async () => {
  const { store, rows } = storeFrom(rowsFromProductSizes(sizesDoc));
  const held = await reserveStock(store, { lines: [{ id: PID, qty: 1 }], now: 1000, ttlMs: 30 });
  assert.equal(store.getInventory(PID).qty_available, fileQty - 1);
  await expireReservations(store, { now: 5000 });
  assert.equal(store.getReservation(held.reservation_id).status, "expired");
  const shown = availabilityFromStore(store, rows).products[PID].sizes[0];
  assert.equal(shown.qty_on_hand, fileQty);
  assert.equal(shown.qty_available, fileQty);
});

test("limite mémoire : un redémarrage oublie la réservation et ne déduit pas le stock", async () => {
  const port = 8793;
  const start = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["sim-server.mjs"], {
        cwd: workerDir,
        env: { ...process.env, SIM_PORT: String(port), SIM_BIND: "127.0.0.1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buf = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(buf || "serveur muet"));
      }, 8000);
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        if (buf.includes("sim-inventory")) {
          clearTimeout(timer);
          resolve(child);
        }
      });
      child.stderr.on("data", (chunk) => {
        buf += chunk;
      });
    });
  const base = `http://127.0.0.1:${port}`;
  const first = await start();
  const reserved = await (await fetch(`${base}/api/sim/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: [{ id: PID, qty: 1 }] }),
  })).json();
  const held = await (await fetch(`${base}/api/sim/availability`)).json();
  assert.equal(held.products[PID].sizes[0].qty_available, fileQty - 1);
  await fetch(`${base}/api/sim/stop`, { method: "POST" });
  await new Promise((resolve) => first.on("exit", resolve));
  const second = await start();
  try {
    const missing = await fetch(`${base}/api/sim/reservation?id=${encodeURIComponent(reserved.reservation_id)}`);
    const again = await (await fetch(`${base}/api/sim/availability`)).json();
    assert.equal(missing.status, 404);
    assert.equal(again.durable, false);
    assert.equal(again.products[PID].sizes[0].qty_on_hand, fileQty);
    assert.equal(again.products[PID].sizes[0].qty_reserved, 0);
    assert.equal(again.products[PID].sizes[0].qty_available, fileQty);
  } finally {
    await fetch(`${base}/api/sim/stop`, { method: "POST" });
    await new Promise((resolve) => second.on("exit", resolve));
  }
});
