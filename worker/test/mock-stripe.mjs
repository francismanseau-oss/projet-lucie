/**
 * Mock Stripe — aucun réseau, aucune clé réelle.
 * Distinguer clairement : ces tests ≠ tests Stripe Dashboard / API live.
 */

import { createHmac } from "node:crypto";

export const MOCK_MODE = "simulated";

export function mockSkTest() {
  return "sk_test_simulated_phase_a_no_network";
}

export function mockSkLive() {
  return "sk_live_simulated_blocked_until_gates";
}

export function mockWebhookSecret() {
  return "whsec_simulated_phase_a";
}

/** Signe un corps webhook comme Stripe (HMAC SHA-256). */
export function signWebhook(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = `${timestamp}.${rawBody}`;
  const v1 = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return { header: `t=${timestamp},v1=${v1}`, timestamp, v1 };
}

/**
 * Remplace fetch Stripe : enregistre les appels, refuse les sk_live si demandé,
 * simule succès / erreur réseau / paiement interrompu.
 */
export function installMockStripeFetch(options = {}) {
  const {
    mode = "success", // success | network_error | interrupted | api_error
    sessionId = "cs_test_simulated_abc",
    sessionUrl = "https://checkout.stripe.com/c/pay/cs_test_simulated_abc",
  } = options;

  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.includes("api.stripe.com")) {
      return original(url, init);
    }
    calls.push({ url: u, method: init.method || "GET", body: init.body?.toString?.() || "" });

    if (mode === "network_error") {
      throw new TypeError("Failed to fetch (simulated network error)");
    }
    if (mode === "interrupted") {
      const err = new Error("The operation was aborted (simulated payment interrupt)");
      err.name = "AbortError";
      throw err;
    }
    if (mode === "api_error") {
      return {
        ok: false,
        status: 402,
        async json() {
          return { error: { message: "Your card was declined (simulated)", type: "card_error" } };
        },
      };
    }

    // success
    if (u.includes("checkout/sessions")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: sessionId,
            url: sessionUrl,
            object: "checkout.session",
            payment_status: "unpaid",
            amount_total: null,
            currency: "cad",
            livemode: false,
          };
        },
      };
    }

    return {
      ok: false,
      status: 404,
      async json() {
        return { error: { message: "mock: unknown Stripe path" } };
      },
    };
  };

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

export function parseFormBody(body) {
  const params = new URLSearchParams(body);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}
