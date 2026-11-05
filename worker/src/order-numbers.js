/**
 * Numéros de commande permanents Lucie — LFB-YYYYMMDD-XXXX
 * Indépendants de Stripe cs_…
 */

/**
 * @param {object} opts
 * @param {() => Date} [opts.now]
 * @param {() => number} [opts.random] — 0..1
 */
export function generateOrderNumber(opts = {}) {
  const now = opts.now ? opts.now() : new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = opts.random ? opts.random() : Math.random();
  const seq = String(Math.floor(rand * 10000)).padStart(4, "0");
  return `LFB-${y}${m}${d}-${seq}`;
}

export function isValidOrderNumber(value) {
  return /^LFB-\d{8}-\d{4}$/.test(String(value || ""));
}
