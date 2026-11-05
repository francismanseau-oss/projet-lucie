/**
 * Régression : success_url doit porter {CHECKOUT_SESSION_ID} ;
 * sans vrai cs_… la page ne doit jamais afficher un paiement confirmé.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKOUT_SESSION_PLACEHOLDER,
  normalizeCheckoutSuccessUrl,
  readCheckoutSessionIdFromSearch,
} from "../src/checkout-return-urls.js";
import { buildCheckoutParams } from "../src/logic.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("normalizeCheckoutSuccessUrl always includes Stripe placeholder", () => {
  const a = normalizeCheckoutSuccessUrl("", "http://127.0.0.1:8766");
  assert.match(a, /commande-confirmee\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);

  const b = normalizeCheckoutSuccessUrl(
    "http://127.0.0.1:8766/commande-confirmee.html?session_id={CHECKOUT_SESSION_ID}",
    "http://127.0.0.1:8766",
  );
  assert.equal(b.includes(CHECKOUT_SESSION_PLACEHOLDER), true);

  const c = normalizeCheckoutSuccessUrl(
    "http://127.0.0.1:8766/commande-confirmee.html",
    "http://127.0.0.1:8766",
  );
  assert.match(c, /session_id=\{CHECKOUT_SESSION_ID\}/);
});

test("readCheckoutSessionIdFromSearch rejects missing and placeholder", () => {
  assert.equal(readCheckoutSessionIdFromSearch(""), "");
  assert.equal(readCheckoutSessionIdFromSearch("?foo=1"), "");
  assert.equal(
    readCheckoutSessionIdFromSearch(`?session_id=${CHECKOUT_SESSION_PLACEHOLDER}`),
    "",
  );
  assert.equal(readCheckoutSessionIdFromSearch("?session_id=not-a-session"), "");
  assert.equal(
    readCheckoutSessionIdFromSearch(
      "?session_id=cs_test_b1b0GErQ2k6vMjKjVSxMVE8XjkquK1wcm7UZJ6hlgyelMGfZc0HS1xWXd4",
    ),
    "cs_test_b1b0GErQ2k6vMjKjVSxMVE8XjkquK1wcm7UZJ6hlgyelMGfZc0HS1xWXd4",
  );
});

test("paiement.html successUrl contains CHECKOUT_SESSION_ID", () => {
  const html = fs.readFileSync(path.join(root, "paiement.html"), "utf8");
  assert.match(
    html,
    /commande-confirmee\.html\?session_id=\{CHECKOUT_SESSION_ID\}/,
  );
});

test("commande-confirmee.html never auto-confirms without cs_ session id", () => {
  const html = fs.readFileSync(path.join(root, "commande-confirmee.html"), "utf8");
  assert.match(html, /JAMAIS|never confirms|sans session_id/i);
  assert.match(html, /confirmed === true/);
  assert.match(html, /\^cs_\[a-zA-Z0-9_\]\+/);
  assert.match(html, /Aucun identifiant de session/);
});

test("serve.json disables cleanUrls but rewrites /boutique → boutique.html", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "serve.json"), "utf8"));
  assert.equal(cfg.cleanUrls, false);
  const boutique = (cfg.rewrites || []).find((r) => r.source === "/boutique");
  assert.ok(boutique, "rewrite /boutique requis");
  assert.equal(boutique.destination, "/boutique.html");
  const confirm = (cfg.rewrites || []).find((r) => r.source === "/commande-confirmee");
  assert.equal(confirm?.destination, "/commande-confirmee.html");
});

test("buildCheckoutParams forwards success_url unchanged (placeholder intact)", () => {
  const params = buildCheckoutParams({
    resolved: [
      {
        id: "x",
        qty: 1,
        unit_amount: 100,
        name: "x",
      },
    ],
    successUrl: `http://127.0.0.1:8766/commande-confirmee.html?session_id=${CHECKOUT_SESSION_PLACEHOLDER}`,
    cancelUrl: "http://127.0.0.1:8766/commande-annulee.html",
  });
  assert.equal(
    params.success_url,
    `http://127.0.0.1:8766/commande-confirmee.html?session_id=${CHECKOUT_SESSION_PLACEHOLDER}`,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(params, "payment_method_types[0]"), false);
});
