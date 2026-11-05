/**
 * Modèle commandes Lucie — statuts fabrication / livraison.
 * Le statut de paiement Stripe n’est jamais modifié ici.
 */

export const PAYMENT_STATUSES_VERIFIED = new Set(["paid", "paid_confirmed", "no_payment_required"]);

/** Statuts opérationnels Lucie (pas Stripe). */
export const FULFILLMENT_STATUSES = {
  a_fabriquer: "À fabriquer",
  en_fabrication: "En fabrication",
  a_preparer: "À préparer",
  pret: "Prêt",
  expediee: "Expédiée",
  annulee: "Annulée (ops)",
};

export const SHIPPING_FEE_STATUSES = {
  a_confirmer: "Livraison à confirmer",
  propose_client: "Tarif proposé au client",
  accepte_client: "Tarif accepté par le client",
  facture: "Frais facturés",
  non_applicable: "Sans livraison",
};

export const SHIPPING_METHODS = {
  a_confirmer: "Mode à confirmer avec Lucie",
  canada_post: "Postes Canada",
  bus_quebec: "Transport par autobus (Québec)",
  pickup: "Ramassage",
};

export function emptyShipping() {
  return {
    method: "a_confirmer",
    fee_status: "a_confirmer",
    fee_cad_cents: null,
    client_fee_agreed: false,
    tracking_number: null,
    shipment_status: null,
    package: {
      weight_g: null,
      length_cm: null,
      width_cm: null,
      height_cm: null,
    },
    bus: {
      carrier: null,
      dropoff_point: null,
      pickup_point: null,
      reference: null,
      transport_status: null,
      carrier_accepts_parcels_verified: false,
    },
    note: "",
  };
}

export function normalizeOrder(raw = {}) {
  const payment_status = raw.payment_status || "unknown";
  const payment_verified = !!raw.payment_verified || PAYMENT_STATUSES_VERIFIED.has(payment_status);
  const items = Array.isArray(raw.items) ? raw.items : [];
  const has_csm = items.some((i) => i.custom || i.custom_config || String(i.id || "").startsWith("custom:"));
  return {
    id: raw.id || raw.order_id || raw.session_id,
    session_id: raw.session_id || raw.id,
    created_at: raw.created_at || raw.confirmed_at || new Date().toISOString(),
    updated_at: raw.updated_at || raw.created_at || null,
    amount_total_cents: raw.amount_total_cents ?? raw.amount_total ?? null,
    currency: raw.currency || "cad",
    payment_status,
    payment_verified,
    /** Jamais modifié par les actions Lucie ops */
    stripe_payment_locked: true,
    fulfillment_status: raw.fulfillment_status || (has_csm ? "a_fabriquer" : "a_preparer"),
    customer_email: raw.customer_email || null,
    customer_name: raw.customer_name || null,
    items,
    has_csm,
    shipping: { ...emptyShipping(), ...(raw.shipping || {}) },
    status_history: Array.isArray(raw.status_history) ? raw.status_history : [],
    source: raw.source || "unknown",
    source_label:
      raw.source === "stripe_test"
        ? "Stripe TEST"
        : raw.source === "test_fixture"
          ? "Jeu d’essai (non réel)"
          : raw.source_label || raw.source || "Inconnu",
    notes_lucie: raw.notes_lucie || "",
  };
}

export function filterOrders(orders, { filter = "toutes", search = "" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return (orders || []).filter((o) => {
    const ord = normalizeOrder(o);
    if (filter === "payees" && !ord.payment_verified) return false;
    if (filter === "a_fabriquer") {
      const ok =
        ord.fulfillment_status === "a_fabriquer" || ord.fulfillment_status === "en_fabrication";
      if (!ok) return false;
    }
    if (filter === "a_preparer" && !["a_preparer", "pret"].includes(ord.fulfillment_status)) return false;
    if (filter === "expediees" && ord.fulfillment_status !== "expediee") return false;
    if (filter === "annulees" && ord.fulfillment_status !== "annulee") return false;
    if (!q) return true;
    const blob = [
      ord.id,
      ord.session_id,
      ord.customer_email,
      ord.customer_name,
      ...ord.items.map((i) =>
        [i.name, i.id, i.product_number, i.custom_config?.csm_code, i.custom_config?.product_id].join(" "),
      ),
    ]
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}

export function assertFulfillmentStatus(status) {
  if (!Object.prototype.hasOwnProperty.call(FULFILLMENT_STATUSES, status)) {
    const err = new Error("Statut de fabrication / préparation invalide");
    err.status = 400;
    throw err;
  }
  return status;
}

/** Interdit de changer le paiement Stripe via l’admin. */
export function assertNotTouchingPayment(patch = {}) {
  const forbidden = ["payment_status", "payment_verified", "amount_total_cents", "amount_total", "session_id"];
  for (const k of forbidden) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      const err = new Error("Le statut de paiement Stripe ne peut pas être modifié ici");
      err.status = 403;
      throw err;
    }
  }
}

export function assertNoInventedShippingFee(shipping) {
  if (!shipping) return;
  const fee = shipping.fee_cad_cents;
  if (fee == null || fee === "") return;
  const n = Number(fee);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    const err = new Error("Frais de livraison invalides");
    err.status = 400;
    throw err;
  }
  if (shipping.fee_status === "a_confirmer" && n > 0) {
    const err = new Error(
      "Impossible d’enregistrer un montant tant que le statut est « Livraison à confirmer »",
    );
    err.status = 400;
    throw err;
  }
  if (shipping.fee_status === "facture" && !shipping.client_fee_agreed) {
    const err = new Error("Accord client requis avant de marquer les frais comme facturés");
    err.status = 400;
    throw err;
  }
}
