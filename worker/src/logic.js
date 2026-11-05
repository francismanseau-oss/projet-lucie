/**
 * Logique pure Phase A — testable sans clés Stripe ni réseau.
 */

import {
  inventoryStockId,
  productSizesMap,
  resolveSizeForLine,
} from "./product-sizes-core.js";

export function httpError(message, status, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) Object.assign(err, extra);
  return err;
}

export function productMapFromCatalog(catalog) {
  const map = new Map();
  for (const p of catalog.products || []) map.set(p.id, p);
  return map;
}

/**
 * Construit les lignes CAD depuis le catalogue serveur. Ignore price/browser.
 * @param catalog — produits boutique
 * @param items — lignes panier
 * @param opts.validateMeasurements — fn(measureSpec, unit, values)
 * @param opts.measureSpecForCategory — fn(category) → { fields: [...] }
 * @param opts.productSizes — document catalog/product-sizes.json (optionnel)
 * Prix custom = products.json uniquement (pas de 2e catalogue).
 */
export function buildLineItems(catalog, items, opts = {}) {
  const map = productMapFromCatalog(catalog);
  const sizesMap = opts.productSizes ? productSizesMap(opts.productSizes) : null;
  const resolved = [];
  const validateMeasurements = opts.validateMeasurements || null;

  if (!Array.isArray(items) || items.length === 0) {
    throw httpError("Panier vide", 400);
  }

  for (const raw of items) {
    const id = String(raw?.id || "");
    const qty = Math.floor(Number(raw?.qty) || 0);
    if (!id || qty < 1 || qty > 20) throw httpError(`Ligne invalide: ${id || "(vide)"}`, 400);

    // Prix navigateur toujours ignorés
    if (raw && Object.prototype.hasOwnProperty.call(raw, "price")) {
      /* ignoré */
    }
    if (raw && Object.prototype.hasOwnProperty.call(raw, "price_cad_cents")) {
      /* ignoré */
    }

    if (id.startsWith("custom:")) {
      const cfg = raw.custom_config;
      if (!cfg || typeof cfg !== "object") {
        throw httpError(`Configuration sur mesure manquante: ${id}`, 400);
      }
      // product_id = id Boutique officiel (même prix que products.json)
      const productId = String(cfg.product_id || "");
      const product = map.get(productId);
      if (!product || product.active === false) {
        throw httpError(`Produit boutique inconnu pour sur mesure: ${productId || "(vide)"}`, 400);
      }
      const unitAmount = product.price_cad_cents;
      if (!Number.isInteger(unitAmount) || unitAmount < 0) {
        throw httpError(`Prix serveur invalide pour ${productId}`, 500);
      }

      const measureUnit = cfg.unit;
      const measurements =
        cfg.measurements && typeof cfg.measurements === "object" ? cfg.measurements : {};
      if (validateMeasurements && opts.measureSpecForCategory) {
        const spec = opts.measureSpecForCategory(product.category);
        const meas = validateMeasurements(spec, measureUnit, measurements);
        if (!meas.ok) {
          throw httpError("Mesures sur mesure invalides", 400, { reason: meas.reason, field: meas.field });
        }
      } else if (!measureUnit || (measureUnit !== "in" && measureUnit !== "cm")) {
        // catégories sans champs mesures (ex. foulards) : unité optionnelle si aucune mesure
        const hasMeas = Object.values(measurements).some((v) => v !== "" && v != null);
        if (hasMeas) throw httpError("Unité de mesure sur mesure requise (in|cm)", 400);
      }

      const productNumber =
        product.product_number != null
          ? Number(product.product_number)
          : cfg.product_number != null
            ? Number(cfg.product_number)
            : null;
      // Raynaud / commentaires : jamais de supplément inventé
      // CSM : skip_inventory — ne décrémente pas le stock régulier (sauf décision Lucie plus tard)
      resolved.push({
        id,
        name: `Sur mesure — ${product.name_fr}`,
        product_number: productNumber,
        qty,
        unit_amount: unitAmount,
        line_total_cents: unitAmount * qty,
        availability: product.availability || "contact",
        custom: true,
        skip_inventory: true,
        custom_config: {
          product_id: productId,
          product_number: productNumber,
          csm_code: productNumber != null ? `${productNumber}-CSM` : "CSM",
          category: product.category,
          unit: measureUnit || null,
          measurements,
          measurements_cm: cfg.measurements_cm || null,
          raynaud: !!cfg.raynaud,
          comments: String(cfg.comments || "").slice(0, 800),
          leather: "noir",
          price_source: "catalog/products.json",
        },
        client_price_ignored:
          raw.price != null || raw.price_cad != null || raw.price_cad_cents != null
            ? Number(
                raw.price_cad_cents ??
                  Math.round(Number(raw.price || raw.price_cad || 0) * (raw.price_cad_cents ? 1 : 100)),
              )
            : null,
      });
      continue;
    }

    const product = map.get(id);
    if (!product || product.active === false) throw httpError(`Produit inconnu: ${id}`, 400);

    const unit = product.price_cad_cents;
    if (!Number.isInteger(unit) || unit < 0) {
      throw httpError(`Prix serveur invalide pour ${id}`, 500);
    }

    let size = null;
    let size_label_fr = null;
    let size_label_en = null;
    let inventory_id = product.id;
    if (sizesMap) {
      const sizeEntry = sizesMap.get(product.id) || null;
      const sized = resolveSizeForLine(sizeEntry, raw?.size ?? raw?.size_code);
      if (!sized.ok) {
        const msg =
          sized.reason === "size_required"
            ? `Taille requise pour ${product.name_fr}`
            : sized.reason === "size_sold_out"
              ? `Taille épuisée pour ${product.name_fr}`
              : `Taille invalide pour ${product.name_fr}`;
        throw httpError(msg, sized.reason === "size_sold_out" ? 409 : 400, {
          product_id: product.id,
          reason: sized.reason,
          size: sized.size || null,
        });
      }
      size = sized.size;
      size_label_fr = sized.label_fr;
      size_label_en = sized.label_en;
      inventory_id = inventoryStockId(product.id, size, sizeEntry);
    } else if (raw?.size) {
      size = String(raw.size).trim() || null;
      size_label_fr = raw.size_label_fr || size;
      size_label_en = raw.size_label_en || size;
      inventory_id = size ? `${product.id}::${size}` : product.id;
    }

    const displayName =
      size && size !== "unique"
        ? `${product.name_fr} — ${size_label_fr || size}`
        : size === "unique" && size_label_fr && /universelle/i.test(size_label_fr)
          ? `${product.name_fr} — ${size_label_fr}`
          : product.name_fr;

    resolved.push({
      id: product.id,
      inventory_id,
      size,
      size_label_fr,
      size_label_en,
      name: displayName,
      product_number: product.product_number != null ? Number(product.product_number) : null,
      qty,
      unit_amount: unit,
      line_total_cents: unit * qty,
      availability: product.availability || "contact",
      custom: false,
      skip_inventory: false,
      client_price_ignored:
        raw.price != null || raw.price_cad != null || raw.price_cad_cents != null
          ? Number(raw.price_cad_cents ?? Math.round(Number(raw.price || raw.price_cad || 0) * (raw.price_cad_cents ? 1 : 100)))
          : null,
    });
  }

  const total_cents = resolved.reduce((s, r) => s + r.line_total_cents, 0);
  return { resolved, total_cents, currency: "cad" };
}

export function assertNoShippingFeesInParams(params) {
  const keys = Object.keys(params || {});
  const shippingFeeKeys = keys.filter(
    (k) =>
      k.startsWith("shipping_options") ||
      k.includes("shipping_rate") ||
      (k.includes("shipping") && k.includes("amount")),
  );
  if (shippingFeeKeys.length) {
    throw httpError("Frais de livraison interdits en Phase A", 500, { shippingFeeKeys });
  }
}

/** Worker test/préprod : sk_live toujours interdit. */
export function isTestWorkerEnv(env) {
  return env.WORKER_ENV === "test" || env.FORCE_TEST_KEYS_ONLY === "true";
}

export function assertStripeKeyMode(env) {
  const key = env.STRIPE_SECRET_KEY || "";
  if (!key) throw httpError("STRIPE_SECRET_KEY manquante", 500);

  const testOnly =
    env.WORKER_ENV === "test" || env.FORCE_TEST_KEYS_ONLY === "true";

  if (key.startsWith("sk_live")) {
    if (testOnly) {
      throw httpError(
        "Ce Worker est en mode TEST : les clés sk_live sont interdites. Utiliser sk_test_…",
        403,
      );
    }
    const unlocked =
      env.PRODUCTION_UNLOCKED === "true" &&
      env.SHIPPING_CONFIGURED === "true" &&
      env.AVAILABILITY_CONFIGURED === "true";
    if (!unlocked) {
      throw httpError(
        "Paiements réels (sk_live) bloqués : livraison, disponibilité des articles et déblocage production non configurés.",
        403,
      );
    }
  } else if (!key.startsWith("sk_test")) {
    throw httpError("Clé Stripe invalide : utiliser sk_test_… en Phase A / préprod", 500);
  }
}

/**
 * Statut commande — JAMAIS confirmé par la seule redirection navigateur.
 * Sources autorisées : KV (webhook) et/ou retrieve Stripe côté serveur.
 */
export async function resolveOrderStatus(env, sessionId, fetchSession) {
  const id = String(sessionId || "").trim();
  if (!id || !/^cs_[a-zA-Z0-9_]+$/.test(id)) {
    throw httpError("session_id invalide", 400);
  }

  // Redirect navigateur ≠ paiement : on part de « pending » / « unknown »
  let fromKv = null;
  if (env.ORDERS) {
    const raw = await env.ORDERS.get(`order:${id}`);
    if (raw) {
      try {
        fromKv = JSON.parse(raw);
      } catch (_) {
        fromKv = null;
      }
    }
  }

  if (fromKv && fromKv.status === "paid_confirmed") {
    return {
      session_id: id,
      ui_state: "confirmed",
      confirmed: true,
      source: "webhook_kv",
      payment_status: fromKv.payment_status || "paid",
      amount_total: fromKv.amount_total ?? null,
      currency: fromKv.currency || "cad",
      customer_email: fromKv.customer_email || null,
      inventory_outcome: fromKv.inventory_outcome || null,
      note: "Confirmé par webhook serveur (pas par la redirection).",
    };
  }

  if (fromKv && fromKv.status === "paid_no_stock") {
    return {
      session_id: id,
      ui_state: "paid_no_stock",
      confirmed: false,
      paid: true,
      source: "webhook_kv",
      payment_status: fromKv.payment_status || "paid",
      amount_total: fromKv.amount_total ?? null,
      currency: fromKv.currency || "cad",
      customer_email: fromKv.customer_email || null,
      inventory_outcome: "paid_no_stock",
      note: "Paiement reçu mais stock indisponible — réconciliation Lucie / remboursement. Pas de survente.",
    };
  }

  if (fromKv && (fromKv.status === "payment_failed" || fromKv.status === "canceled")) {
    return {
      session_id: id,
      ui_state: fromKv.status === "canceled" ? "canceled" : "failed",
      confirmed: false,
      source: "webhook_kv",
      payment_status: fromKv.payment_status || fromKv.status,
      amount_total: fromKv.amount_total ?? null,
      currency: fromKv.currency || "cad",
      note: "Échec ou annulation enregistrés côté serveur.",
    };
  }

  if (typeof fetchSession !== "function") {
    return {
      session_id: id,
      ui_state: "pending",
      confirmed: false,
      source: "none",
      payment_status: null,
      note: "En attente de vérification Stripe / webhook. La redirection seule ne confirme pas le paiement.",
    };
  }

  const session = await fetchSession(id);
  const payment_status = session.payment_status || null;
  const status = session.status || null;

  if (payment_status === "paid" || payment_status === "no_payment_required") {
    if (env.ORDERS) {
      let pending = null;
      try {
        const raw = await env.ORDERS.get(`pending:${id}`);
        if (raw) pending = JSON.parse(raw);
      } catch (_) {
        pending = null;
      }
      await env.ORDERS.put(
        `order:${id}`,
        JSON.stringify({
          session_id: id,
          payment_status,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email || session.customer_email || null,
          metadata: session.metadata || {},
          confirmed_at: new Date().toISOString(),
          status: "paid_confirmed",
          confirmed_via: "stripe_retrieve",
          order_number: pending?.order_number || null,
          items: Array.isArray(pending?.items) ? pending.items : [],
          shipping: {
            method: pending?.shipping_method || null,
            fee_cad_cents:
              pending?.shipping_fee_cents != null ? Number(pending.shipping_fee_cents) : null,
            destination: pending?.destination || null,
            source: pending?.shipping_source || null,
          },
          financial: {
            products_cents:
              pending?.products_cents != null ? Number(pending.products_cents) : null,
            shipping_fee_cents:
              pending?.shipping_fee_cents != null ? Number(pending.shipping_fee_cents) : null,
            amount_total_cents: session.amount_total ?? pending?.amount_total_cents ?? null,
          },
        }),
        { expirationTtl: 60 * 60 * 24 * 365 },
      );
    }
    return {
      session_id: id,
      ui_state: "confirmed",
      confirmed: true,
      source: "stripe_retrieve",
      payment_status,
      amount_total: session.amount_total ?? null,
      currency: session.currency || "cad",
      customer_email: session.customer_details?.email || session.customer_email || null,
      note: "Confirmé par retrieve Stripe serveur (pas par la redirection).",
    };
  }

  if (status === "expired") {
    return {
      session_id: id,
      ui_state: "expired",
      confirmed: false,
      source: "stripe_retrieve",
      payment_status,
      note: "Session expirée — non payée.",
    };
  }

  if (status === "open" || payment_status === "unpaid") {
    return {
      session_id: id,
      ui_state: "pending",
      confirmed: false,
      source: "stripe_retrieve",
      payment_status,
      note: "Paiement non confirmé. Attendre le webhook ou réessayer.",
    };
  }

  return {
    session_id: id,
    ui_state: "unpaid",
    confirmed: false,
    source: "stripe_retrieve",
    payment_status,
    note: "Statut non payé — la page de succès ne doit pas afficher une commande confirmée.",
  };
}

/**
 * Production réelle bloquée tant que Lucie n’a pas confirmé stocks, colis, tarifs, termes.
 * S’applique à sk_live (et à toute tentative PRODUCTION_UNLOCKED).
 */
export function assertProductionFullyBlocked(env) {
  const key = env.STRIPE_SECRET_KEY || "";
  const wantsLive = key.startsWith("sk_live") || env.PRODUCTION_UNLOCKED === "true";
  if (!wantsLive) return;

  const required = [
    ["PRODUCTION_UNLOCKED", env.PRODUCTION_UNLOCKED],
    ["SHIPPING_CONFIGURED", env.SHIPPING_CONFIGURED],
    ["AVAILABILITY_CONFIGURED", env.AVAILABILITY_CONFIGURED],
    ["PACKAGE_PROFILES_CONFIGURED", env.PACKAGE_PROFILES_CONFIGURED],
    ["COMMERCIAL_TERMS_CONFIGURED", env.COMMERCIAL_TERMS_CONFIGURED],
  ];
  const missing = required.filter(([, v]) => v !== "true").map(([k]) => k);
  if (missing.length) {
    throw httpError(
      "Production bloquée — Lucie doit confirmer: " + missing.join(", "),
      403,
      { missing },
    );
  }
  if (env.FORCE_TEST_KEYS_ONLY === "true" || env.WORKER_ENV === "test") {
    throw httpError("Worker TEST — production / sk_live interdits", 403);
  }
}

export function assertLiveSaleAllowed(env, resolved) {
  const key = env.STRIPE_SECRET_KEY || "";
  if (!key.startsWith("sk_live")) return;

  if (env.WORKER_ENV === "test" || env.FORCE_TEST_KEYS_ONLY === "true") {
    throw httpError("Worker TEST — paiements sk_live interdits", 403);
  }
  if (env.SHIPPING_CONFIGURED !== "true" && env.FREE_SHIPPING_AUTHORIZED !== "true") {
    throw httpError("Livraison non configurée — paiement réel refusé.", 403);
  }
  if (env.AVAILABILITY_CONFIGURED !== "true") {
    throw httpError("Disponibilité non configurée — paiement réel refusé.", 403);
  }
  if (env.PACKAGE_PROFILES_CONFIGURED !== "true") {
    throw httpError("Profils colis non confirmés par Lucie — paiement réel refusé.", 403);
  }
  if (env.COMMERCIAL_TERMS_CONFIGURED !== "true") {
    throw httpError("Paramètres commerciaux non confirmés par Lucie — paiement réel refusé.", 403);
  }
  if (env.PRODUCTION_UNLOCKED !== "true") {
    throw httpError("PRODUCTION_UNLOCKED=false — paiement réel refusé.", 403);
  }
  const bad = resolved.filter((r) => r.availability !== "available");
  if (bad.length) {
    throw httpError(
      "Certains articles ne sont pas confirmés disponibles. Contactez Lucie avant paiement réel.",
      409,
      { details: bad.map((b) => b.id) },
    );
  }
}

/**
 * @param shippingResolution — sortie de resolveCheckoutShipping (fee serveur uniquement)
 */
export function buildCheckoutParams({
  resolved,
  successUrl,
  cancelUrl,
  clientReferenceId,
  shippingResolution = null,
  reservationId = null,
}) {
  const shipMeta =
    shippingResolution?.mode === "quoted"
      ? shippingResolution.quote?.method_id || "quoted"
      : shippingResolution?.mode || "not_charged_phase_a";

  // payment_method_types retiré : Stripe Checkout gère les méthodes via Dashboard
  // (API refuse ce paramètre sur les comptes récents — migration Dynamic Payment Methods).
  const params = {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: clientReferenceId || `cart_${Date.now()}`,
    "shipping_address_collection[allowed_countries][0]": "CA",
    "metadata[source]": "fourrures-boreales-phase-a",
    "metadata[shipping]": shipMeta,
    "metadata[shipping_fee_cents]": String(shippingResolution?.fee_cad_cents ?? 0),
    "metadata[currency]": "cad",
    "metadata[item_count]": String(resolved.reduce((s, r) => s + r.qty, 0)),
    "metadata[product_ids]": resolved
      .map((r) => `${r.id}${r.size ? `:${r.size}` : ""}x${r.qty}`)
      .join(",")
      .slice(0, 450),
  };
  if (reservationId) params["metadata[reservation_id]"] = reservationId;

  resolved.forEach((r, i) => {
    params[`line_items[${i}][quantity]`] = r.qty;
    params[`line_items[${i}][price_data][currency]`] = "cad";
    params[`line_items[${i}][price_data][unit_amount]`] = r.unit_amount;
    params[`line_items[${i}][price_data][product_data][name]`] = r.name;
    params[`line_items[${i}][price_data][product_data][metadata][product_id]`] = r.id;
    if (r.inventory_id) {
      params[`line_items[${i}][price_data][product_data][metadata][inventory_id]`] = String(
        r.inventory_id,
      );
    }
    if (r.size) {
      params[`line_items[${i}][price_data][product_data][metadata][size]`] = String(r.size);
      if (r.size_label_fr) {
        params[`line_items[${i}][price_data][product_data][metadata][size_label_fr]`] = String(
          r.size_label_fr,
        ).slice(0, 120);
      }
      if (r.size_label_en) {
        params[`line_items[${i}][price_data][product_data][metadata][size_label_en]`] = String(
          r.size_label_en,
        ).slice(0, 120);
      }
    }
    if (r.product_number != null) {
      params[`line_items[${i}][price_data][product_data][metadata][product_number]`] = String(
        r.product_number,
      );
    }
    if (r.custom && r.custom_config) {
      const cc = r.custom_config;
      params[`line_items[${i}][price_data][product_data][metadata][custom]`] = "1";
      params[`line_items[${i}][price_data][product_data][metadata][csm_code]`] = String(
        cc.csm_code || (cc.product_number != null ? `${cc.product_number}-CSM` : "CSM"),
      );
      params[`line_items[${i}][price_data][product_data][metadata][boutique_id]`] = String(
        cc.product_id || "",
      );
      params[`line_items[${i}][price_data][product_data][metadata][unit]`] = String(cc.unit || "");
      params[`line_items[${i}][price_data][product_data][metadata][measurements]`] = JSON.stringify(
        cc.measurements || {},
      ).slice(0, 450);
      params[`line_items[${i}][price_data][product_data][metadata][measurements_cm]`] = JSON.stringify(
        cc.measurements_cm || {},
      ).slice(0, 450);
      params[`line_items[${i}][price_data][product_data][metadata][raynaud]`] = cc.raynaud ? "1" : "0";
      params[`line_items[${i}][price_data][product_data][metadata][leather]`] = String(cc.leather || "noir");
      params[`line_items[${i}][price_data][product_data][metadata][comments]`] = String(
        cc.comments || "",
      ).slice(0, 450);
    }
  });

  if (
    shippingResolution?.mode === "quoted" &&
    shippingResolution.quote &&
    shippingResolution.fee_cad_cents > 0
  ) {
    const q = shippingResolution.quote;
    params["shipping_options[0][shipping_rate_data][type]"] = "fixed_amount";
    params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"] = q.fee_cad_cents;
    params["shipping_options[0][shipping_rate_data][fixed_amount][currency]"] = "cad";
    params["shipping_options[0][shipping_rate_data][display_name]"] = q.method_id || "shipping";
  } else {
    assertNoShippingFeesInParams(params);
  }

  return params;
}

/** Total serveur = produits catalogue + livraison validée (0 si free / différé test). */
export function serverCheckoutTotalCents(resolved, shippingResolution) {
  const products = resolved.reduce((s, r) => s + r.line_total_cents, 0);
  const ship = shippingResolution?.fee_cad_cents ?? 0;
  if (!Number.isInteger(ship) || ship < 0) throw httpError("Frais livraison invalides dans le total", 500);
  return products + ship;
}

export function parseStripeSignature(header) {
  const parts = String(header || "").split(",").map((p) => p.trim());
  let timestamp = "";
  const signatures = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }
  return { timestamp, signatures };
}

export async function hmacSha256Hex(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyStripeWebhook(secret, rawBody, signatureHeader, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) throw httpError("STRIPE_WEBHOOK_SECRET manquant", 500);
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || !signatures.length) throw httpError("Signature Stripe absente", 400);
  const age = Math.abs(nowSec - Number(timestamp));
  if (age > 60 * 5) throw httpError("Signature Stripe expirée", 400);
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((s) => s === expected)) throw httpError("Signature Stripe invalide", 400);
}

async function putOrder(env, sessionId, payload) {
  if (!env.ORDERS || !sessionId) return;
  await env.ORDERS.put(`order:${sessionId}`, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 * 365,
  });
}

/**
 * Idempotence + événements async.
 * Confirmation « payée » uniquement via événements Stripe serveur (jamais via redirect).
 */
export async function processWebhookEvent(env, event) {
  if (!event || !event.id || !event.type) {
    throw httpError("Événement Stripe invalide", 400);
  }

  if (env.ORDERS) {
    const seen = await env.ORDERS.get(`evt:${event.id}`);
    if (seen) return { received: true, duplicate: true, type: event.type };
    await env.ORDERS.put(`evt:${event.id}`, event.type, { expirationTtl: 60 * 60 * 24 * 30 });
  }

  const obj = event.data?.object || {};

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const paid =
      obj.payment_status === "paid" ||
      obj.payment_status === "no_payment_required" ||
      event.type === "checkout.session.async_payment_succeeded";
    if (paid) {
      await putOrder(env, obj.id, {
        session_id: obj.id,
        payment_status: obj.payment_status || "paid",
        amount_total: obj.amount_total,
        currency: obj.currency,
        customer_email: obj.customer_details?.email || obj.customer_email || null,
        metadata: obj.metadata || {},
        confirmed_at: new Date().toISOString(),
        status: "paid_confirmed",
        event_type: event.type,
      });
      return { received: true, confirmed: true, type: event.type };
    }
    // completed mais unpaid (ex. async en cours)
    await putOrder(env, obj.id, {
      session_id: obj.id,
      payment_status: obj.payment_status || "unpaid",
      amount_total: obj.amount_total,
      currency: obj.currency,
      status: "awaiting_payment",
      event_type: event.type,
      updated_at: new Date().toISOString(),
    });
    return { received: true, confirmed: false, pending: true, type: event.type };
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await putOrder(env, obj.id, {
      session_id: obj.id,
      payment_status: obj.payment_status || "unpaid",
      status: "payment_failed",
      event_type: event.type,
      updated_at: new Date().toISOString(),
    });
    return { received: true, confirmed: false, failed: true, type: event.type };
  }

  if (event.type === "checkout.session.expired") {
    await putOrder(env, obj.id, {
      session_id: obj.id,
      status: "canceled",
      payment_status: "unpaid",
      event_type: event.type,
      updated_at: new Date().toISOString(),
    });
    return { received: true, confirmed: false, expired: true, type: event.type };
  }

  if (
    event.type === "charge.refunded" ||
    event.type === "payment_intent.canceled" ||
    event.type === "payment_intent.payment_failed"
  ) {
    if (env.ORDERS) {
      await env.ORDERS.put(
        `refund_or_cancel:${event.id}`,
        JSON.stringify({
          type: event.type,
          at: new Date().toISOString(),
          object_id: obj.id || null,
        }),
        { expirationTtl: 60 * 60 * 24 * 365 },
      );
    }
    return { received: true, logged: true, type: event.type };
  }

  // Autres types : ack pour éviter retries inutiles, sans confirmer de commande
  return { received: true, ignored: true, type: event.type };
}

export function createMemoryKv() {
  const store = new Map();
  return {
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v, _opts) {
      store.set(k, v);
    },
    _store: store,
  };
}
