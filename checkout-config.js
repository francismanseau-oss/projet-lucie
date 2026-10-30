/** Préprod test — URL du Worker uniquement. Aucune clé secrète. */
window.BOREALES_CHECKOUT = {
  /** Local : wrangler dev -c wrangler.test.toml → http://127.0.0.1:8787 */
  apiBase: "http://127.0.0.1:8787",
  /** Toujours "test" jusqu'à autorisation de production */
  mode: "test",
  /** Confirmation commande = GET /api/order-status — jamais la seule redirection */
  confirmViaServer: true,
};
