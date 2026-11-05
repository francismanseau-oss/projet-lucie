/**
 * Confirmation client : récap réel, n° LFB, sans jargon Stripe.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMemoryKv,
  processWebhookEvent,
  resolveOrderStatus,
} from "../src/logic.js";
import {
  enrichOrderStatusForClient,
  publicLineFromItem,
} from "../src/order-archive.js";
import { publicOrderView } from "../src/privacy.js";
import { isValidOrderNumber } from "../src/order-numbers.js";

function envBase(extra = {}) {
  return {
    ORDERS: createMemoryKv(),
    STRIPE_SECRET_KEY: "sk_test_x",
    ...extra,
  };
}

test("publicLineFromItem : grandeur + totaux sans inventer", () => {
  const line = publicLineFromItem({
    id: "mitaines-x",
    name: "Mitaines dame M — renard",
    size: "M",
    size_label_fr: "Moyen",
    size_label_en: "Medium",
    qty: 2,
    unit_amount: 6000,
  });
  assert.equal(line.size, "M");
  assert.equal(line.size_label_fr, "Moyen");
  assert.equal(line.line_total_cents, 12000);
});

test("publicOrderView : masque source / session_id / note technique", () => {
  const view = publicOrderView({
    confirmed: true,
    ui_state: "confirmed",
    session_id: "cs_test_secret",
    source: "stripe_retrieve",
    note: "Confirmé par retrieve Stripe",
    amount_total: 13800,
    customer_email: "a@b.ca",
    order_number: "LFB-20261105-0042",
  });
  assert.equal(view.session_id, undefined);
  assert.equal(view.source, undefined);
  assert.equal(view.note, undefined);
  assert.equal(view.customer_email, undefined);
  assert.equal(view.order_number, "LFB-20261105-0042");
  assert.ok(view.customer_email_masked);
});

test("enrichOrderStatusForClient : confirmed + pending → LFB + items + shipping", async () => {
  const env = envBase();
  await env.ORDERS.put(
    "pending:cs_test_enrich_1",
    JSON.stringify({
      order_number: "LFB-20261105-0099",
      products_cents: 12000,
      shipping_fee_cents: 1800,
      shipping_method: "bus_quebec",
      amount_total_cents: 13800,
      items: [
        {
          id: "mitaines-dame-m-renard",
          name: "Mitaines dame M — renard",
          size: "M",
          size_label_fr: "Moyen",
          size_label_en: "Medium",
          qty: 1,
          unit_amount: 12000,
        },
      ],
    }),
  );
  await env.ORDERS.put(
    "order:cs_test_enrich_1",
    JSON.stringify({
      session_id: "cs_test_enrich_1",
      status: "paid_confirmed",
      payment_status: "paid",
      amount_total: 13800,
      currency: "cad",
    }),
  );

  const base = await resolveOrderStatus(env, "cs_test_enrich_1", null);
  assert.equal(base.confirmed, true);
  const enriched = await enrichOrderStatusForClient(env, base);
  assert.equal(enriched.order_number, "LFB-20261105-0099");
  assert.ok(isValidOrderNumber(enriched.order_number));
  assert.equal(enriched.items.length, 1);
  assert.equal(enriched.items[0].size_label_fr, "Moyen");
  assert.equal(enriched.shipping.method_id, "bus_quebec");
  assert.equal(enriched.shipping.fee_cad_cents, 1800);
  assert.equal(enriched.products_cents, 12000);

  const pub = publicOrderView(enriched);
  assert.equal(pub.source, undefined);
  assert.equal(pub.session_id, undefined);
  assert.equal(pub.shipping.method_id, "bus_quebec");
});

test("enrichOrderStatusForClient : pas de mode inventé si absent", async () => {
  const env = envBase();
  await env.ORDERS.put(
    "order:cs_test_enrich_2",
    JSON.stringify({
      session_id: "cs_test_enrich_2",
      status: "paid_confirmed",
      payment_status: "paid",
      amount_total: 5000,
      currency: "cad",
      items: [{ id: "x", name: "Article", qty: 1, unit_amount: 5000 }],
    }),
  );
  const base = await resolveOrderStatus(env, "cs_test_enrich_2", null);
  const enriched = await enrichOrderStatusForClient(env, base);
  assert.equal(enriched.shipping.method_id, null);
  assert.equal(enriched.shipping.fee_cad_cents, null);
  assert.ok(isValidOrderNumber(enriched.order_number));
});

test("resolveOrderStatus retrieve : fusionne pending (grandeurs) sans confirmer sur redirect seule", async () => {
  const env = envBase();
  await env.ORDERS.put(
    "pending:cs_test_retrieve_size",
    JSON.stringify({
      order_number: "LFB-20261105-0101",
      products_cents: 10000,
      shipping_fee_cents: 1800,
      shipping_method: "canada_post",
      items: [
        {
          id: "chapeau-dame-m-l-coyote",
          name: "Chapeau dame — coyote — Moyen",
          size: "M",
          size_label_fr: "Moyen",
          size_label_en: "Medium",
          qty: 1,
          unit_amount: 10000,
        },
      ],
    }),
  );
  const unpaid = await resolveOrderStatus(env, "cs_test_retrieve_size", async () => ({
    id: "cs_test_retrieve_size",
    payment_status: "unpaid",
    status: "open",
  }));
  assert.equal(unpaid.confirmed, false);

  const paid = await resolveOrderStatus(env, "cs_test_retrieve_size", async () => ({
    id: "cs_test_retrieve_size",
    payment_status: "paid",
    status: "complete",
    amount_total: 11800,
    currency: "cad",
  }));
  assert.equal(paid.confirmed, true);
  const enriched = await enrichOrderStatusForClient(env, paid);
  assert.equal(enriched.shipping.method_id, "canada_post");
  assert.equal(enriched.items[0].size, "M");
});

test("webhook confirmed puis enrich : mode Express Bus réel", async () => {
  const env = envBase();
  await env.ORDERS.put(
    "pending:cs_test_wh_bus",
    JSON.stringify({
      order_number: "LFB-20261105-0202",
      products_cents: 12000,
      shipping_fee_cents: 1800,
      shipping_method: "bus_quebec",
      items: [
        {
          id: "a",
          name: "Produit",
          qty: 1,
          unit_amount: 12000,
          size: "L",
          size_label_fr: "Grand",
          size_label_en: "Large",
        },
      ],
    }),
  );
  await processWebhookEvent(env, {
    id: "evt_confirm_bus",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_wh_bus",
        payment_status: "paid",
        amount_total: 13800,
        currency: "cad",
        customer_details: { email: "t@t.ca" },
      },
    },
  });
  const base = await resolveOrderStatus(env, "cs_test_wh_bus", null);
  assert.equal(base.confirmed, true);
  const enriched = await enrichOrderStatusForClient(env, base);
  assert.equal(enriched.shipping.method_id, "bus_quebec");
  assert.equal(enriched.items[0].size_label_en, "Large");
});
