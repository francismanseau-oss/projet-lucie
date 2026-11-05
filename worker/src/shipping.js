/**
 * Architecture frais de livraison — tarifs Lucie confirmés.
 * Postes Canada + Express Bus : 18 $ fixes / commande (fixed_per_order).
 * Pas de Purolator. Pas de supplément par quantité d’articles.
 */

import { httpError } from "./logic.js";

export function loadShippingConfig(config) {
  if (!config || config.policy?.no_invented_rates !== true) {
    throw httpError("Config livraison invalide (no_invented_rates requis)", 500);
  }
  return config;
}

export function listShippingMethods(config) {
  const c = loadShippingConfig(config);
  return Object.entries(c.methods || {}).map(([id, m]) => ({
    id,
    label_fr: m.label_fr,
    enabled: !!m.enabled,
    rates_source: m.rates_source || null,
    fee_cad_cents: m.fee_cad_cents === undefined ? null : m.fee_cad_cents,
    requires_manual_validation: !!m.requires_manual_validation,
    configured_for_charge: isMethodReadyToCharge(id, m),
  }));
}

export function isMethodReadyToCharge(methodId, method) {
  if (!method?.enabled) return false;
  if (methodId === "flat_order" || methodId === "canada_post") {
    if (method.rates_source === "unset") return false;
    if (method.rates_source === "fixed_per_order") {
      const fee = Number(method.fee_cad_cents);
      return Number.isInteger(fee) && fee >= 0 && method.fee_scope === "per_order";
    }
    if (methodId === "flat_order") return false;
    if (method.rates_source === "lucie_manual_table") {
      return method.rate_table_cad_cents != null && typeof method.rate_table_cad_cents === "object";
    }
    if (method.rates_source === "canada_post_rating_api") {
      return method.api?.configured === true;
    }
    return false;
  }
  if (methodId === "bus_quebec") {
    if (method.rates_source === "fixed_per_order") {
      const fee = Number(method.fee_cad_cents);
      return Number.isInteger(fee) && fee >= 0 && method.fee_scope === "per_order";
    }
    return false;
  }
  if (methodId === "pickup") {
    return method.enabled === true && method.fee_cad_cents === 0;
  }
  return false;
}

/** Express Bus seulement si province desservie. */
export function isBusDestinationServed(method, destination = {}) {
  const province = String(destination.province || "").toUpperCase();
  const served = method?.served_provinces || (method?.coverage === "QC" ? ["QC"] : []);
  if (!province) return false;
  return served.map((p) => String(p).toUpperCase()).includes(province);
}

/**
 * Quote livraison.
 * Refuse si tarifs non configurés. N'invente aucun montant.
 *
 * @param {object} opts.manualBusFeeCadCents - fourni seulement après validation Lucie
 * @param {object} opts.canadaPostQuoteCadCents - fourni par API/grille réelle (injection), jamais hardcodé ici
 */
export function quoteShipping(config, { methodId, destination = {}, manualBusFeeCadCents, canadaPostQuoteCadCents } = {}) {
  const c = loadShippingConfig(config);
  const method = c.methods?.[methodId];
  if (!method) throw httpError(`Méthode de livraison inconnue: ${methodId}`, 400);
  if (!method.enabled) {
    throw httpError(`Méthode désactivée: ${methodId}`, 403);
  }

  if (destination.country && destination.country !== "CA") {
    throw httpError("Livraison limitée au Canada pour cette phase", 400);
  }

  if (methodId === "flat_order" || methodId === "canada_post") {
    if (method.rates_source === "unset") {
      throw httpError(
        "Frais de livraison non configurés (rates_source=unset). Aucun tarif inventé.",
        403,
      );
    }
    if (!destination.postal_code || !destination.province) {
      throw httpError("Adresse canadienne incomplète (code postal + province)", 400);
    }

    if (method.rates_source === "fixed_per_order") {
      const fee = Number(method.fee_cad_cents);
      if (!Number.isInteger(fee) || fee < 0 || method.fee_scope !== "per_order") {
        throw httpError("Forfait livraison invalide (montant fixe par commande requis)", 500);
      }
      return {
        method_id: methodId,
        fee_cad_cents: fee,
        currency: "cad",
        source: "fixed_per_order",
        fee_scope: "per_order",
        invented: false,
        lucie_assigns_carrier: methodId === "flat_order",
        eta_business_days_fr: method.eta_business_days_fr || null,
        destination: {
          country: "CA",
          province: destination.province,
          postal_code: destination.postal_code,
        },
      };
    }
    if (methodId === "flat_order") {
      throw httpError("Méthode flat_order invalide", 500);
    }

    // Dimensions colis requises si grille / API
    const pkg = method.package_profile || {};
    if (pkg.weight_g == null) {
      throw httpError("Poids du colis non saisi par Lucie — impossible de coter", 403);
    }
    if (canadaPostQuoteCadCents == null) {
      throw httpError(
        "Aucune cote Postes Canada fournie (API ou grille Lucie). Refus — pas de frais inventés.",
        403,
      );
    }
    const fee = Number(canadaPostQuoteCadCents);
    if (!Number.isInteger(fee) || fee < 0) throw httpError("Cote Postes Canada invalide", 400);
    return {
      method_id: methodId,
      fee_cad_cents: fee,
      currency: "cad",
      source: method.rates_source,
      invented: false,
      destination: {
        country: "CA",
        province: destination.province,
        postal_code: destination.postal_code,
      },
    };
  }

  if (methodId === "bus_quebec") {
    if (!isBusDestinationServed(method, destination)) {
      throw httpError("Express Bus n’est proposé que si la destination est desservie (Québec)", 400);
    }
    if (method.rates_source === "fixed_per_order") {
      const fee = Number(method.fee_cad_cents);
      if (!Number.isInteger(fee) || fee < 0 || method.fee_scope !== "per_order") {
        throw httpError("Forfait Express Bus invalide (montant fixe par commande requis)", 500);
      }
      return {
        method_id: methodId,
        fee_cad_cents: fee,
        currency: "cad",
        source: "fixed_per_order",
        fee_scope: "per_order",
        invented: false,
        customer_pickup_required: true,
        eta_business_days_fr: method.eta_business_days_fr || "1 à 2 jours ouvrables",
      };
    }
    if (manualBusFeeCadCents == null) {
      throw httpError(
        "Frais Express Bus non confirmés pour cette commande — aucun montant inventé",
        403,
      );
    }
    const fee = Number(manualBusFeeCadCents);
    if (!Number.isInteger(fee) || fee < 0) throw httpError("Frais Express Bus invalides", 400);
    return {
      method_id: methodId,
      fee_cad_cents: fee,
      currency: "cad",
      source: "manual_lucie",
      invented: false,
      manual_validated: true,
      customer_pickup_required: true,
    };
  }

  if (methodId === "pickup") {
    return {
      method_id: methodId,
      fee_cad_cents: 0,
      currency: "cad",
      source: "pickup",
      invented: false,
    };
  }

  throw httpError(`Méthode non supportée: ${methodId}`, 400);
}

/**
 * Construit shipping_options Stripe seulement si quote réelle.
 * Sinon refuse (aligné Phase A : pas de frais inventés).
 */
export function buildStripeShippingOption(quote) {
  if (!quote || quote.invented) throw httpError("Quote livraison invalide", 500);
  if (!Number.isInteger(quote.fee_cad_cents) || quote.fee_cad_cents < 0) {
    throw httpError("Frais livraison invalides", 500);
  }
  return {
    "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
    "shipping_options[0][shipping_rate_data][fixed_amount][amount]": quote.fee_cad_cents,
    "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "cad",
    "shipping_options[0][shipping_rate_data][display_name]": quote.method_id,
  };
}

/** Gate env : pas de shipping_options tant que SHIPPING_CONFIGURED !== true */
export function assertShippingGate(env, quote) {
  if (env.SHIPPING_CONFIGURED !== "true") {
    throw httpError(
      "SHIPPING_CONFIGURED=false — aucun frais de livraison ne peut être facturé",
      403,
    );
  }
  if (!quote || quote.invented !== false) {
    throw httpError("Quote livraison manquante ou inventée refusée", 403);
  }
}

/**
 * Règle checkout (paiement unique produits + livraison) :
 * - quote.from_locked_token → frais confirmés (grille / API / Lucie hold) — un seul Checkout
 * - FREE_SHIPPING_AUTHORIZED=true → 0 $ (explicite Lucie)
 * - SHIPPING_CONFIGURED=true → quote serveur obligatoire (pas inventée)
 * - sinon ALLOW_CHECKOUT_WITHOUT_SHIPPING=true + Worker test seulement → différé mocks
 * - sinon refus
 */
export function resolveCheckoutShipping(env, quote = null) {
  if (quote && quote.from_locked_token === true && quote.invented === false) {
    if (!Number.isInteger(quote.fee_cad_cents) || quote.fee_cad_cents < 0) {
      throw httpError("Frais de livraison (jeton) invalides", 400);
    }
    return {
      mode: "quoted",
      fee_cad_cents: quote.fee_cad_cents,
      charged: quote.fee_cad_cents > 0,
      invented: false,
      quote,
    };
  }

  if (env.FREE_SHIPPING_AUTHORIZED === "true") {
    return {
      mode: "free_authorized",
      fee_cad_cents: 0,
      charged: true,
      invented: false,
      quote: { method_id: "free", fee_cad_cents: 0, invented: false, currency: "cad" },
    };
  }

  if (env.SHIPPING_CONFIGURED === "true") {
    assertShippingGate(env, quote);
    if (!Number.isInteger(quote.fee_cad_cents) || quote.fee_cad_cents < 0) {
      throw httpError("Frais de livraison serveur invalides", 400);
    }
    return {
      mode: "quoted",
      fee_cad_cents: quote.fee_cad_cents,
      charged: quote.fee_cad_cents > 0,
      invented: false,
      quote,
    };
  }

  const testOnly = env.WORKER_ENV === "test" || env.FORCE_TEST_KEYS_ONLY === "true";
  if (env.ALLOW_CHECKOUT_WITHOUT_SHIPPING === "true" && testOnly) {
    return {
      mode: "phase_a_deferred_test_only",
      fee_cad_cents: 0,
      charged: false,
      invented: false,
      quote: null,
    };
  }

  throw httpError(
    "Livraison non validée — checkout refusé. Obtenez une cote (quote_token) ou confirmation Lucie avant le paiement unique.",
    403,
  );
}
