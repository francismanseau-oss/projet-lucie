/**
 * Cotes livraison + jetons + holds Lucie.
 * Aucun tarif inventé. Paiement unique uniquement après cote vérifiée / confirmée.
 */

import { httpError } from "./logic.js";
import {
  isBusDestinationServed,
  isMethodReadyToCharge,
  loadShippingConfig,
  quoteShipping,
} from "./shipping.js";

const QUOTE_TTL_SEC = 60 * 30;
const HOLD_TTL_SEC = 60 * 60 * 24 * 14;

function bytesToB64Url(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s) {
  return new TextEncoder().encode(String(s));
}

async function hmacSha256B64Url(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8(message));
  return bytesToB64Url(sig);
}

function timingSafeEqualStr(a, b) {
  const ba = utf8(a);
  const bb = utf8(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function randomHex(byteLen) {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeDestination(dest = {}) {
  const country = String(dest.country || "CA").toUpperCase();
  const province = String(dest.province || dest.province_code || "")
    .toUpperCase()
    .trim();
  const postal_code = String(dest.postal_code || dest.postalCode || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  return { country, province, postal_code };
}

export function isCustomerSelectable(methodId, method) {
  if (!method?.enabled) return false;
  // false explicite = choix Lucie seulement (ex. Express Bus / Postes Canada)
  if (method.customer_selectable === false) return false;
  return true;
}

/**
 * Lookup grille manuelle Lucie (CP exact → préfixe → province → DEFAULT).
 * Aucune valeur inventée — lecture seule de la table fournie.
 */
export function lookupCanadaPostTableFee(rateTable, destination) {
  if (!rateTable || typeof rateTable !== "object") return null;
  const dest = normalizeDestination(destination);
  const pc = dest.postal_code;
  if (pc && rateTable[pc] != null) {
    const n = Number(rateTable[pc]);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  for (let len = Math.min(pc.length, 3); len >= 1; len--) {
    const prefix = pc.slice(0, len);
    if (rateTable[prefix] != null) {
      const n = Number(rateTable[prefix]);
      if (Number.isInteger(n) && n >= 0) return n;
    }
  }
  if (dest.province && rateTable[dest.province] != null) {
    const n = Number(rateTable[dest.province]);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  if (rateTable.DEFAULT != null) {
    const n = Number(rateTable.DEFAULT);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

export function lookupBusTableFee(method, destination) {
  const table = method?.rate_table_cad_cents;
  if (!table || typeof table !== "object") return null;
  return lookupCanadaPostTableFee(table, destination);
}

/**
 * Tente une cote automatique. Sinon quote_required (pas d’invention).
 */
export function tryAutoQuote(config, { methodId, destination, canadaPostApiFeeCadCents } = {}) {
  const c = loadShippingConfig(config);
  const method = c.methods?.[methodId];
  if (!method) throw httpError(`Méthode de livraison inconnue: ${methodId}`, 400);
  if (!isCustomerSelectable(methodId, method)) {
    throw httpError(`Méthode non offerte au client: ${methodId}`, 403);
  }

  const dest = normalizeDestination(destination);
  if (dest.country !== "CA") {
    throw httpError("Livraison limitée au Canada", 400);
  }
  if (!dest.postal_code || !dest.province) {
    throw httpError("Adresse incomplète (code postal + province)", 400);
  }
  if (methodId === "bus_quebec" && !isBusDestinationServed(method, dest)) {
    throw httpError("Express Bus n’est proposé que si la destination est desservie (Québec)", 400);
  }

  if (methodId === "flat_order" || methodId === "canada_post") {
    const pkg = method.package_profile || {};
    if (method.rates_source === "fixed_per_order" && method.enabled) {
      const quote = quoteShipping(config, {
        methodId,
        destination: dest,
      });
      return { status: "quoted", quote };
    }
    if (methodId === "flat_order") {
      return {
        status: "quote_required",
        reason: "flat_order_unavailable",
        method_id: methodId,
        destination: dest,
      };
    }
    if (
      method.rates_source === "canada_post_rating_api" &&
      method.api?.configured === true &&
      canadaPostApiFeeCadCents != null &&
      pkg.weight_g != null
    ) {
      const quote = quoteShipping(config, {
        methodId,
        destination: dest,
        canadaPostQuoteCadCents: canadaPostApiFeeCadCents,
      });
      return { status: "quoted", quote };
    }
    if (method.rates_source === "lucie_manual_table" && method.enabled) {
      if (pkg.weight_g == null) {
        return {
          status: "quote_required",
          reason: "package_profile_incomplete",
          method_id: methodId,
          destination: dest,
        };
      }
      const fee = lookupCanadaPostTableFee(method.rate_table_cad_cents, dest);
      if (fee == null) {
        return {
          status: "quote_required",
          reason: "no_matching_rate_in_table",
          method_id: methodId,
          destination: dest,
        };
      }
      const quote = quoteShipping(config, {
        methodId,
        destination: dest,
        canadaPostQuoteCadCents: fee,
      });
      return { status: "quoted", quote };
    }
    return {
      status: "quote_required",
      reason: "canada_post_rates_unavailable",
      method_id: methodId,
      destination: dest,
      message_fr:
        "Les frais Postes Canada ne peuvent pas encore être calculés automatiquement. Lucie confirmera le tarif avant le paiement unique.",
    };
  }

  if (methodId === "bus_quebec") {
    if (method.rates_source === "fixed_per_order" && method.enabled) {
      const quote = quoteShipping(config, {
        methodId,
        destination: dest,
      });
      return { status: "quoted", quote };
    }
    const fee = lookupBusTableFee(method, dest);
    if (fee != null && method.enabled && method.rates_source === "lucie_manual_table") {
      const quote = quoteShipping(config, {
        methodId,
        destination: dest,
        manualBusFeeCadCents: fee,
      });
      return { status: "quoted", quote };
    }
    return {
      status: "quote_required",
      reason: "bus_requires_lucie_confirmation",
      method_id: methodId,
      destination: dest,
      customer_pickup_required: !!method.customer_pickup_required,
      eta_business_days_fr: method.eta_business_days_fr || "1 à 2 jours ouvrables",
      message_fr:
        method.customer_notice_fr ||
        "Express Bus : récupération en dépôt obligatoire. Tarif à confirmer avant le paiement unique.",
    };
  }

  if (methodId === "pickup" && isMethodReadyToCharge(methodId, method)) {
    const quote = quoteShipping(config, { methodId, destination: dest });
    return { status: "quoted", quote };
  }

  return {
    status: "quote_required",
    reason: "method_not_auto_quotable",
    method_id: methodId,
    destination: dest,
  };
}

export async function signQuoteToken(secret, payload) {
  const body = {
    ...payload,
    exp: payload.exp || Math.floor(Date.now() / 1000) + QUOTE_TTL_SEC,
  };
  const raw = bytesToB64Url(utf8(JSON.stringify(body)));
  const sig = await hmacSha256B64Url(String(secret || "local-dev-quote"), raw);
  return `${raw}.${sig}`;
}

export async function verifyQuoteToken(secret, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) throw httpError("quote_token invalide", 400);
  const [raw, sig] = parts;
  const expected = await hmacSha256B64Url(String(secret || "local-dev-quote"), raw);
  if (!timingSafeEqualStr(sig, expected)) throw httpError("quote_token signature invalide", 400);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(b64UrlToBytes(raw)));
  } catch {
    throw httpError("quote_token illisible", 400);
  }
  if (!body || body.exp < Math.floor(Date.now() / 1000)) {
    throw httpError("quote_token expiré — redemandez une cote", 400);
  }
  if (!Number.isInteger(body.fee_cad_cents) || body.fee_cad_cents < 0) {
    throw httpError("quote_token montant invalide", 400);
  }
  if (body.invented === true) throw httpError("quote_token inventé refusé", 403);
  return body;
}

export function quoteTokenToResolution(tokenBody) {
  const quote = {
    method_id: tokenBody.method_id,
    fee_cad_cents: tokenBody.fee_cad_cents,
    currency: "cad",
    source: tokenBody.source || "locked_token",
    invented: false,
    from_locked_token: true,
    destination: tokenBody.destination || null,
    hold_id: tokenBody.hold_id || null,
  };
  return {
    mode: "quoted",
    fee_cad_cents: quote.fee_cad_cents,
    charged: quote.fee_cad_cents > 0,
    invented: false,
    quote,
  };
}

export async function createShippingHold(env, data) {
  if (!env.ORDERS) throw httpError("ORDERS KV requis pour les devis en attente", 500);
  const hold_id = `sh_${randomHex(12)}`;
  const resume_token = randomHex(24);
  const record = {
    hold_id,
    resume_token,
    status: "awaiting_lucie_fee",
    created_at: new Date().toISOString(),
    method_id: data.method_id,
    destination: data.destination,
    items: data.items || [],
    customer_email: data.customer_email || null,
    customer_name: data.customer_name || null,
    customer_phone: data.customer_phone || null,
    reason: data.reason || null,
    message_fr: data.message_fr || null,
    fee_cad_cents: null,
    confirmed_at: null,
    confirmed_by: null,
  };
  await env.ORDERS.put(`shipping_hold:${hold_id}`, JSON.stringify(record), {
    expirationTtl: HOLD_TTL_SEC,
  });
  await env.ORDERS.put(`shipping_hold_resume:${resume_token}`, hold_id, {
    expirationTtl: HOLD_TTL_SEC,
  });
  return record;
}

export async function getShippingHold(env, holdId) {
  if (!env.ORDERS || !holdId) return null;
  const raw = await env.ORDERS.get(`shipping_hold:${holdId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function confirmShippingHold(env, { hold_id, fee_cad_cents, actor = "lucie" }) {
  const hold = await getShippingHold(env, hold_id);
  if (!hold) throw httpError("Devis introuvable", 404);
  if (hold.status === "consumed") throw httpError("Devis déjà utilisé pour un paiement", 409);
  const fee = Number(fee_cad_cents);
  if (!Number.isInteger(fee) || fee < 0) {
    throw httpError("Frais CAD (cents) invalides — entier ≥ 0 requis", 400);
  }
  hold.status = "fee_confirmed";
  hold.fee_cad_cents = fee;
  hold.confirmed_at = new Date().toISOString();
  hold.confirmed_by = actor;
  await env.ORDERS.put(`shipping_hold:${hold_id}`, JSON.stringify(hold), {
    expirationTtl: HOLD_TTL_SEC,
  });
  return hold;
}

export async function resolveHoldToQuoteToken(env, secret, { hold_id, resume_token }) {
  let id = hold_id;
  if (!id && resume_token && env.ORDERS) {
    id = await env.ORDERS.get(`shipping_hold_resume:${resume_token}`);
  }
  const hold = await getShippingHold(env, id);
  if (!hold) throw httpError("Devis introuvable", 404);
  if (hold.status !== "fee_confirmed" || hold.fee_cad_cents == null) {
    throw httpError("Tarif pas encore confirmé par Lucie", 409);
  }
  if (resume_token && hold.resume_token !== resume_token) {
    throw httpError("Jeton de reprise invalide", 403);
  }
  const token = await signQuoteToken(secret, {
    method_id: hold.method_id,
    fee_cad_cents: hold.fee_cad_cents,
    destination: hold.destination,
    source: "lucie_hold_confirmed",
    invented: false,
    hold_id: hold.hold_id,
  });
  return { hold, quote_token: token, fee_cad_cents: hold.fee_cad_cents };
}

export function listSelectableMethods(config) {
  const c = loadShippingConfig(config);
  const priority = c.policy?.display_priority || ["flat_order", "bus_quebec", "canada_post"];
  return Object.entries(c.methods || {})
    .filter(([id, m]) => id !== "purolator" && isCustomerSelectable(id, m))
    .map(([id, m]) => ({
      id,
      label_fr: m.label_fr,
      enabled: !!m.enabled,
      customer_selectable: true,
      display_order: m.display_order ?? (priority.indexOf(id) >= 0 ? priority.indexOf(id) + 1 : 99),
      fee_cad_cents: m.rates_source === "fixed_per_order" ? m.fee_cad_cents : null,
      fee_scope: m.fee_scope || null,
      eta_business_days_fr: m.eta_business_days_fr || null,
      customer_pickup_required: !!m.customer_pickup_required,
      customer_notice_fr: m.customer_notice_fr || null,
      delivery_mode_fr: m.delivery_mode_fr || null,
      served_provinces: m.served_provinces || null,
      auto_quotable:
        (id === "flat_order" && m.enabled && m.rates_source === "fixed_per_order") ||
        (id === "canada_post" &&
          m.enabled &&
          (m.rates_source === "fixed_per_order" ||
            (m.rates_source === "lucie_manual_table" &&
              m.rate_table_cad_cents &&
              m.package_profile?.weight_g != null) ||
            (m.rates_source === "canada_post_rating_api" && m.api?.configured === true))) ||
        (id === "bus_quebec" &&
          m.enabled &&
          (m.rates_source === "fixed_per_order" ||
            (m.rates_source === "lucie_manual_table" && !!m.rate_table_cad_cents))) ||
        (id === "pickup" && isMethodReadyToCharge(id, m)),
      requires_lucie_quote_if_unknown: false,
      coverage_note_fr:
        id === "flat_order"
          ? "18,00 $ par commande — mode confirmé par Lucie avant l'expédition"
          : id === "bus_quebec"
            ? "Express Bus (choix Lucie) · dépôt avec accord client"
            : id === "canada_post"
              ? "Postes Canada (choix Lucie) · distribution postale"
              : null,
    }))
    .sort((a, b) => (a.display_order || 99) - (b.display_order || 99));
}

export { QUOTE_TTL_SEC, HOLD_TTL_SEC };
