/**
 * URLs de retour Checkout — le placeholder Stripe doit survivre jusqu'à la redirection client.
 * Bug local connu : certains serveurs static (ex. `serve` + cleanUrls) font
 * 301 de `page.html?session_id=…` → `/page` **sans** query → confirmation impossible.
 */

export const CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

/**
 * Garantit success_url avec session_id={CHECKOUT_SESSION_ID} (ou conserve si déjà présent).
 */
export function normalizeCheckoutSuccessUrl(url, siteBase) {
  const base = String(siteBase || "").replace(/\/$/, "");
  const fallback = `${base}/commande-confirmee.html?session_id=${CHECKOUT_SESSION_PLACEHOLDER}`;
  let u = String(url || "").trim() || fallback;
  if (!u.includes(CHECKOUT_SESSION_PLACEHOLDER)) {
    const join = u.includes("?") ? "&" : "?";
    // Évite de dupliquer un session_id vide / cassé
    u = u.replace(/([?&])session_id=[^&]*/g, "").replace(/[?&]$/, "");
    u = `${u}${u.includes("?") ? "&" : "?"}session_id=${CHECKOUT_SESSION_PLACEHOLDER}`;
  }
  return u;
}

/** Lecture navigateur : session_id dans query (jamais confirmer si absent / placeholder). */
export function readCheckoutSessionIdFromSearch(search) {
  const raw = String(search || "");
  const q = raw.startsWith("?") || raw.startsWith("#") ? raw.slice(1) : raw;
  const params = new URLSearchParams(q.includes("=") ? q : raw);
  const id = String(params.get("session_id") || "").trim();
  if (!id || id === CHECKOUT_SESSION_PLACEHOLDER) return "";
  if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) return "";
  return id;
}
