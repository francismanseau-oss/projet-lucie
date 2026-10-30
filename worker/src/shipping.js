/**
 * Architecture frais de livraison — AUCUN tarif inventé.
 * Postes Canada : grille Lucie ou API Rating (non branchée tant que rates_source=unset).
 * Autobus Québec : frais null jusqu'à validation manuelle Lucie par commande.
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
  if (methodId === "canada_post") {
    if (method.rates_source === "unset") return false;
    if (method.rates_source === "lucie_manual_table") {
      return method.rate_table_cad_cents != null && typeof method.rate_table_cad_cents === "object";
    }
    if (method.rates_source === "canada_post_rating_api") {
      return method.api?.configured === true;
    }
    return false;
  }
  if (methodId === "bus_quebec") {
    // Jamais de frais auto : exige validation manuelle + fee saisi pour CETTE estimation
    return false;
  }
  if (methodId === "pickup") {
    return method.enabled === true && method.fee_cad_cents === 0;
  }
  return false;
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

  if (methodId === "canada_post") {
    if (method.rates_source === "unset") {
      throw httpError(
        "Frais Postes Canada non configurés (rates_source=unset). Aucun tarif inventé.",
        403,
      );
    }
    if (!destination.postal_code || !destination.province) {
      throw httpError("Adresse canadienne incomplète (code postal + province)", 400);
    }
    // Dimensions colis requises si profil encore null
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
    if (destination.province && destination.province !== "QC") {
      throw httpError("Livraison autobus limitée au Québec", 400);
    }
    if (!method.requires_manual_validation) {
      throw httpError("bus_quebec doit exiger une validation manuelle Lucie", 500);
    }
    if (manualBusFeeCadCents == null) {
      throw httpError(
        "Frais autobus non validés par Lucie pour cette commande — aucun montant par défaut",
        403,
      );
    }
    const fee = Number(manualBusFeeCadCents);
    if (!Number.isInteger(fee) || fee < 0) throw httpError("Frais autobus invalides", 400);
    return {
      method_id: methodId,
      fee_cad_cents: fee,
      currency: "cad",
      source: "manual_lucie",
      invented: false,
      manual_validated: true,
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
 * Règle checkout :
 * - FREE_SHIPPING_AUTHORIZED=true → 0 $ (explicite)
 * - SHIPPING_CONFIGURED=true → quote serveur obligatoire (pas inventée)
 * - sinon ALLOW_CHECKOUT_WITHOUT_SHIPPING=true + Worker test seulement → différé Phase A
 * - sinon refus (pas de paiement sans livraison validée)
 */
export function resolveCheckoutShipping(env, quote = null) {
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
    "Livraison non validée — checkout refusé (ni frais validés ni livraison gratuite autorisée).",
    403,
  );
}
