/**
 * Import commandes payées depuis Stripe TEST (sk_test uniquement).
 * Ne crée pas de commandes fictives : uniquement ce que Stripe renvoie.
 */
import fs from "node:fs";

function readSkTest(devVarsPath) {
  if (!fs.existsSync(devVarsPath)) return null;
  const raw = fs.readFileSync(devVarsPath, "utf8");
  const m = raw.match(/^STRIPE_SECRET_KEY=(.+)$/m);
  const sk = m?.[1]?.trim();
  if (!sk || !sk.startsWith("sk_test_")) return null;
  return sk;
}

function mapStripeSessionToOrder(session) {
  const paid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const lineItems = Array.isArray(session._line_items) ? session._line_items : [];
  const items = lineItems.map((li) => {
    const meta = li.price?.product?.metadata || li.price?.metadata || {};
    const custom = meta.custom === "1" || String(meta.csm_code || "").includes("CSM");
    return {
      id: meta.product_id || li.id,
      name: li.description || li.price?.product?.name || "Article",
      product_number: meta.product_number ? Number(meta.product_number) : null,
      qty: li.quantity || 1,
      unit_amount: li.price?.unit_amount ?? li.amount_total ?? null,
      size: meta.size || null,
      size_label_fr: meta.size_label_fr || null,
      size_label_en: meta.size_label_en || null,
      inventory_id: meta.inventory_id || null,
      custom,
      custom_config: custom
        ? {
            product_id: meta.boutique_id || meta.product_id || null,
            product_number: meta.product_number ? Number(meta.product_number) : null,
            csm_code: meta.csm_code || null,
            unit: meta.unit || null,
            measurements: meta.measurements ? safeJson(meta.measurements) : {},
            measurements_cm: meta.measurements_cm ? safeJson(meta.measurements_cm) : null,
            comments: meta.comments || "",
            leather: meta.leather || "noir",
            chaleur: meta.chaleur === "1" || meta.chaleur === "true",
          }
        : null,
    };
  });

  return {
    id: session.id,
    session_id: session.id,
    created_at: new Date((session.created || 0) * 1000).toISOString(),
    amount_total_cents: session.amount_total,
    currency: session.currency || "cad",
    payment_status: session.payment_status,
    payment_verified: paid,
    customer_email: session.customer_details?.email || session.customer_email || null,
    customer_name: session.customer_details?.name || null,
    items,
    source: "stripe_test",
    fulfillment_status: items.some((i) => i.custom) ? "a_fabriquer" : "a_preparer",
  };
}

function safeJson(s) {
  try {
    return typeof s === "string" ? JSON.parse(s) : s;
  } catch {
    return {};
  }
}

export async function importPaidOrdersFromStripeTest({
  devVarsPath,
  limit = 20,
  fetchImpl = fetch,
}) {
  const sk = readSkTest(devVarsPath);
  if (!sk) {
    const err = new Error(
      "Clé sk_test absente ou invalide dans worker/.dev.vars — import Stripe impossible",
    );
    err.status = 503;
    throw err;
  }

  const listRes = await fetchImpl(
    `https://api.stripe.com/v1/checkout/sessions?limit=${Math.min(50, Math.max(1, limit))}`,
    { headers: { Authorization: `Bearer ${sk}` } },
  );
  const listJson = await listRes.json();
  if (!listRes.ok) {
    const err = new Error(listJson.error?.message || "Erreur liste sessions Stripe");
    err.status = 502;
    throw err;
  }

  const imported = [];
  const skipped = [];

  for (const session of listJson.data || []) {
    if (session.livemode === true) {
      skipped.push({ id: session.id, reason: "livemode_forbidden" });
      continue;
    }
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      skipped.push({ id: session.id, reason: "not_paid", payment_status: session.payment_status });
      continue;
    }

    // Expand line items
    const liRes = await fetchImpl(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=100&expand[]=data.price.product`,
      { headers: { Authorization: `Bearer ${sk}` } },
    );
    const liJson = await liRes.json();
    session._line_items = liRes.ok ? liJson.data || [] : [];

    imported.push(mapStripeSessionToOrder(session));
  }

  return {
    mode: "test",
    imported_count: imported.length,
    skipped_count: skipped.length,
    skipped,
    orders: imported,
  };
}
