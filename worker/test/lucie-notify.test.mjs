import test from "node:test";
import assert from "node:assert/strict";
import { buildPaidOrderEmail, notifyLucieOrderPaid } from "../src/lucie-notify.js";
import { createMemoryKv } from "../src/logic.js";

test("buildPaidOrderEmail : bon de commande sur mesure avec n° LFB", () => {
  const mail = buildPaidOrderEmail(
    {
      id: "cs_test_123",
      amount_total: 16000,
      currency: "cad",
      payment_status: "paid",
      customer_details: { name: "Camille Bouchard", email: "camille@exemple.ca" },
    },
    {
      items: [
        {
          id: "custom:mitaines:xyz",
          name: "Sur mesure — Mitaines",
          qty: 1,
          unit_amount: 16000,
          custom: true,
          custom_config: {
            unit: "cm",
            measurements: { hand_length: 18 },
            options: { model: "classic" },
          },
        },
      ],
    },
    { SUGGESTION_TO_EMAIL: "luciegosselin852@gmail.com" },
    {
      order_number: "LFB-20261104-0042",
      payment_status: "paid",
      customer: { name: "Camille Bouchard", email: "camille@exemple.ca", phone: "418-555-0100" },
      shipping: { method: "canada_post", fee_cad_cents: 1800, initial_status: "a_preparer" },
      shipping_address: {
        line1: "12 rue des Érables",
        city: "Québec",
        state: "QC",
        postal_code: "G1A1A1",
        country: "CA",
      },
      items: [
        {
          id: "custom:mitaines:xyz",
          name: "Sur mesure — Mitaines",
          qty: 1,
          unit_amount: 16000,
          custom: true,
          product_number: 12,
          custom_config: {
            csm_code: "12-CSM",
            product_id: "mitaines-classiques",
            unit: "cm",
            measurements: { hand_length: 18, hand_circ: 20 },
            raynaud: true,
            leather: "noir",
            comments: "Doublure plus chaude",
          },
        },
      ],
      financial: {
        products_cents: 16000,
        shipping_fee_cents: 1800,
        amount_total_cents: 17800,
        tax_label_fr: "Taxes : non configurées — à valider avec Lucie",
      },
    },
  );
  assert.match(mail.subject, /Bon de commande LFB-20261104-0042/);
  assert.match(mail.subject, /COMMANDE SUR MESURE/);
  assert.equal(mail.reply_to, "camille@exemple.ca");
  assert.match(mail.text, /BON DE COMMANDE/);
  assert.match(mail.text, /webhook/);
  assert.match(mail.text, /12-CSM|hand_length/);
  assert.match(mail.text, /Postes Canada/);
  assert.match(mail.html, /BON DE COMMANDE/);
  assert.match(mail.html, /LFB-20261104-0042/);
});

test("buildPaidOrderEmail : boutique sans custom", () => {
  const mail = buildPaidOrderEmail(
    {
      id: "cs_test_456",
      amount_total: 5000,
      currency: "cad",
      customer_details: { email: "a@b.ca", name: "Alex" },
    },
    { items: [{ id: "shop-a", name: "Article A", qty: 1, unit_amount: 5000 }] },
    {},
  );
  assert.match(mail.subject, /COMMANDE BOUTIQUE/);
});

test("notifyLucieOrderPaid : mock sans Resend, archive + ok", async () => {
  const ORDERS = createMemoryKv();
  await ORDERS.put(
    "pending:cs_test_789",
    JSON.stringify({
      items: [{ id: "custom:x", custom: true, name: "Sur mesure — Mitaines", qty: 1, unit_amount: 1000 }],
      products_cents: 1000,
      shipping_fee_cents: 0,
      amount_total_cents: 1000,
    }),
  );
  const r = await notifyLucieOrderPaid(
    {
      SUGGESTION_MOCK: "true",
      ORDERS,
    },
    {
      id: "cs_test_789",
      amount_total: 1000,
      currency: "cad",
      payment_status: "paid",
      customer_details: { email: "x@y.z", name: "X" },
    },
  );
  assert.equal(r.ok, true);
  assert.equal(r.mocked, true);
  assert.equal(r.kind, "custom");
  assert.match(String(r.order_number || ""), /^LFB-/);
  const arch = JSON.parse(await ORDERS.get("order:cs_test_789"));
  assert.ok(arch.notify_status === "mocked" || arch.notify_status === "sent");
});

test("notifyLucieOrderPaid : pas de double envoi", async () => {
  const ORDERS = createMemoryKv();
  await ORDERS.put(
    "order:cs_dup",
    JSON.stringify({
      session_id: "cs_dup",
      order_number: "LFB-20261104-0001",
      notify_status: "mocked",
      items: [],
      customer: {},
      financial: {},
      shipping: {},
    }),
  );
  const r = await notifyLucieOrderPaid(
    { SUGGESTION_MOCK: "true", ORDERS },
    { id: "cs_dup", amount_total: 100, currency: "cad" },
  );
  assert.equal(r.skipped, true);
  assert.equal(r.reason, "already_notified");
});
