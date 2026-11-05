# Audit d’intégration Stripe × stocks × livraison

Date : 2026-10-30 — local only, aucun deploy.

## Corrections techniques appliquées

1. **Store inventaire** : `resolveInventoryStore(env)` → `env.DB` (D1) ou `env.INVENTORY_TX` (tests). KV interdit pour les stocks.
2. **Lien réservation ↔ session** : `attachSession` après création Checkout + `pending:{session_id}` + `metadata[reservation_id]` + `rsv:{id}`.
3. **Paiement tardif** : `settlePaid` — commit si held ; réacquisition si expired/released ; sinon `paid_no_stock` + alerte KV (pas de survente).
4. **Livraison dans le total** : `resolveCheckoutShipping` + `serverCheckoutTotalCents` + `shipping_options` Stripe seulement si quote serveur validée ; free seulement si `FREE_SHIPPING_AUTHORIZED=true`.
5. **PII** : `/api/order-status` renvoie `customer_email_masked` uniquement.
6. **Production** : gates `PACKAGE_PROFILES_CONFIGURED` + `COMMERCIAL_TERMS_CONFIGURED` en plus des existantes.

## Bilan

### Réellement intégrées (code Worker)

| Fonction | Statut |
|----------|--------|
| Prix catalogue serveur → Stripe line_items | Oui |
| Réservation avant Checkout si `AVAILABILITY_CONFIGURED` | Oui |
| Association reservation_id ↔ session_id | Oui |
| Webhook paid → settlePaid / failed→release | Oui |
| Doublons webhook (evt idempotents) | Oui |
| paid_no_stock sans survente | Oui |
| Refus checkout sans livraison (sauf free / allow test) | Oui |
| Total produits + livraison serveur | Oui |
| Masquage e-mail order-status | Oui |
| Blocage production multi-gates | Oui |
| Contrat D1 (`createD1Store`) | Oui (code) |

### Simulées (tests / MemoryTx)

| Fonction | Statut |
|----------|--------|
| Atomicité concurrente | MemoryTx mutex (= contrat D1) |
| Stripe API | Mocks `installMockStripeFetch` |
| D1 SQL réel sur Cloudflare | Emulé en tests via MemoryTx ; adaptateur D1 prêt |

### Encore à connecter (infra Lucie / Francis)

| Fonction | Manque |
|----------|--------|
| Binding `[[d1_databases]]` + migrate SQL | Compte CF + autorisation deploy |
| Seed inventaire depuis CSV Lucie | Saisies Lucie |
| API Rating Postes Canada | Clés / grille Lucie |
| Cron `POST /api/reservations/expire` | Scheduler CF |
| Remboursement auto `paid_no_stock` | Décision Lucie + Stripe refund API |
| Worker prod (sans ALLOW_CHECKOUT_WITHOUT_SHIPPING) | Go-live |

### Décisions Lucie

1. Remplir inventaire (types + quantités)  
2. Colis (poids/dimensions) → `PACKAGE_PROFILES_CONFIGURED`  
3. Tarifs Postes Canada / règles autobus  
4. Livraison gratuite ? → `FREE_SHIPPING_AUTHORIZED`  
5. Termes commerciaux / taxes → `COMMERCIAL_TERMS_CONFIGURED`  
6. Compte Cloudflare à son nom (secrets + PII)  
7. Politique si `paid_no_stock` (rembourser vs honorer autrement)
