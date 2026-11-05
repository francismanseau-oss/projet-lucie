/**
 * Affichage numéros produits + codes CSM (pas de changement de prix / id).
 * Script navigateur uniquement.
 */
(function (root) {
  "use strict";

  function csmCode(productNumber) {
    const n = Number(productNumber);
    if (!Number.isFinite(n) || n < 1) return "";
    return n + "-CSM";
  }

  function displayCode(item) {
    if (!item) return "";
    const num = item.product_number ?? item.custom_config?.product_number ?? null;
    if (item.custom || String(item.id || "").startsWith("custom:")) {
      return csmCode(num) || "CSM";
    }
    if (num != null) return String(num);
    return "";
  }

  function isCsm(item) {
    return !!(item && (item.custom || String(item.id || "").startsWith("custom:")));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function codeBadgeHtml(item) {
    const code = displayCode(item);
    if (!code) return "";
    if (isCsm(item) || String(code).endsWith("-CSM")) {
      return '<span class="product-code product-code--csm">' + escapeHtml(code) + "</span>";
    }
    return '<span class="product-code">N° ' + escapeHtml(code) + "</span>";
  }

  root.BOREALES_PRODUCT_CODES = { csmCode, displayCode, isCsm, codeBadgeHtml };
})(typeof window !== "undefined" ? window : globalThis);
