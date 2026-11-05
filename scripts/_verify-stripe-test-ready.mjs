/**
 * Vérif locale Stripe TEST — n'affiche jamais les secrets.
 * Usage: node scripts/_verify-stripe-test-ready.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vars = fs.readFileSync(path.join(root, "worker/.dev.vars"), "utf8");
const sk = (vars.match(/^STRIPE_SECRET_KEY=(.+)$/m) || [])[1]?.trim();
const wh = (vars.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m) || [])[1]?.trim();

const out = { steps: {} };

out.steps.key_present = !!(sk && sk.startsWith("sk_test_") && sk.length > 20);
out.steps.key_is_live = !!(sk && sk.startsWith("sk_live_"));
out.steps.webhook_is_placeholder = !wh || /PENDING|REMPLACER/i.test(wh);

if (!out.steps.key_present || out.steps.key_is_live) {
  out.blocked = out.steps.key_is_live ? "live_key_forbidden" : "missing_sk_test";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const bal = await fetch("https://api.stripe.com/v1/balance", {
  headers: { Authorization: `Bearer ${sk}` },
});
const balBody = await bal.json().catch(() => ({}));
out.steps.stripe_api_http = bal.status;
out.steps.stripe_key_recognized = bal.status === 200 && !balBody.error;
out.steps.stripe_error_code = balBody.error?.code || null;
out.steps.stripe_error_type = balBody.error?.type || null;

const health = await fetch("http://127.0.0.1:8787/api/health");
const healthJson = await health.json();
out.steps.worker_health_ok = health.ok && healthJson.ok === true;
out.steps.worker_stripe_mode = healthJson.stripe_mode;
out.steps.force_test_keys = healthJson.force_test_keys;
out.steps.shipping_configured = healthJson.shipping_configured;
out.steps.allow_checkout_without_shipping = healthJson.allow_checkout_without_shipping;
out.steps.availability_configured = healthJson.availability_configured;

const catalog = await fetch("http://127.0.0.1:8787/api/catalog", {
  headers: { Origin: "http://127.0.0.1:8766" },
});
out.steps.catalog_ok = catalog.ok;
out.steps.cors_acao = catalog.headers.get("access-control-allow-origin");

const boutique = await fetch("http://127.0.0.1:8766/boutique.html");
const cfg = await fetch("http://127.0.0.1:8766/checkout-config.js");
const cfgText = await cfg.text();
out.steps.boutique_ok = boutique.ok;
out.steps.checkout_config_points_8787 = /127\.0\.0\.1:8787/.test(cfgText);
out.steps.checkout_config_mode_test = /mode:\s*["']test["']/.test(cfgText);

const payload = { items: [{ id: "mitaines-m-renard", qty: 1 }] };
const co = await fetch("http://127.0.0.1:8787/api/checkout", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://127.0.0.1:8766",
  },
  body: JSON.stringify(payload),
});
const coJson = await co.json().catch(() => ({}));
out.steps.checkout_http = co.status;
out.steps.checkout_ok = co.ok && !!(coJson.url || coJson.id || coJson.session_id);
out.steps.session_id_prefix = String(coJson.id || coJson.session_id || "").slice(0, 8);
out.steps.checkout_url_host = coJson.url ? new URL(coJson.url).host : null;
out.steps.checkout_url_is_stripe = !!(coJson.url && coJson.url.includes("checkout.stripe.com"));
out.steps.shipping_fee_cents = coJson.shipping_fee_cents;
out.steps.shipping_mode = coJson.shipping_mode;
out.steps.checkout_error = co.ok ? null : coJson.error || coJson.message || `http_${co.status}`;

const sid = coJson.id || coJson.session_id;
if (sid && out.steps.checkout_ok) {
  const sess = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
    { headers: { Authorization: `Bearer ${sk}` } },
  );
  const sessJson = await sess.json().catch(() => ({}));
  out.steps.session_livemode = sessJson.livemode;
  out.steps.session_status = sessJson.status;
  out.steps.session_payment_status = sessJson.payment_status;
}

out.ready_for_manual_card_test = !!(
  out.steps.stripe_key_recognized &&
  out.steps.worker_health_ok &&
  out.steps.checkout_ok &&
  out.steps.session_livemode === false &&
  out.steps.shipping_mode === "phase_a_deferred_test_only" &&
  out.steps.shipping_fee_cents === 0
);

out.webhook_status =
  out.steps.webhook_is_placeholder
    ? "blocked_until_stripe_cli — whsec local placeholder; payment can still succeed; local webhook signature will fail until stripe listen"
    : "whsec_present";

console.log(JSON.stringify(out, null, 2));
process.exit(out.ready_for_manual_card_test ? 0 : 2);
