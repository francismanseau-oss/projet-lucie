/**
 * Cloudflare Worker — Stripe Checkout CAD (intégration stocks / livraison)
 *
 * Routes :
 *   GET  /health
 *   GET  /api/catalog
 *   GET  /api/order-status?session_id=cs_…
 *   POST /api/checkout
 *   POST /api/webhooks/stripe
 *   POST /api/reservations/expire  (cron / manuel test)
 */

import catalog from "./products.json" with { type: "json" };
import shippingConfigJson from "./shipping-config.json" with { type: "json" };
import {
  assertLiveSaleAllowed,
  assertProductionFullyBlocked,
  assertStripeKeyMode,
  buildCheckoutParams,
  buildLineItems,
  httpError,
  isTestWorkerEnv,
  processWebhookEvent,
  resolveOrderStatus,
  serverCheckoutTotalCents,
  verifyStripeWebhook,
} from "./logic.js";
import {
  assertInventorySellableAsync,
  attachReservationSession,
  expireReservations,
  releaseReservation,
  reserveStock,
  resolveInventoryStore,
  settlePaidReservation,
} from "./inventory.js";
import { quoteShipping, resolveCheckoutShipping } from "./shipping.js";
import { publicOrderView } from "./privacy.js";

const json = (data, status = 200, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin || "*",
      "access-control-allow-headers": "content-type, stripe-signature",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "cache-control": "no-store",
    },
  });

function siteUrl(env) {
  return (env.PUBLIC_SITE_URL || env.SITE_ORIGIN || "http://127.0.0.1:5500").replace(/\/$/, "");
}

function allowedOrigin(req, env) {
  const origin = req.headers.get("Origin") || "";
  const list = String(env.ALLOWED_ORIGINS || env.SITE_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return origin || "*";
  if (origin && list.includes(origin)) return origin;
  if (origin && (origin.includes("127.0.0.1") || origin.includes("localhost"))) return origin;
  return list[0];
}

async function stripeForm(env, path, params) {
  assertStripeKeyMode(env);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw httpError(data?.error?.message || "Erreur Stripe", 502, { stripe: data?.error });
  }
  return data;
}

async function stripeGet(env, path) {
  assertStripeKeyMode(env);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw httpError(data?.error?.message || "Erreur Stripe", 502, { stripe: data?.error });
  }
  return data;
}

function inventoryStore(env) {
  return resolveInventoryStore(env);
}

async function buildShippingResolution(env, payload) {
  let quote = null;
  if (env.SHIPPING_CONFIGURED === "true" && env.FREE_SHIPPING_AUTHORIZED !== "true") {
    const methodId = payload.shipping_method || payload.shippingMethod;
    if (!methodId) throw httpError("shipping_method requis lorsque SHIPPING_CONFIGURED=true", 400);
    quote = quoteShipping(shippingConfigJson, {
      methodId,
      destination: payload.destination || {},
      manualBusFeeCadCents: payload.manual_bus_fee_cad_cents,
      canadaPostQuoteCadCents: payload.canada_post_quote_cad_cents,
    });
  }
  return resolveCheckoutShipping(env, quote);
}

async function createCheckout(env, payload) {
  assertStripeKeyMode(env);
  assertProductionFullyBlocked(env);

  const { resolved, total_cents: products_cents } = buildLineItems(catalog, payload.items);
  assertLiveSaleAllowed(env, resolved);

  const shippingResolution = await buildShippingResolution(env, payload || {});
  const amount_total_cents = serverCheckoutTotalCents(resolved, shippingResolution);

  let reservation = null;
  const store = inventoryStore(env);

  if (env.AVAILABILITY_CONFIGURED === "true") {
    if (!store || (store.kind !== "d1" && store.kind !== "memory-tx" && store.kind !== "d1-emulated")) {
      throw httpError(
        "AVAILABILITY_CONFIGURED=true exige un store transactionnel D1 (ou MemoryTx en test) — pas KV",
        500,
      );
    }
    await assertInventorySellableAsync(
      store,
      resolved.map((r) => ({ id: r.id, qty: r.qty })),
    );
    reservation = await reserveStock(store, {
      lines: resolved.map((r) => ({ id: r.id, qty: r.qty })),
      sessionId: null,
    });
  }

  const base = siteUrl(env);
  const successUrl =
    payload.successUrl ||
    payload.success_url ||
    `${base}/commande-confirmee.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    payload.cancelUrl || payload.cancel_url || `${base}/commande-annulee.html`;

  const params = buildCheckoutParams({
    resolved,
    successUrl,
    cancelUrl,
    clientReferenceId: payload.client_reference_id || payload.clientReferenceId,
    shippingResolution,
    reservationId: reservation?.reservation_id || null,
  });

  let session;
  try {
    session = await stripeForm(env, "checkout/sessions", params);
  } catch (err) {
    if (reservation?.reservation_id && store) {
      await releaseReservation(store, reservation.reservation_id);
    }
    throw err;
  }

  // Lier réservation ↔ session Stripe précise
  if (reservation?.reservation_id && store) {
    await attachReservationSession(store, reservation.reservation_id, session.id);
  }

  if (env.ORDERS) {
    await env.ORDERS.put(
      `pending:${session.id}`,
      JSON.stringify({
        created_at: new Date().toISOString(),
        products_cents,
        shipping_fee_cents: shippingResolution.fee_cad_cents,
        shipping_mode: shippingResolution.mode,
        amount_total_cents,
        items: resolved.map((r) => ({ id: r.id, qty: r.qty, unit_amount: r.unit_amount })),
        status: "checkout_created",
        reservation_id: reservation?.reservation_id || null,
        reservation_expires_at: reservation?.expires_at || null,
        session_id: session.id,
      }),
      { expirationTtl: 60 * 60 * 24 * 7 },
    );
    if (reservation?.reservation_id) {
      await env.ORDERS.put(
        `rsv:${reservation.reservation_id}`,
        session.id,
        { expirationTtl: 60 * 60 * 24 * 7 },
      );
    }
  }

  return {
    id: session.id,
    url: session.url,
    amount_total_cents,
    products_cents,
    shipping_fee_cents: shippingResolution.fee_cad_cents,
    shipping_mode: shippingResolution.mode,
    currency: "cad",
    reservation_id: reservation?.reservation_id || null,
    inventory_store: store?.kind || null,
  };
}

async function handleInventoryAfterWebhook(env, event, result) {
  const store = inventoryStore(env);
  const sessionObj = event.data?.object || {};
  const sessionId = sessionObj.id;
  if (!store || !sessionId) return result;

  let reservationId =
    sessionObj.metadata?.reservation_id || null;
  if (env.ORDERS) {
    const pendingRaw = await env.ORDERS.get(`pending:${sessionId}`);
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    reservationId = pending?.reservation_id || reservationId;
  }

  if (!reservationId) return result;

  if (result.confirmed) {
    const settlement = await settlePaidReservation(store, reservationId, { sessionId });
    result.inventory = settlement;

    if (settlement.outcome === "paid_no_stock" || settlement.outcome === "missing_reservation") {
      if (env.ORDERS) {
        const prevRaw = await env.ORDERS.get(`order:${sessionId}`);
        const prev = prevRaw ? JSON.parse(prevRaw) : {};
        await env.ORDERS.put(
          `order:${sessionId}`,
          JSON.stringify({
            ...prev,
            session_id: sessionId,
            payment_status: sessionObj.payment_status || prev.payment_status || "paid",
            amount_total: sessionObj.amount_total ?? prev.amount_total,
            currency: sessionObj.currency || prev.currency,
            customer_email:
              sessionObj.customer_details?.email ||
              sessionObj.customer_email ||
              prev.customer_email ||
              null,
            status: "paid_no_stock",
            inventory_outcome: settlement.outcome,
            inventory_action: settlement.action,
            updated_at: new Date().toISOString(),
          }),
          { expirationTtl: 60 * 60 * 24 * 365 },
        );
        await env.ORDERS.put(
          `alert:paid_no_stock:${sessionId}`,
          JSON.stringify(settlement),
          { expirationTtl: 60 * 60 * 24 * 365 },
        );
      }
      // Commande payée mais pas confirmée stock — UI ne doit pas traiter comme fulfilled
      result.confirmed = false;
      result.paid_no_stock = true;
    } else if (env.ORDERS) {
      const prevRaw = await env.ORDERS.get(`order:${sessionId}`);
      if (prevRaw) {
        const prev = JSON.parse(prevRaw);
        prev.inventory_outcome = settlement.outcome;
        await env.ORDERS.put(`order:${sessionId}`, JSON.stringify(prev), {
          expirationTtl: 60 * 60 * 24 * 365,
        });
      }
    }
    return result;
  }

  if (result.failed || result.expired || event.type === "checkout.session.expired") {
    const rel = await releaseReservation(store, reservationId, {
      reason: result.expired ? "expired" : "released",
    });
    result.inventory = { released: rel.released, ...rel };
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "content-type, stripe-signature",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        },
      });
    }

    try {
      if (request.method === "GET" && (path === "/health" || path === "/api/health")) {
        const key = String(env.STRIPE_SECRET_KEY || "");
        const store = inventoryStore(env);
        return json(
          {
            ok: true,
            phase: "A-integration",
            worker_env: isTestWorkerEnv(env) ? "test" : env.WORKER_ENV || "dev",
            products: (catalog.products || []).length,
            production_unlocked: env.PRODUCTION_UNLOCKED === "true",
            shipping_configured: env.SHIPPING_CONFIGURED === "true",
            availability_configured: env.AVAILABILITY_CONFIGURED === "true",
            package_profiles_configured: env.PACKAGE_PROFILES_CONFIGURED === "true",
            commercial_terms_configured: env.COMMERCIAL_TERMS_CONFIGURED === "true",
            free_shipping_authorized: env.FREE_SHIPPING_AUTHORIZED === "true",
            allow_checkout_without_shipping: env.ALLOW_CHECKOUT_WITHOUT_SHIPPING === "true",
            force_test_keys: env.FORCE_TEST_KEYS_ONLY === "true",
            inventory_store: store?.kind || "none",
            inventory_engine: store?.engine || null,
            stripe_mode: key.startsWith("sk_live")
              ? "live_blocked_or_unlocked"
              : key.startsWith("sk_test")
                ? "test"
                : "unset",
            note: "Redirect ≠ payé. D1/MemoryTx pour stocks. PII masquée sur order-status.",
          },
          200,
          origin,
        );
      }

      if (request.method === "GET" && path === "/api/catalog") {
        return json(
          {
            currency: catalog.currency,
            count: (catalog.products || []).length,
            products: (catalog.products || []).map((p) => ({
              id: p.id,
              name_fr: p.name_fr,
              price_cad_cents: p.price_cad_cents,
              availability: p.availability,
              active: p.active !== false,
            })),
          },
          200,
          origin,
        );
      }

      if (path === "/api/catalog" && request.method !== "GET" && request.method !== "OPTIONS") {
        return json({ error: "Catalogue en lecture seule" }, 405, origin);
      }

      if (request.method === "GET" && path === "/api/order-status") {
        const sessionId = url.searchParams.get("session_id") || "";
        const status = await resolveOrderStatus(env, sessionId, (id) =>
          stripeGet(env, `checkout/sessions/${encodeURIComponent(id)}`),
        );
        return json(publicOrderView(status), 200, origin);
      }

      if (request.method === "POST" && path === "/api/checkout") {
        const payload = await request.json();
        const session = await createCheckout(env, payload || {});
        return json(session, 200, origin);
      }

      if (request.method === "POST" && path === "/api/reservations/expire") {
        const store = inventoryStore(env);
        if (!store) return json({ error: "Pas de store inventaire" }, 500, origin);
        const out = await expireReservations(store, {});
        return json(out, 200, origin);
      }

      if (request.method === "POST" && path === "/api/webhooks/stripe") {
        const raw = await request.text();
        try {
          await verifyStripeWebhook(
            env.STRIPE_WEBHOOK_SECRET,
            raw,
            request.headers.get("stripe-signature"),
          );
        } catch (sigErr) {
          return json({ error: sigErr.message || "Signature invalide" }, sigErr.status || 400, origin);
        }

        let event;
        try {
          event = JSON.parse(raw);
        } catch (_) {
          return json({ error: "JSON webhook invalide" }, 400, origin);
        }

        try {
          let result = await processWebhookEvent(env, event);
          if (!result.duplicate) {
            result = await handleInventoryAfterWebhook(env, event, result);
          }
          return json(result, 200, origin);
        } catch (procErr) {
          return json(
            { error: procErr.message || "Erreur traitement webhook" },
            procErr.status || 500,
            origin,
          );
        }
      }

      return json({ error: "Not found" }, 404, origin);
    } catch (err) {
      const status = err.status || 500;
      return json(
        { error: err.message || "Erreur serveur", details: err.details || undefined },
        status,
        origin,
      );
    }
  },
};
