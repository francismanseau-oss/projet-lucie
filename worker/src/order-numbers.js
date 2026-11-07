/**
 * Numéros de commande permanents Lucie — LFB-YYYYMMDD-HHMM
 * Date + heure (minute), fuseau Québec. Pas de compteur séquentiel (pour l’instant).
 */

/**
 * @param {object} opts
 * @param {() => Date} [opts.now]
 * @param {string} [opts.timeZone] — défaut America/Toronto
 */
export function generateOrderNumber(opts = {}) {
  const now = opts.now ? opts.now() : new Date();
  const timeZone = opts.timeZone || "America/Toronto";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `LFB-${get("year")}${get("month")}${get("day")}-${hour}${get("minute")}`;
}

export function isValidOrderNumber(value) {
  return /^LFB-\d{8}-\d{4}$/.test(String(value || ""));
}
