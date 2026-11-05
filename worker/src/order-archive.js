/**
 * Archive commande durable + n° LFB + flags notify.
 * Indépendante de l’envoi courriel.
 */

import { generateOrderNumber } from "./order-numbers.js";

const ARCHIVE_TTL = 60 * 60 * 24 * 365 * 3; // 3 ans

function moneyCad(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Number(cents);
}

/**
 * Construit l’archive complète à partir de session Stripe + pending KV.
 */
export function buildOrderArchive({ sessionObj, pending, orderNumber, shipping }) {
  const email =
    sessionObj?.customer_details?.email ||
    sessionObj?.customer_email ||
    pending?.customer_email ||
    null;
  const name =
    sessionObj?.customer_details?.name ||
    pending?.customer_name ||
    (email ? email.split("@")[0] : null);
  const phone =
    sessionObj?.customer_details?.phone ||
    pending?.customer_phone ||
    null;

  const addr =
    sessionObj?.shipping_details?.address ||
    sessionObj?.customer_details?.address ||
    pending?.shipping_address ||
    null;

  const ship = shipping || pending?.shipping || {};
  const items = Array.isArray(pending?.items) ? pending.items : [];

  return {
    order_number: orderNumber,
    session_id: sessionObj?.id || pending?.session_id || null,
    created_at: pending?.created_at || null,
    confirmed_at: new Date().toISOString(),
    payment_status: sessionObj?.payment_status || "paid",
    payment_reference: sessionObj?.id || null,
    currency: sessionObj?.currency || "cad",
    customer: {
      name,
      email,
      phone,
    },
    shipping_address: addr
      ? {
          line1: addr.line1 || null,
          line2: addr.line2 || null,
          city: addr.city || null,
          state: addr.state || null,
          postal_code: addr.postal_code || null,
          country: addr.country || "CA",
        }
      : pending?.destination
        ? {
            line1: null,
            line2: null,
            city: null,
            state: pending.destination.province || null,
            postal_code: pending.destination.postal_code || null,
            country: pending.destination.country || "CA",
          }
        : null,
    items,
    shipping: {
      method: ship.method_id || ship.method || pending?.shipping_method || null,
      fee_cad_cents: moneyCad(
        ship.fee_cad_cents ?? pending?.shipping_fee_cents ?? sessionObj?.metadata?.shipping_fee_cents,
      ),
      fee_status: "paye",
      destination: ship.destination || pending?.destination || null,
      source: ship.source || pending?.shipping_source || null,
      tracking_number: null,
      initial_status: "a_preparer",
      instructions: pending?.shipping_instructions || null,
    },
    financial: {
      products_cents: moneyCad(pending?.products_cents),
      shipping_fee_cents: moneyCad(pending?.shipping_fee_cents ?? ship.fee_cad_cents),
      tax_cents: null,
      tax_label_fr: "Taxes : non configurées — à valider avec Lucie",
      amount_total_cents: moneyCad(
        sessionObj?.amount_total ?? pending?.amount_total_cents,
      ),
    },
    notify_status: "pending",
    notify_sent_at: null,
    notify_error: null,
    status: "paid_confirmed",
  };
}

export async function ensureOrderNumber(env, sessionId) {
  if (!env.ORDERS || !sessionId) return generateOrderNumber();
  const existing = await env.ORDERS.get(`order_number_by_session:${sessionId}`);
  if (existing) return existing;
  const n = generateOrderNumber();
  await env.ORDERS.put(`order_number_by_session:${sessionId}`, n, {
    expirationTtl: ARCHIVE_TTL,
  });
  await env.ORDERS.put(`session_by_order_number:${n}`, sessionId, {
    expirationTtl: ARCHIVE_TTL,
  });
  return n;
}

export async function putOrderArchive(env, archive) {
  if (!env.ORDERS || !archive?.session_id) return;
  const key = `order:${archive.session_id}`;
  const prevRaw = await env.ORDERS.get(key);
  const prev = prevRaw ? JSON.parse(prevRaw) : {};
  const merged = {
    ...prev,
    ...archive,
    order_number: archive.order_number || prev.order_number,
    notify_status: archive.notify_status ?? prev.notify_status,
    notify_sent_at: archive.notify_sent_at ?? prev.notify_sent_at,
    notify_error: archive.notify_error ?? prev.notify_error,
  };
  await env.ORDERS.put(key, JSON.stringify(merged), { expirationTtl: ARCHIVE_TTL });
  if (merged.order_number) {
    await env.ORDERS.put(`archive_by_number:${merged.order_number}`, key, {
      expirationTtl: ARCHIVE_TTL,
    });
  }
  return merged;
}

export async function getOrderArchive(env, sessionId) {
  if (!env.ORDERS || !sessionId) return null;
  const raw = await env.ORDERS.get(`order:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function findOrderArchive(env, { order_number, session_id, customer_email }) {
  if (session_id) return getOrderArchive(env, session_id);
  if (order_number && env.ORDERS) {
    const key = await env.ORDERS.get(`archive_by_number:${order_number}`);
    if (key) {
      const raw = await env.ORDERS.get(key);
      return raw ? JSON.parse(raw) : null;
    }
    const sid = await env.ORDERS.get(`session_by_order_number:${order_number}`);
    if (sid) return getOrderArchive(env, sid);
  }
  if (customer_email && env.ORDERS?._store) {
    // Memory KV test only — scan
    for (const [k, v] of env.ORDERS._store) {
      if (!String(k).startsWith("order:")) continue;
      try {
        const o = JSON.parse(v);
        if (o.customer?.email === customer_email) return o;
      } catch (_) {}
    }
  }
  return null;
}

export async function markNotifyResult(env, sessionId, result) {
  const arch = await getOrderArchive(env, sessionId);
  if (!arch) return null;
  if (result?.ok) {
    arch.notify_status = result.mocked ? "mocked" : "sent";
    arch.notify_sent_at = new Date().toISOString();
    arch.notify_error = null;
  } else {
    arch.notify_status = "failed";
    arch.notify_error = result?.error || "send_failed";
  }
  return putOrderArchive(env, arch);
}

export async function wasNotifySent(env, sessionId) {
  const arch = await getOrderArchive(env, sessionId);
  return arch?.notify_status === "sent" || arch?.notify_status === "mocked";
}

/** Ligne article sûre pour l’UI client (pas de PII / secrets). */
export function publicLineFromItem(it) {
  const qty = Math.max(1, Math.floor(Number(it?.qty) || 1));
  const unit =
    it?.unit_amount != null && Number.isFinite(Number(it.unit_amount))
      ? Number(it.unit_amount)
      : null;
  return {
    name: it?.name || it?.id || null,
    size: it?.size || null,
    size_label_fr: it?.size_label_fr || null,
    size_label_en: it?.size_label_en || null,
    qty,
    unit_amount_cents: unit,
    line_total_cents: unit != null ? unit * qty : null,
    custom: !!(it?.custom || it?.custom_config),
  };
}

/**
 * Enrichit le statut order-status avec n° LFB + récap réel (archive / pending).
 * N’invente jamais mode, montant ou article.
 */
export async function enrichOrderStatusForClient(env, status) {
  if (!status || typeof status !== "object") return status;
  const id = status.session_id;
  if (!id || !env?.ORDERS) return status;

  const archive = await getOrderArchive(env, id);
  let pending = null;
  try {
    const raw = await env.ORDERS.get(`pending:${id}`);
    if (raw) pending = JSON.parse(raw);
  } catch (_) {
    pending = null;
  }

  const out = { ...status };

  if (status.confirmed === true) {
    let orderNumber = archive?.order_number || pending?.order_number || null;
    if (!orderNumber) {
      orderNumber = await ensureOrderNumber(env, id);
    }
    out.order_number = orderNumber;

    const rawItems =
      Array.isArray(archive?.items) && archive.items.length
        ? archive.items
        : Array.isArray(pending?.items)
          ? pending.items
          : [];
    out.items = rawItems.map(publicLineFromItem);

    const methodId =
      archive?.shipping?.method || pending?.shipping_method || null;
    const feeRaw =
      archive?.shipping?.fee_cad_cents ??
      pending?.shipping_fee_cents ??
      null;
    const fee =
      feeRaw != null && Number.isFinite(Number(feeRaw)) ? Number(feeRaw) : null;

    out.shipping = {
      method_id: methodId || null,
      fee_cad_cents: fee,
    };

    const products =
      archive?.financial?.products_cents ?? pending?.products_cents ?? null;
    out.products_cents =
      products != null && Number.isFinite(Number(products)) ? Number(products) : null;

    if (out.amount_total == null) {
      const tot =
        archive?.financial?.amount_total_cents ?? pending?.amount_total_cents ?? null;
      if (tot != null && Number.isFinite(Number(tot))) out.amount_total = Number(tot);
    }
  }

  return out;
}
