/**
 * Modèle commandes Lucie — statuts fabrication / livraison.
 * Le statut de paiement Stripe n’est jamais modifié ici.
 */

export const PAYMENT_STATUSES_VERIFIED = new Set(["paid", "paid_confirmed", "no_payment_required"]);

/** Statuts opérationnels Lucie (pas Stripe). */
export const FULFILLMENT_STATUSES = {
  a_fabriquer: "Sur mesure",
  en_fabrication: "Sur mesure — en cours",
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
  bus_quebec: "Express bus",
};

export function emptyShipping() {
  return {
    /** Transporteur / mode utilisé pour préparer l’envoi (peut différer du choix client). */
    method: "a_confirmer",
    /** Choix client à la caisse (canada_post | bus_quebec) — ne pas écraser. */
    client_chosen_method: null,
    /** Si Lucie utilise un autre transporteur : note libre, sans effacer le choix client. */
    actual_carrier: null,
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

/** Libellés courts pour Lucie / client. */
export const SHIPPING_METHOD_SHORT = {
  canada_post: "Postes Canada",
  bus_quebec: "Express bus",
  a_confirmer: "À confirmer",
};

export function shippingMethodShortLabel(id) {
  if (!id) return "À confirmer";
  return SHIPPING_METHOD_SHORT[id] || id;
}

/** Méthode réellement choisie / connue du client (priorité au choix enregistré). */
export function resolveClientChosenMethod(shipping = {}) {
  const chosen = shipping.client_chosen_method || null;
  if (chosen && chosen !== "a_confirmer") return chosen;
  const m = shipping.method || null;
  if (m && m !== "a_confirmer") return m;
  return null;
}

/** Fusion import Stripe : ne pas écraser un vrai choix client avec « a_confirmer ». */
export function mergeShippingOnImport(prevShip, nextShip) {
  const prev = { ...emptyShipping(), ...(prevShip || {}) };
  const next = { ...emptyShipping(), ...(nextShip || {}) };
  const prevChosen = resolveClientChosenMethod(prev);
  const nextChosen = resolveClientChosenMethod(next);
  const client_chosen_method = prevChosen || nextChosen || null;
  const prevMethodUnset = !prev.method || prev.method === "a_confirmer";
  const nextMethodSet = !!(next.method && next.method !== "a_confirmer");
  const method =
    prevMethodUnset && nextMethodSet
      ? next.method
      : prevMethodUnset
        ? client_chosen_method || next.method || prev.method
        : prev.method;
  const prevFee = prev.fee_cad_cents != null ? Number(prev.fee_cad_cents) : null;
  const nextFee = next.fee_cad_cents != null ? Number(next.fee_cad_cents) : null;
  const fee_cad_cents =
    prevFee != null && prevFee > 0 ? prevFee : nextFee != null ? nextFee : prevFee;
  return {
    ...prev,
    ...next,
    client_chosen_method,
    method,
    actual_carrier: prev.actual_carrier || next.actual_carrier || null,
    fee_cad_cents,
    fee_status:
      prev.fee_status && prev.fee_status !== "a_confirmer" ? prev.fee_status : next.fee_status,
    client_fee_agreed: !!(prev.client_fee_agreed || next.client_fee_agreed),
    bus: { ...prev.bus, ...next.bus },
    package: { ...prev.package, ...next.package },
  };
}

/** Complète mode / frais à partir du paiement (sans inventer un transporteur). */
export function enrichShippingFromPayment(shipping, amountShippingCents) {
  const ship = { ...emptyShipping(), ...(shipping || {}) };
  const chosen = resolveClientChosenMethod(ship);
  if (chosen) {
    if (!ship.client_chosen_method || ship.client_chosen_method === "a_confirmer") {
      ship.client_chosen_method = chosen;
    }
    if (!ship.method || ship.method === "a_confirmer") {
      ship.method = chosen;
    }
  }
  const paidShip =
    amountShippingCents != null && Number.isFinite(Number(amountShippingCents))
      ? Number(amountShippingCents)
      : null;
  if ((ship.fee_cad_cents == null || ship.fee_cad_cents === "") && paidShip != null && paidShip > 0) {
    ship.fee_cad_cents = paidShip;
  }
  if (
    ship.fee_cad_cents != null &&
    Number(ship.fee_cad_cents) > 0 &&
    (!ship.fee_status || ship.fee_status === "a_confirmer")
  ) {
    ship.fee_status = "facture";
    ship.client_fee_agreed = true;
  }
  return ship;
}

export function normalizeOrder(raw = {}) {
  const payment_status = raw.payment_status || "unknown";
  const payment_verified = !!raw.payment_verified || PAYMENT_STATUSES_VERIFIED.has(payment_status);
  const items = Array.isArray(raw.items) ? raw.items : [];
  const has_csm = items.some((i) => i.custom || i.custom_config || String(i.id || "").startsWith("custom:"));
  const amount_shipping_cents = raw.amount_shipping_cents ?? null;
  return {
    id: raw.id || raw.order_id || raw.session_id,
    session_id: raw.session_id || raw.id,
    order_number: raw.order_number || raw.metadata?.order_number || null,
    client_number: raw.client_number != null ? Math.floor(Number(raw.client_number)) : null,
    created_at: raw.created_at || raw.confirmed_at || new Date().toISOString(),
    /** Date de confirmation (réelle) — base des délais de retard (Québec). */
    confirmed_at: raw.confirmed_at || raw.created_at || null,
    updated_at: raw.updated_at || raw.created_at || null,
    amount_total_cents: raw.amount_total_cents ?? raw.amount_total ?? null,
    amount_subtotal_cents: raw.amount_subtotal_cents ?? raw.amount_subtotal ?? null,
    amount_shipping_cents,
    currency: raw.currency || "cad",
    payment_status,
    payment_verified,
    /** Jamais modifié par les actions Lucie ops */
    stripe_payment_locked: true,
    fulfillment_status: raw.fulfillment_status || (has_csm ? "a_fabriquer" : "a_preparer"),
    customer_email: raw.customer_email || null,
    customer_name: raw.customer_name || null,
    customer_phone: raw.customer_phone || null,
    shipping_address: raw.shipping_address || null,
    items,
    has_csm,
    shipping: enrichShippingFromPayment(raw.shipping, amount_shipping_cents),
    status_history: Array.isArray(raw.status_history) ? raw.status_history : [],
    source: raw.source || "unknown",
    source_label:
      raw.source === "stripe_test"
        ? "Stripe TEST"
        : raw.source === "test_fixture"
          ? "Jeu d’essai (non réel)"
          : raw.source_label || raw.source || "Inconnu",
    notes_lucie: raw.notes_lucie || "",
    archived: !!raw.archived,
    archived_at: raw.archived_at || null,
  };
}

/** Compteurs réels pour le tableau de bord Lucie (aucun chiffre inventé). */
export function summarizeOrders(orders) {
  const list = (orders || []).map(normalizeOrder);
  const active = list.filter((o) => !o.archived);
  const count = (pred) => active.filter(pred).length;
  return {
    total: active.length,
    archivees: list.filter((o) => o.archived).length,
    a_fabriquer: count(
      (o) => o.fulfillment_status === "a_fabriquer" || o.fulfillment_status === "en_fabrication",
    ),
    a_preparer: count(
      (o) => o.fulfillment_status === "a_preparer" || o.fulfillment_status === "pret",
    ),
    expediees: count((o) => o.fulfillment_status === "expediee"),
    annulees: count((o) => o.fulfillment_status === "annulee"),
    payees: count((o) => o.payment_verified),
    en_retard: count((o) => computeOrderLateness(o).late),
  };
}

export function filterOrders(orders, { filter = "toutes", search = "" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return (orders || []).filter((o) => {
    const ord = normalizeOrder(o);
    if (filter === "archivees") {
      if (!ord.archived) return false;
    } else if (ord.archived) {
      return false;
    }
    if (filter === "payees" && !ord.payment_verified) return false;
    if (filter === "a_fabriquer") {
      const ok =
        ord.fulfillment_status === "a_fabriquer" || ord.fulfillment_status === "en_fabrication";
      if (!ok) return false;
    }
    if (filter === "a_preparer" && !["a_preparer", "pret"].includes(ord.fulfillment_status)) return false;
    if (filter === "expediees" && ord.fulfillment_status !== "expediee") return false;
    if (filter === "annulees" && ord.fulfillment_status !== "annulee") return false;
    if (filter === "en_retard" && !computeOrderLateness(ord).late) return false;
    if (!q) return true;
    const blob = [
      ord.id,
      ord.session_id,
      ord.order_number,
      ord.client_number,
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

const TZ_QC = "America/Toronto";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Parties calendrier (Y/M/D) en fuseau Québec. */
export function torontoYmd(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_QC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Sur mesure — haute saison : 1er nov → 1er jan inclus (21 j).
 * Hors saison : 2 jan → 31 oct (7 j). Figé à la date de confirmation.
 */
export function isCustomPeakSeason(confirmedAt) {
  const ymd = torontoYmd(confirmedAt);
  if (!ymd) return false;
  const { month, day } = ymd;
  if (month === 11 || month === 12) return true;
  if (month === 1 && day === 1) return true;
  return false;
}

export function customLatenessThresholdMs(confirmedAt) {
  return isCustomPeakSeason(confirmedAt) ? 21 * DAY_MS : 7 * DAY_MS;
}

/**
 * Retard ops (pas Stripe). Expédiée / annulée → aucun voyant.
 * Sur mesure : jamais l’alerte 48 h ordinaire.
 */
export function computeOrderLateness(order, now = new Date()) {
  const o = normalizeOrder(order);
  const confirmedAt = o.confirmed_at || o.created_at;
  const confirmedMs = new Date(confirmedAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const elapsed = Number.isFinite(confirmedMs) ? Math.max(0, nowMs - confirmedMs) : 0;
  const waitDays = Math.floor(elapsed / DAY_MS);
  const closed =
    o.archived ||
    o.fulfillment_status === "expediee" ||
    o.fulfillment_status === "annulee";

  const base = {
    late: false,
    wait_days: waitDays,
    threshold_hours: null,
    kind: null,
    label: null,
    age_label: null,
    confirmed_at: confirmedAt,
  };

  if (closed || !Number.isFinite(confirmedMs)) return base;

  let thresholdMs;
  let kind;
  if (o.has_csm) {
    kind = "custom";
    thresholdMs = customLatenessThresholdMs(confirmedAt);
  } else {
    kind = "ordinary";
    thresholdMs = 2 * DAY_MS; // 48 h
  }

  const late = elapsed >= thresholdMs;
  const jour = waitDays <= 1 ? "jour" : "jours";
  return {
    ...base,
    late,
    threshold_hours: thresholdMs / HOUR_MS,
    kind,
    label: late ? `En retard — ${waitDays} ${jour} d'attente` : null,
    age_label:
      waitDays < 1
        ? "En attente depuis moins d’un jour"
        : `En attente depuis ${waitDays} ${jour}`,
  };
}

/** Attache `lateness` sans muter l’historique stocké. */
export function withOrderLateness(order, now = new Date()) {
  const o = normalizeOrder(order);
  return { ...o, lateness: computeOrderLateness(o, now) };
}

/** Tri affichage — défaut : plus anciennes d’abord. */
export function sortOrders(orders, sort = "oldest") {
  const list = [...(orders || [])];
  const key = (o) => new Date(o.confirmed_at || o.created_at || 0).getTime() || 0;
  list.sort((a, b) => {
    const da = key(a);
    const db = key(b);
    return sort === "newest" ? db - da : da - db;
  });
  return list;
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
