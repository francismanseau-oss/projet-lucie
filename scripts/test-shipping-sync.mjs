import assert from "node:assert/strict";
import { mapStripeSessionToOrder } from "../orders/stripe-test-import.js";
import {
  mergeShippingOnImport,
  resolveClientChosenMethod,
  shippingMethodShortLabel,
} from "../orders/orders-core.js";
import { buildCustomerShopConfirmEmail } from "../worker/src/lucie-notify.js";

const session = {
  id: "cs_test_ship_1",
  created: 1700000000,
  amount_total: 13800,
  amount_subtotal: 12000,
  currency: "cad",
  payment_status: "paid",
  metadata: {
    order_number: "LFB-20261107-1234",
    shipping: "bus_quebec",
    shipping_fee_cents: "1800",
  },
  total_details: { amount_shipping: 1800 },
  customer_details: { email: "client@exemple.ca", name: "Alex Tremblay" },
  _line_items: [
    {
      description: "Mitaines",
      quantity: 1,
      amount_total: 12000,
      price: {
        unit_amount: 12000,
        product: { name: "Mitaines", metadata: { product_id: "m1", size: "M", size_label_fr: "Moyen" } },
      },
    },
  ],
};

const order = mapStripeSessionToOrder(session);
assert.equal(order.shipping.method, "bus_quebec");
assert.equal(order.shipping.client_chosen_method, "bus_quebec");
assert.equal(order.shipping.fee_cad_cents, 1800);
assert.equal(order.order_number, "LFB-20261107-1234");

const merged = mergeShippingOnImport(
  { method: "a_confirmer", client_chosen_method: null, fee_cad_cents: null },
  order.shipping,
);
assert.equal(resolveClientChosenMethod(merged), "bus_quebec");
assert.equal(shippingMethodShortLabel("bus_quebec"), "Express Bus");
assert.equal(shippingMethodShortLabel("canada_post"), "Postes Canada");

// Ne pas écraser un vrai choix avec a_confirmer
const keep = mergeShippingOnImport(
  { method: "canada_post", client_chosen_method: "canada_post", fee_cad_cents: 1800 },
  { method: "a_confirmer", client_chosen_method: null, fee_cad_cents: null },
);
assert.equal(keep.client_chosen_method, "canada_post");
assert.equal(keep.method, "canada_post");

const mail = buildCustomerShopConfirmEmail(
  session,
  { items: order.items, shipping_method: "bus_quebec", shipping_fee_cents: 1800, products_cents: 12000 },
  { SUGGESTION_FROM_EMAIL: "test@exemple.ca" },
  {
    order_number: "LFB-20261107-1234",
    customer: { name: "Alex Tremblay", email: "client@exemple.ca" },
    shipping: { method: "bus_quebec", client_chosen_method: "bus_quebec", fee_cad_cents: 1800 },
    items: order.items,
    financial: { products_cents: 12000, shipping_fee_cents: 1800, amount_total_cents: 13800 },
  },
);
assert.match(mail.subject, /LFB-20261107-1234/);
assert.match(mail.text, /Express Bus/);
assert.match(mail.text, /Livraison choisie/);
assert.match(mail.text, /dépôt/);
assert.doesNotMatch(mail.text, /suivi inventé|PU123/i);

console.log("ok — test-shipping-sync");
