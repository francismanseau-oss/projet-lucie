/**
 * Cloudflare Worker — Stripe Checkout CAD (intégration stocks / livraison)
 *
 * Routes :
 *   GET  /health
 *   GET  /api/catalog
 *   GET  /api/shipping-methods
 *   GET  /api/order-status?session_id=cs_…
 *   POST /api/shipping-quote
 *   POST /api/shipping-hold/confirm
 *   POST /api/shipping-hold/resume
 *   POST /api/checkout
 *   POST /api/orders/resend-bon
 *   POST /api/suggestion
 *   POST /api/webhooks/stripe
 *   POST /api/reservations/expire
 */

import catalog from "./products.json" with { type: "json" };
import productSizes from "./product-sizes.json" with { type: "json" };
import shippingConfigJson from "./shipping-config.json" with { type: "json" };
import surMesureConfig from "./sur-mesure-config.json" with { type: "json" };
import { validateMeasurements } from "./sur-mesure-pricing.js";
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
import {
  confirmShippingHold,
  createShippingHold,
  listSelectableMethods,
  quoteTokenToResolution,
  resolveHoldToQuoteToken,
  signQuoteToken,
  tryAutoQuote,
  verifyQuoteToken,
} from "./shipping-quote-service.js";
import {
  buildOrderArchive,
  ensureOrderNumber,
  putOrderArchive,
  wasNotifySent,
} from "./order-archive.js";
import { normalizeCheckoutSuccessUrl } from "./checkout-return-urls.js";
import { publicOrderView } from "./privacy.js";
import { handleSuggestion } from "./suggestion.js";
import { notifyLucieOrderPaid, resendOrderBon } from "./lucie-notify.js";

function quoteSecret(env) {
  return env.QUOTE_TOKEN_SECRET || env.STRIPE_WEBHOOK_SECRET || "local-dev-quote";
}

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
  // Paiement unique : jeton de cote verrouillé (grille / API / Lucie)
  if (payload?.quote_token) {
    const body = await verifyQuoteToken(quoteSecret(env), payload.quote_token);
    return quoteTokenToResolution(body);
  }

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

async function handleShippingQuote(env, payload = {}) {
  const methodId = payload.shipping_method || payload.shippingMethod;
  if (!methodId) throw httpError("shipping_method requis", 400);
  const destination = payload.destination || {};
  const auto = tryAutoQuote(shippingConfigJson, {
    methodId,
    destination,
    canadaPostApiFeeCadCents: payload.canada_post_quote_cad_cents,
  });

  if (auto.status === "quoted") {
    const token = await signQuoteToken(quoteSecret(env), {
      method_id: auto.quote.method_id,
      fee_cad_cents: auto.quote.fee_cad_cents,
      destination: auto.quote.destination || destination,
      source: auto.quote.source,
      invented: false,
    });
    return {
      status: "quoted",
      fee_cad_cents: auto.quote.fee_cad_cents,
      currency: "cad",
      method_id: auto.quote.method_id,
      source: auto.quote.source,
      invented: false,
      quote_token: token,
      expires_in_sec: 30 * 60,
      message_fr: "Frais de livraison confirmés — total final avant paiement unique.",
    };
  }

  // Cote impossible → hold Lucie (pas de Checkout, pas de 2ᵉ facture)
  const hold = await createShippingHold(env, {
    method_id: methodId,
    destination: auto.destination,
    items: payload.items || [],
    customer_email: payload.customer_email || null,
    customer_name: payload.customer_name || null,
    customer_phone: payload.customer_phone || null,
    reason: auto.reason,
    message_fr: auto.message_fr,
  });

  const base = siteUrl(env);
  return {
    status: "quote_required",
    hold_id: hold.hold_id,
    resume_token: hold.resume_token,
    method_id: methodId,
    reason: auto.reason,
    message_fr:
      auto.message_fr ||
      "Tarif à confirmer par Lucie avant le paiement unique. Aucun frais inventé.",
    resume_url: `${base}/paiement.html?hold=${encodeURIComponent(hold.hold_id)}&resume=${encodeURIComponent(hold.resume_token)}`,
  };
}

async function createCheckout(env, payload) {
  assertStripeKeyMode(env);
  assertProductionFullyBlocked(env);

  const { resolved, total_cents: products_cents } = buildLineItems(catalog, payload.items, {
    validateMeasurements,
    measureSpecForCategory: (category) =>
      surMesureConfig.measurements_by_category?.[category] || { fields: [] },
    productSizes,
  });
  assertLiveSaleAllowed(env, resolved);

  // Boutique réelle : exiger quote_token sauf parcours test différé explicite
  const wantsBoutiqueShipping =
    payload.shipping_method ||
    payload.quote_token ||
    payload.require_shipping_quote === true;
  if (wantsBoutiqueShipping && !payload.quote_token) {
    throw httpError(
      "quote_token requis pour le paiement unique (produits + livraison). Appelez d’abord /api/shipping-quote.",
      400,
    );
  }

  const shippingResolution = await buildShippingResolution(env, payload || {});
  const amount_total_cents = serverCheckoutTotalCents(resolved, shippingResolution);

  let reservation = null;
  const store = inventoryStore(env);
  const stockLines = resolved.filter((r) => !r.skip_inventory && !r.custom);

  if (env.AVAILABILITY_CONFIGURED === "true" && stockLines.length) {
    if (!store || (store.kind !== "d1" && store.kind !== "memory-tx" && store.kind !== "d1-emulated")) {
      throw httpError(
        "AVAILABILITY_CONFIGURED=true exige un store transactionnel D1 (ou MemoryTx en test) — pas KV",
        500,
      );
    }
    await assertInventorySellableAsync(
      store,
      stockLines.map((r) => ({ id: r.inventory_id || r.id, qty: r.qty })),
    );
    reservation = await reserveStock(store, {
      lines: stockLines.map((r) => ({ id: r.inventory_id || r.id, qty: r.qty })),
      sessionId: null,
    });
  }

  const base = siteUrl(env);
  const successUrl = normalizeCheckoutSuccessUrl(
    payload.successUrl || payload.success_url || "",
    base,
  );
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
    const order_number = await ensureOrderNumber(env, session.id);
    let tokenMeta = null;
    if (payload.quote_token) {
      try {
        tokenMeta = await verifyQuoteToken(quoteSecret(env), payload.quote_token);
      } catch (_) {
        tokenMeta = null;
      }
    }
    await env.ORDERS.put(
      `pending:${session.id}`,
      JSON.stringify({
        created_at: new Date().toISOString(),
        order_number,
        products_cents,
        shipping_fee_cents: shippingResolution.fee_cad_cents,
        shipping_mode: shippingResolution.mode,
        shipping_method: shippingResolution.quote?.method_id || null,
        shipping_source: shippingResolution.quote?.source || null,
        destination: shippingResolution.quote?.destination || payload.destination || null,
        customer_email: payload.customer_email || null,
        customer_name: payload.customer_name || null,
        customer_phone: payload.customer_phone || null,
        amount_total_cents,
        items: resolved.map((r) => ({
          id: r.id,
          name: r.name,
          product_number: r.product_number ?? null,
          qty: r.qty,
          unit_amount: r.unit_amount,
          custom: !!r.custom,
          skip_inventory: !!r.skip_inventory,
          custom_config: r.custom_config || null,
        })),
        status: "checkout_created",
        reservation_id: reservation?.reservation_id || null,
        reservation_expires_at: reservation?.expires_at || null,
        session_id: session.id,
        hold_id: tokenMeta?.hold_id || null,
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
    shipping_method: shippingResolution.quote?.method_id || null,
    currency: "cad",
    reservation_id: reservation?.reservation_id || null,
    inventory_store: store?.kind || null,
    single_payment: true,
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
            suggestion_mail:
              env.SUGGESTION_MOCK === "true" ||
              !env.RESEND_API_KEY ||
              String(env.RESEND_API_KEY).includes("REMPLACER")
                ? "mock"
                : "resend",
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

      if (request.method === "GET" && path === "/api/shipping-methods") {
        return json(
          {
            methods: listSelectableMethods(shippingConfigJson),
            policy: {
              single_payment: true,
              no_invented_rates: true,
              no_second_invoice: true,
            },
          },
          200,
          origin,
        );
      }

      if (request.method === "POST" && path === "/api/shipping-quote") {
        const payload = await request.json();
        const out = await handleShippingQuote(env, payload || {});
        return json(out, 200, origin);
      }

      if (request.method === "POST" && path === "/api/shipping-hold/confirm") {
        const payload = await request.json();
        // Confirmation locale / admin — secret partagé optionnel
        const expected = env.SHIPPING_HOLD_CONFIRM_SECRET;
        if (expected && payload?.confirm_secret !== expected) {
          throw httpError("confirm_secret invalide", 403);
        }
        const hold = await confirmShippingHold(env, {
          hold_id: payload.hold_id,
          fee_cad_cents: payload.fee_cad_cents,
          actor: payload.actor || "lucie",
        });
        return json(
          {
            ok: true,
            hold_id: hold.hold_id,
            status: hold.status,
            fee_cad_cents: hold.fee_cad_cents,
            resume_token: hold.resume_token,
            message_fr:
              "Tarif confirmé. Le client peut reprendre le paiement unique (produits + livraison).",
          },
          200,
          origin,
        );
      }

      if (request.method === "POST" && path === "/api/shipping-hold/resume") {
        const payload = await request.json();
        const out = await resolveHoldToQuoteToken(env, quoteSecret(env), {
          hold_id: payload.hold_id,
          resume_token: payload.resume_token,
        });
        return json(
          {
            status: "quoted",
            hold_id: out.hold.hold_id,
            fee_cad_cents: out.fee_cad_cents,
            method_id: out.hold.method_id,
            destination: out.hold.destination,
            quote_token: out.quote_token,
            items: out.hold.items,
            message_fr: "Tarif prêt — un seul paiement Stripe pour le total.",
          },
          200,
          origin,
        );
      }

      if (request.method === "POST" && path === "/api/checkout") {
        const payload = await request.json();
        const session = await createCheckout(env, payload || {});
        return json(session, 200, origin);
      }

      if (request.method === "POST" && path === "/api/orders/resend-bon") {
        const payload = await request.json();
        const expected = env.SHIPPING_HOLD_CONFIRM_SECRET;
        if (expected && payload?.confirm_secret !== expected) {
          throw httpError("confirm_secret invalide", 403);
        }
        const out = await resendOrderBon(env, {
          session_id: payload.session_id,
          order_number: payload.order_number,
        });
        return json(out, out.status && !out.ok ? out.status : 200, origin);
      }

      if (request.method === "POST" && path === "/api/suggestion") {
        const result = await handleSuggestion(env, request);
        return json(result, 200, origin);
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
          // Archive + bon Lucie seulement après confirmation paiement (pas redirect)
          if (result.confirmed && !result.duplicate) {
            const obj = event.data?.object || {};
            try {
              if (!(await wasNotifySent(env, obj.id))) {
                let pending = null;
                if (env.ORDERS) {
                  const raw = await env.ORDERS.get(`pending:${obj.id}`);
                  if (raw) pending = JSON.parse(raw);
                }
                const order_number = await ensureOrderNumber(env, obj.id);
                const archive = buildOrderArchive({
                  sessionObj: obj,
                  pending,
                  orderNumber: order_number,
                  shipping: {
                    method_id: pending?.shipping_method,
                    fee_cad_cents: pending?.shipping_fee_cents,
                    destination: pending?.destination,
                    source: pending?.shipping_source,
                  },
                });
                await putOrderArchive(env, archive);
                result.lucie_notify = await notifyLucieOrderPaid(env, obj);
              } else {
                result.lucie_notify = { skipped: true, reason: "already_notified", ok: true };
              }
            } catch (mailErr) {
              result.lucie_notify = {
                ok: false,
                error: mailErr.message || "notify_failed",
              };
            }
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
