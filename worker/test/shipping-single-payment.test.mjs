/**
 * Paiement unique + cote / hold / jeton — aucun tarif inventé.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createMemoryKv, buildCheckoutParams, processWebhookEvent } from "../src/logic.js";
import { quoteShipping, resolveCheckoutShipping as resolveShip } from "../src/shipping.js";
import {
  confirmShippingHold,
  createShippingHold,
  listSelectableMethods,
  lookupCanadaPostTableFee,
  quoteTokenToResolution,
  resolveHoldToQuoteToken,
  signQuoteToken,
  tryAutoQuote,
  verifyQuoteToken,
} from "../src/shipping-quote-service.js";
import { generateOrderNumber, isValidOrderNumber } from "../src/order-numbers.js";
import { wasNotifySent } from "../src/order-archive.js";
import { notifyLucieOrderPaid, resendOrderBon } from "../src/lucie-notify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const shippingConfig = JSON.parse(readFileSync(join(root, "shipping", "shipping-config.json"), "utf8"));

test("n° commande LFB permanent", () => {
  // 12:00 UTC en novembre = 07:00 heure Québec (EST)
  const n = generateOrderNumber({ now: () => new Date("2026-11-04T12:00:00Z") });
  assert.equal(n, "LFB-20261104-0700");
  assert.equal(isValidOrderNumber(n), true);
  assert.equal(isValidOrderNumber("cs_xxx"), false);
});

test("méthodes sélectionnables — client choisit Postes Canada ou Express Bus (18$)", () => {
  const methods = listSelectableMethods(shippingConfig);
  const ids = methods.map((m) => m.id);
  assert.ok(ids.includes("canada_post"));
  assert.ok(ids.includes("bus_quebec"));
  assert.ok(!ids.includes("purolator"));
  assert.ok(!ids.includes("flat_order"));
  const cp = methods.find((m) => m.id === "canada_post");
  assert.equal(cp.auto_quotable, true);
  assert.equal(cp.fee_cad_cents, 1800);
  assert.equal(shippingConfig.policy.customer_chooses_carrier, true);
  assert.equal(shippingConfig.policy.customer_does_not_choose_carrier, false);
  assert.equal(shippingConfig.policy.lucie_assigns_carrier, false);
  assert.equal(shippingConfig.policy.depot_pickup_requires_prior_customer_agreement, true);
  assert.match(shippingConfig.policy.customer_message_fr, /Choisissez votre mode/i);
});

test("lookup grille Postes Canada — aucune invention", () => {
  assert.equal(lookupCanadaPostTableFee(null, { postal_code: "G1A1A1", province: "QC" }), null);
  assert.equal(
    lookupCanadaPostTableFee({ QC: 1500, DEFAULT: 2000 }, { postal_code: "G1A1A1", province: "QC" }),
    1500,
  );
  assert.equal(
    lookupCanadaPostTableFee({ DEFAULT: 2200 }, { postal_code: "M5V1A1", province: "ON" }),
    2200,
  );
});

test("Postes Canada / Express Bus 18$ / commande (choix client)", () => {
  const r = tryAutoQuote(shippingConfig, {
    methodId: "canada_post",
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
  });
  assert.equal(r.status, "quoted");
  assert.equal(r.quote.fee_cad_cents, 1800);
  assert.equal(r.quote.fee_scope, "per_order");
  assert.equal(r.quote.source, "fixed_per_order");
  assert.equal(r.quote.invented, false);
  assert.equal(r.quote.lucie_assigns_carrier, false);
  const r2 = tryAutoQuote(shippingConfig, {
    methodId: "canada_post",
    destination: { country: "CA", province: "ON", postal_code: "M5V1A1" },
  });
  assert.equal(r2.quote.fee_cad_cents, 1800);
  const bus = tryAutoQuote(shippingConfig, {
    methodId: "bus_quebec",
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
  });
  assert.equal(bus.status, "quoted");
  assert.equal(bus.quote.fee_cad_cents, 1800);
  assert.equal(bus.quote.customer_pickup_required, true);
});

test("Express Bus (choix client) → 18$ fixes / commande + récupération dépôt", () => {
  const q = quoteShipping(shippingConfig, {
    methodId: "bus_quebec",
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
  });
  assert.equal(q.fee_cad_cents, 1800);
  assert.equal(q.fee_scope, "per_order");
  assert.equal(q.customer_pickup_required, true);
  assert.equal(q.invented, false);
});

test("Express Bus hors zone desservie refusé", () => {
  assert.throws(
    () =>
      quoteShipping(shippingConfig, {
        methodId: "bus_quebec",
        destination: { country: "CA", province: "ON", postal_code: "M5V1A1" },
      }),
    /desservie|Québec/i,
  );
});

test("config : pas de Purolator ; flat 18$ ; paiement unique", () => {
  assert.ok(!shippingConfig.methods.purolator);
  assert.equal(shippingConfig.policy.no_purolator, true);
  assert.equal(shippingConfig.checkout_integration.single_payment_required, true);
  assert.equal(shippingConfig.checkout_integration.no_second_invoice, true);
  assert.equal(shippingConfig.methods.canada_post.fee_cad_cents, 1800);
  assert.equal(shippingConfig.methods.bus_quebec.customer_selectable, true);
  assert.equal(shippingConfig.methods.canada_post.customer_selectable, true);
  assert.equal(shippingConfig.methods.flat_order.enabled, false);
});

test("cote Postes via grille Lucie (fixture interne) → quoted", () => {
  const cfg = structuredClone(shippingConfig);
  cfg.methods.canada_post.enabled = true;
  cfg.methods.canada_post.customer_selectable = true; // fixture legacy grille
  cfg.methods.canada_post.rates_source = "lucie_manual_table";
  cfg.methods.canada_post.fee_cad_cents = null;
  cfg.methods.canada_post.package_profile = { weight_g: 800, length_cm: 30, width_cm: 20, height_cm: 10 };
  cfg.methods.canada_post.rate_table_cad_cents = { QC: 1850, DEFAULT: 2500 };
  const r = tryAutoQuote(cfg, {
    methodId: "canada_post",
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
  });
  assert.equal(r.status, "quoted");
  assert.equal(r.quote.fee_cad_cents, 1850);
  assert.equal(r.quote.invented, false);
});

test("quote_token signé → résolution paiement unique", async () => {
  const token = await signQuoteToken("secret-test", {
    method_id: "canada_post",
    fee_cad_cents: 1850,
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
    source: "lucie_manual_table",
    invented: false,
  });
  const body = await verifyQuoteToken("secret-test", token);
  assert.equal(body.fee_cad_cents, 1850);
  const res = quoteTokenToResolution(body);
  assert.equal(res.mode, "quoted");
  assert.equal(res.fee_cad_cents, 1850);
  const env = { SHIPPING_CONFIGURED: "false", ALLOW_CHECKOUT_WITHOUT_SHIPPING: "false" };
  const locked = resolveShip(env, res.quote);
  assert.equal(locked.mode, "quoted");
  assert.equal(locked.charged, true);
});

test("hold Lucie → confirm → resume → un seul quote_token", async () => {
  const env = { ORDERS: createMemoryKv() };
  const hold = await createShippingHold(env, {
    method_id: "bus_quebec",
    destination: { country: "CA", province: "QC", postal_code: "G1A1A1" },
    items: [{ id: "p1", qty: 1 }],
    reason: "bus_requires_lucie_confirmation",
  });
  assert.equal(hold.status, "awaiting_lucie_fee");
  await confirmShippingHold(env, { hold_id: hold.hold_id, fee_cad_cents: 3200 });
  const out = await resolveHoldToQuoteToken(env, "secret-test", {
    hold_id: hold.hold_id,
    resume_token: hold.resume_token,
  });
  assert.equal(out.fee_cad_cents, 3200);
  const body = await verifyQuoteToken("secret-test", out.quote_token);
  assert.equal(body.hold_id, hold.hold_id);
  assert.equal(body.method_id, "bus_quebec");
});

test("Stripe params : articles + 18$ livraison une seule fois (pas de double facturation)", () => {
  const resolved = [
    { id: "a", name: "A", qty: 2, unit_amount: 5000, line_total_cents: 10000 },
  ];
  const params = buildCheckoutParams({
    resolved,
    successUrl: "https://example.com/ok",
    cancelUrl: "https://example.com/cancel",
    shippingResolution: {
      mode: "quoted",
      fee_cad_cents: 1800,
      charged: true,
      invented: false,
      quote: { method_id: "flat_order", fee_cad_cents: 1800, invented: false },
    },
  });
  assert.equal(params["line_items[0][price_data][unit_amount]"], 5000);
  assert.equal(params["line_items[0][quantity]"], 2);
  assert.equal(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], 1800);
  assert.equal(params["metadata[shipping_fee_cents]"], "1800");
  // Pas de 2ᵉ ligne produit « livraison » ni 2ᵉ shipping_options
  assert.equal(params["line_items[1][price_data][unit_amount]"], undefined);
  assert.equal(params["shipping_options[1][shipping_rate_data][fixed_amount][amount]"], undefined);
});

test("webhook doublon event : pas de 2ᵉ traitement", async () => {
  const ORDERS = createMemoryKv();
  const env = { ORDERS };
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_pay_1",
        payment_status: "paid",
        amount_total: 6800,
        currency: "cad",
        customer_details: { email: "c@d.ca", name: "C" },
      },
    },
  };
  const a = await processWebhookEvent(env, event);
  assert.equal(a.confirmed, true);
  const b = await processWebhookEvent(env, event);
  assert.equal(b.duplicate, true);
});

test("archive + notify + resend sans nouveau paiement", async () => {
  const ORDERS = createMemoryKv();
  const env = { ORDERS, SUGGESTION_MOCK: "true", SUGGESTION_TO_EMAIL: "luciegosselin852@gmail.com" };
  await ORDERS.put(
    "pending:cs_arch",
    JSON.stringify({
      items: [
        {
          id: "shop-1",
          name: "Mitaines",
          product_number: 7,
          qty: 2,
          unit_amount: 5000,
        },
      ],
      products_cents: 10000,
      shipping_fee_cents: 1800,
      shipping_method: "canada_post",
      destination: { province: "QC", postal_code: "G1A1A1", country: "CA" },
      amount_total_cents: 11800,
    }),
  );
  const sessionObj = {
    id: "cs_arch",
    payment_status: "paid",
    amount_total: 11800,
    currency: "cad",
    customer_details: {
      name: "Pat Client",
      email: "pat@exemple.ca",
      phone: "514-555-0199",
      address: { line1: "1 rue Test", city: "Montréal", state: "QC", postal_code: "H2X1Y1", country: "CA" },
    },
  };
  const n1 = await notifyLucieOrderPaid(env, sessionObj);
  assert.equal(n1.ok, true);
  assert.ok(isValidOrderNumber(n1.order_number));
  assert.equal(await wasNotifySent(env, "cs_arch"), true);

  const n2 = await notifyLucieOrderPaid(env, sessionObj);
  assert.equal(n2.skipped, true);

  const again = await resendOrderBon(env, { session_id: "cs_arch" });
  assert.equal(again.ok, true);
  assert.equal(again.order_number, n1.order_number);
});

test("paiement refusé / non confirmé : pas d’archive payée via event failed", async () => {
  const ORDERS = createMemoryKv();
  const r = await processWebhookEvent(
    { ORDERS },
    {
      id: "evt_fail",
      type: "checkout.session.async_payment_failed",
      data: { object: { id: "cs_fail", payment_status: "unpaid" } },
    },
  );
  assert.equal(r.failed, true);
  assert.equal(r.confirmed, false);
  const arch = JSON.parse(await ORDERS.get("order:cs_fail"));
  assert.equal(arch.status, "payment_failed");
});

test("échec envoi courriel : commande conservée, resend possible", async () => {
  const ORDERS = createMemoryKv();
  const env = {
    ORDERS,
    SUGGESTION_MOCK: "false",
    RESEND_API_KEY: "re_test_fail",
    SUGGESTION_TO_EMAIL: "luciegosselin852@gmail.com",
  };
  await ORDERS.put(
    "pending:cs_mailfail",
    JSON.stringify({
      items: [{ id: "a", name: "A", qty: 1, unit_amount: 1000 }],
      products_cents: 1000,
      shipping_fee_cents: 500,
      amount_total_cents: 1500,
      shipping_method: "canada_post",
    }),
  );
  const fetchFail = async () => ({
    ok: false,
    status: 500,
    async json() {
      return { message: "resend_down" };
    },
  });
  const r = await notifyLucieOrderPaid(
    env,
    {
      id: "cs_mailfail",
      payment_status: "paid",
      amount_total: 1500,
      currency: "cad",
      customer_details: { email: "a@b.ca", name: "A" },
    },
    fetchFail,
  );
  assert.equal(r.ok, false);
  const arch = JSON.parse(await ORDERS.get("order:cs_mailfail"));
  assert.ok(arch.order_number);
  assert.equal(arch.notify_status, "failed");
  assert.equal(arch.payment_status, "paid");

  const envOk = { ...env, SUGGESTION_MOCK: "true" };
  const retry = await resendOrderBon(envOk, { session_id: "cs_mailfail" });
  assert.equal(retry.ok, true);
});
