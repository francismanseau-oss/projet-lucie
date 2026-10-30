/**
 * Protection données personnelles — minimisation côté réponses client.
 * Lucie consulte le détail via Dashboard Stripe / accès Cloudflare contrôlé — pas via l’API publique.
 */

export function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const [user, domain] = email.split("@");
  if (!domain) return null;
  const u = user.length <= 1 ? "*" : user[0] + "***";
  return `${u}@${domain}`;
}

/** Champs renvoyés au navigateur pour order-status (sans PII complète). */
export function publicOrderView(status) {
  if (!status || typeof status !== "object") return status;
  const { customer_email, ...rest } = status;
  return {
    ...rest,
    customer_email_masked: maskEmail(customer_email),
    // jamais renvoyer l’e-mail en clair au client
  };
}

export const PRIVACY_NOTES = {
  client_api: "Pas d’e-mail en clair sur /api/order-status",
  secrets: "sk_ / whsec_ uniquement Cloudflare Secrets (compte Lucie idéalement)",
  lucie_access: "Dashboard Stripe + CF : Lucie propriétaire ; Francis = code, pas secrets par message",
  orders_kv: "Métadonnées commande en KV ORDERS — accès admin CF = risque ; préférer compte Lucie",
};
