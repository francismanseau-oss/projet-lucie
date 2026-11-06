/**
 * Bon de commande Lucie — après confirmation fiable Stripe (webhook payé).
 * Mock si Resend non configuré. Pas d’envoi sur redirect succès.
 */

import { formatLucieLineLabel } from "./product-codes.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csmSpan(code) {
  return `<strong style="color:#b00020;font-weight:700;">${escapeHtml(code)}</strong>`;
}

function moneyCad(cents, currency) {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  const cur = String(currency || "cad").toUpperCase();
  return (Number(cents) / 100).toFixed(2).replace(".", ",") + " $ " + cur;
}

function formatAddress(addr) {
  if (!addr) return "—";
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(" "),
    addr.country,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function methodLabel(id) {
  const map = {
    canada_post: "Postes Canada (boîte postale / distribution postale)",
    bus_quebec: "Express Bus (récupération au dépôt)",
    pickup: "Ramassage",
    free: "Livraison offerte",
  };
  return map[id] || id || "—";
}

function formatMeasurements(c) {
  if (!c) return "";
  const unit = c.unit || "—";
  const m = c.measurements || {};
  const mCm = c.measurements_cm || {};
  const lines = [];
  for (const [k, v] of Object.entries(m)) {
    lines.push(`${k} : ${v} ${unit}`);
  }
  for (const [k, v] of Object.entries(mCm)) {
    if (m[k] == null) lines.push(`${k} : ${v} cm`);
  }
  return lines.join(" · ") || JSON.stringify(m);
}

/**
 * Construit le bon de commande (texte + HTML imprimable).
 * Préfère l’archive serveur si fournie.
 */
export function buildPaidOrderEmail(sessionObj, pending, env, archive = null) {
  const to = env.SUGGESTION_TO_EMAIL || "luciegosselin852@gmail.com";
  const from =
    env.SUGGESTION_FROM_EMAIL ||
    "Les Fourrures Boréales <onboarding@resend.dev>";

  const orderNumber =
    archive?.order_number ||
    pending?.order_number ||
    sessionObj?.metadata?.order_number ||
    "—";

  const email =
    archive?.customer?.email ||
    sessionObj?.customer_details?.email ||
    sessionObj?.customer_email ||
    pending?.customer_email ||
    null;
  const name =
    archive?.customer?.name ||
    sessionObj?.customer_details?.name ||
    pending?.customer_name ||
    (email ? email.split("@")[0] : "Client");
  const phone = archive?.customer?.phone || pending?.customer_phone || sessionObj?.customer_details?.phone || null;

  const items = Array.isArray(archive?.items)
    ? archive.items
    : Array.isArray(pending?.items)
      ? pending.items
      : [];
  const hasCustom = items.some((i) => i.custom || String(i.id || "").startsWith("custom:"));
  const kindLabel = hasCustom ? "COMMANDE SUR MESURE" : "COMMANDE BOUTIQUE";
  const subject = `Bon de commande ${orderNumber} — ${kindLabel} — ${name}`;

  const shipMethod =
    archive?.shipping?.method ||
    pending?.shipping_method ||
    sessionObj?.metadata?.shipping ||
    null;
  const shipFee =
    archive?.shipping?.fee_cad_cents ??
    pending?.shipping_fee_cents ??
    (sessionObj?.metadata?.shipping_fee_cents != null
      ? Number(sessionObj.metadata.shipping_fee_cents)
      : null);
  const shipAddr = archive?.shipping_address || null;
  const dest = archive?.shipping?.destination || pending?.destination || null;
  const amountTotal =
    archive?.financial?.amount_total_cents ??
    sessionObj?.amount_total ??
    pending?.amount_total_cents;
  const productsCents = archive?.financial?.products_cents ?? pending?.products_cents;
  const currency = archive?.currency || sessionObj?.currency || "cad";
  const paymentStatus = archive?.payment_status || sessionObj?.payment_status || "paid";
  const sessionId = sessionObj?.id || pending?.session_id || archive?.session_id || "—";
  const confirmedAt = archive?.confirmed_at || new Date().toISOString();
  const tracking = archive?.shipping?.tracking_number || null;
  const shipStatus = archive?.shipping?.initial_status || "a_preparer";

  const linesText = items.map((it) => {
    const pn = it.product_number ?? it.custom_config?.product_number;
    const label = formatLucieLineLabel({
      product_number: pn,
      name: it.name || it.id,
      custom: !!(it.custom || it.custom_config),
    });
    const qty = it.qty || 1;
    const unit = it.unit_amount != null ? moneyCad(it.unit_amount, "cad") : "";
    const sub = it.unit_amount != null ? moneyCad(it.unit_amount * qty, "cad") : "";
    let extra = "";
    if (it.custom_config) {
      const c = it.custom_config;
      extra =
        `\n    Code CSM : ${c.csm_code || (pn != null ? pn + "-CSM" : "CSM")}` +
        `\n    Réf. boutique : ${c.product_id || "—"}` +
        `\n    Unité : ${c.unit || "—"}` +
        `\n    Mensurations : ${formatMeasurements(c)}` +
        `\n    Chaleur renforcée : ${c.chaleur ? "oui (+20 $ non inclus dans le total). Fait à partir de zéro : 1 semaine de fabrication, environ 3 semaines avant Noël." : "non"}` +
        `\n    Cuir / matière : ${c.leather || "noir"}` +
        (c.comments ? `\n    Instructions : ${c.comments}` : "");
    } else if (pn != null) {
      extra = `\n    N° produit : ${pn}`;
    }
    return `- ${label} × ${qty} @ ${unit} = ${sub}${extra}`;
  });

  const destLine = shipAddr
    ? formatAddress(shipAddr)
    : dest
      ? `${dest.postal_code || ""} ${dest.province || ""} ${dest.country || "CA"}`.trim()
      : "—";

  const text = [
    "BON DE COMMANDE — Les Fourrures Boréales",
    "",
    `N° commande : ${orderNumber}`,
    `Date / heure : ${confirmedAt}`,
    `Référence Stripe : ${sessionId}`,
    `Statut paiement : ${paymentStatus}`,
    "",
    "CLIENT",
    `  Nom : ${name}`,
    email ? `  Courriel : ${email}` : "  Courriel : —",
    phone ? `  Téléphone : ${phone}` : "  Téléphone : (non fourni)",
    `  Adresse / destination : ${destLine}`,
    "",
    "ARTICLES",
    linesText.length ? linesText.join("\n") : "- (détail non disponible)",
    "",
    "LIVRAISON",
    `  Méthode : ${methodLabel(shipMethod)}`,
    `  Frais payés : ${moneyCad(shipFee, currency)}`,
    `  Destination : ${destLine}`,
    archive?.shipping?.instructions ? `  Instructions : ${archive.shipping.instructions}` : null,
    `  Suivi : ${tracking || "non encore attribué"}`,
    `  Statut initial : ${shipStatus}`,
    "",
    "RÉSUMÉ FINANCIER",
    `  Sous-total produits : ${moneyCad(productsCents, currency)}`,
    `  Livraison : ${moneyCad(shipFee, currency)}`,
    `  ${archive?.financial?.tax_label_fr || "Taxes : non configurées — à valider"}`,
    `  TOTAL PAYÉ : ${moneyCad(amountTotal, currency)}`,
    "",
    "Ce message est envoyé seulement après vérification du paiement Stripe (webhook).",
    "Les Fourrures Boréales",
  ]
    .filter((l) => l != null)
    .join("\n");

  const itemsHtml = items.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:#2a221c;border-collapse:collapse;">
        <tr style="background:#f7f1ea;">
          <th align="left" style="padding:8px;border-bottom:1px solid #e5d8c8;">Article</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5d8c8;">Qté</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5d8c8;">Prix</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5d8c8;">Sous-total</th>
        </tr>
        ${items
          .map((it) => {
            const pn = it.product_number ?? it.custom_config?.product_number;
            const isCustom = !!(it.custom || it.custom_config);
            const code = isCustom
              ? it.custom_config?.csm_code || (pn != null ? `${pn}-CSM` : "CSM")
              : pn != null
                ? `N° ${pn}`
                : "";
            const head = code
              ? `${isCustom ? csmSpan(code) : escapeHtml(code)} — ${escapeHtml(it.name || it.id)}`
              : escapeHtml(it.name || it.id);
            let detail = "";
            if (it.custom_config) {
              const c = it.custom_config;
              detail = `<div style="font-size:13px;color:#5c4f44;margin-top:6px;line-height:1.45;">
                Réf. : ${escapeHtml(c.product_id || "—")} · Unité : ${escapeHtml(c.unit || "—")}<br>
                Mensurations : ${escapeHtml(formatMeasurements(c))}<br>
                Chaleur renforcée : ${c.chaleur ? "oui (+20 $ non inclus dans le total). Fait à partir de zéro : 1 semaine de fabrication, environ 3 semaines avant Noël." : "non"} · Matière : ${escapeHtml(c.leather || "noir")}
                ${c.comments ? `<br>Instructions : ${escapeHtml(c.comments)}` : ""}
              </div>`;
            }
            const qty = it.qty || 1;
            const unit = moneyCad(it.unit_amount, currency);
            const sub = it.unit_amount != null ? moneyCad(it.unit_amount * qty, currency) : "—";
            return `<tr>
              <td style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top;">${head}${detail}</td>
              <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top;">${qty}</td>
              <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top;">${escapeHtml(unit)}</td>
              <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top;">${escapeHtml(sub)}</td>
            </tr>`;
          })
          .join("")}
      </table>`
    : `<p style="font-size:16px;color:#5c4f44;">Détail des articles non disponible dans cette archive.</p>`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Bon de commande ${escapeHtml(orderNumber)}</title></head>
<body style="margin:0;background:#f3ebe3;font-family:Georgia,serif;color:#2b2420;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;"><tr><td align="center">
  <table width="100%" style="max-width:640px;background:#fffcf8;border:1px solid #e5d8c8;border-radius:12px;">
    <tr><td style="padding:28px;text-align:center;">
      <p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#965035;">Les Fourrures Boréales</p>
      <p style="margin:12px 0 0;display:inline-block;background:#2a221c;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px;border-radius:4px;">BON DE COMMANDE</p>
      <h1 style="margin:14px 0 0;font-size:28px;font-weight:400;">${escapeHtml(orderNumber)}</h1>
      <p style="margin:8px 0 0;font-size:14px;color:#5c4f44;">${escapeHtml(kindLabel)} · ${escapeHtml(confirmedAt)}</p>
    </td></tr>
    <tr><td style="padding:0 28px 16px;">
      <div style="background:#f7f1ea;border-radius:8px;padding:16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Paiement</p>
        <p style="margin:0;font-size:16px;">Statut : <strong>${escapeHtml(paymentStatus)}</strong></p>
        <p style="margin:6px 0 0;font-size:14px;color:#5c4f44;">Stripe : ${escapeHtml(sessionId)}</p>
      </div>
    </td></tr>
    <tr><td style="padding:0 28px 16px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Client</p>
      <p style="margin:0;font-size:20px;">${escapeHtml(name)}</p>
      ${email ? `<p style="margin:6px 0 0;font-size:16px;"><a href="mailto:${escapeHtml(email)}" style="color:#965035;">${escapeHtml(email)}</a></p>` : ""}
      ${phone ? `<p style="margin:6px 0 0;font-size:15px;">Tél. : ${escapeHtml(phone)}</p>` : ""}
      <p style="margin:8px 0 0;font-size:15px;color:#5c4f44;">${escapeHtml(destLine)}</p>
    </td></tr>
    <tr><td style="padding:0 28px 16px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Articles</p>
      ${itemsHtml}
    </td></tr>
    <tr><td style="padding:0 28px 16px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Livraison</p>
      <p style="margin:0;font-size:17px;">${escapeHtml(methodLabel(shipMethod))}</p>
      <p style="margin:6px 0 0;font-size:15px;">Frais payés : <strong>${escapeHtml(moneyCad(shipFee, currency))}</strong></p>
      <p style="margin:6px 0 0;font-size:15px;color:#5c4f44;">Destination : ${escapeHtml(destLine)}</p>
      <p style="margin:6px 0 0;font-size:14px;color:#5c4f44;">Suivi : ${escapeHtml(tracking || "non encore attribué")} · Statut : ${escapeHtml(shipStatus)}</p>
    </td></tr>
    <tr><td style="padding:0 28px 28px;">
      <div style="background:#2a221c;border-radius:8px;padding:18px;color:#fff;">
        <p style="margin:0;font-size:14px;opacity:.85;">Sous-total produits : ${escapeHtml(moneyCad(productsCents, currency))}</p>
        <p style="margin:6px 0 0;font-size:14px;opacity:.85;">Livraison : ${escapeHtml(moneyCad(shipFee, currency))}</p>
        <p style="margin:6px 0 0;font-size:13px;opacity:.7;">${escapeHtml(archive?.financial?.tax_label_fr || "Taxes : non configurées — à valider")}</p>
        <p style="margin:12px 0 0;font-size:22px;">Total payé : ${escapeHtml(moneyCad(amountTotal, currency))}</p>
      </div>
      <p style="margin:16px 0 0;font-size:13px;color:#5c4f44;text-align:center;">Document imprimable — conservez ce bon de commande.</p>
    </td></tr>
  </table>
  </td></tr></table>
</body></html>`;

  return {
    from,
    to: [to],
    reply_to: email || undefined,
    subject,
    text,
    html,
    order_number: orderNumber,
  };
}

export async function sendResendEmail(env, body, fetchImpl = fetch) {
  const mock =
    env.SUGGESTION_MOCK === "true" ||
    !env.RESEND_API_KEY ||
    String(env.RESEND_API_KEY).includes("REMPLACER");
  if (mock) {
    return { ok: true, mocked: true, id: `mock_order_${Date.now()}`, subject: body.subject };
  }
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: body.from,
      to: body.to,
      reply_to: body.reply_to,
      subject: body.subject,
      text: body.text,
      html: body.html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.message || data.error || "resend_failed", status: res.status };
  }
  return { ok: true, mocked: false, id: data.id || null };
}

/**
 * Après webhook payé : archive + envoi bon (sauf si déjà envoyé).
 */
export async function notifyLucieOrderPaid(env, sessionObj, fetchImpl = fetch, opts = {}) {
  if (!sessionObj?.id) return { skipped: true, reason: "no_session" };

  const { force = false } = opts;
  const { wasNotifySent, getOrderArchive, ensureOrderNumber, buildOrderArchive, putOrderArchive, markNotifyResult } =
    await import("./order-archive.js");

  if (!force && (await wasNotifySent(env, sessionObj.id))) {
    return { skipped: true, reason: "already_notified", ok: true };
  }

  let pending = null;
  if (env.ORDERS) {
    try {
      const raw = await env.ORDERS.get(`pending:${sessionObj.id}`);
      if (raw) pending = JSON.parse(raw);
    } catch (_) {
      /* ignore */
    }
  }

  let archive = await getOrderArchive(env, sessionObj.id);
  const orderNumber = archive?.order_number || (await ensureOrderNumber(env, sessionObj.id));
  if (!archive || !archive.items?.length) {
    archive = buildOrderArchive({
      sessionObj,
      pending,
      orderNumber,
      shipping: pending?.shipping || {
        method_id: pending?.shipping_method,
        fee_cad_cents: pending?.shipping_fee_cents,
        destination: pending?.destination,
        source: pending?.shipping_source,
      },
    });
    archive = await putOrderArchive(env, archive);
  } else if (!archive.order_number) {
    archive.order_number = orderNumber;
    archive = await putOrderArchive(env, archive);
  }

  const mail = buildPaidOrderEmail(sessionObj, pending, env, archive);
  const sent = await sendResendEmail(env, mail, fetchImpl);
  await markNotifyResult(env, sessionObj.id, sent);
  return {
    ...sent,
    kind: mail.subject.includes("SUR MESURE") ? "custom" : "shop",
    order_number: mail.order_number,
  };
}

/** Régénère / renvoie le bon sans nouveau paiement. */
export async function resendOrderBon(env, { session_id, order_number }, fetchImpl = fetch) {
  const { findOrderArchive } = await import("./order-archive.js");
  const archive = await findOrderArchive(env, { session_id, order_number });
  if (!archive) {
    return { ok: false, error: "Commande introuvable", status: 404 };
  }
  const sessionObj = {
    id: archive.session_id,
    amount_total: archive.financial?.amount_total_cents,
    currency: archive.currency,
    payment_status: archive.payment_status,
    customer_details: {
      email: archive.customer?.email,
      name: archive.customer?.name,
      phone: archive.customer?.phone,
    },
    shipping_details: archive.shipping_address
      ? { address: archive.shipping_address }
      : null,
    metadata: {
      shipping: archive.shipping?.method,
      shipping_fee_cents: String(archive.shipping?.fee_cad_cents ?? 0),
      order_number: archive.order_number,
    },
  };
  return notifyLucieOrderPaid(env, sessionObj, fetchImpl, { force: true });
}
