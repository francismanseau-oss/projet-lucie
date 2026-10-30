# Stocks, réservations et livraison — architecture locale

Aucun stock fictif, aucun tarif inventé, aucun paiement réel, aucun deploy.

## Inventaire (66 articles)

| Fichier | Rôle |
|---------|------|
| `inventory/inventory.json` | Source Worker — `qty_on_hand: null`, `fulfillment_type: pending_lucie` |
| `inventory/INVENTAIRE-LUCIE.csv` | Tableau pour Lucie (Excel) |
| `inventory/README-LUCIE.md` | Instructions Lucie |
| `inventory/generate-from-catalog.mjs` | Régénère le gabarit depuis le catalogue (sans toucher aux prix) |

### Types

- **unique_stock** — stock limité / pièce unique → réservation atomique
- **made_to_order** — sur commande → pas de décrément `qty_on_hand`
- **pending_lucie** — défaut → **non vendable** tant que Lucie n’a pas confirmé

## Réservations (anti-survente)

```
checkout → reserve (held, TTL 30 min) → paiement Stripe
  ├─ webhook paid → commit (qty_on_hand -= n, qty_reserved -= n)
  ├─ annulation / TTL → release (qty_reserved -= n)
```

**Stockage** : Cloudflare **D1** (SQLite transactionnel) ou `MemoryTx` en tests.  
**Pas KV** pour l’inventaire (voir `worker/src/store/d1-notes.md`).  
KV `ORDERS` reste pour l’idempotence webhooks Stripe.

Code : `worker/src/inventory.js`  
Migration : `worker/migrations/0001_inventory.sql`

Activation vente réelle stocks : seulement quand  
`AVAILABILITY_CONFIGURED=true` **et** lignes `lucie_confirmed` — pas encore branché en dur sur chaque checkout test (Phase A contact), afin de ne pas inventer de stock pour tester Stripe.

## Livraison

| Fichier | Rôle |
|---------|------|
| `shipping/shipping-config.json` | Méthodes, `rates_source: unset`, fees `null` |
| `worker/src/shipping.js` | Quotes refusées sans cote réelle / validation Lucie |

- **Postes Canada** : adresse CA (CP + province) + poids colis Lucie + cote injectée (API Rating ou grille Lucie) — sinon **403**
- **Autobus Québec** : `requires_manual_validation` — frais seulement si Lucie fournit `manualBusFeeCadCents` pour la commande
- **Gate** : `SHIPPING_CONFIGURED=false` → aucun `shipping_options` Stripe

## Tests

```bat
cd worker
npm test
```

Inclut `test/inventory-shipping.test.mjs` (réservations concurrentes, commit, expire, quotes refusées).

## Décisions Lucie (bloquantes pour la suite)

1. Classer chaque article : unique vs sur commande  
2. Saisir les **vraies** quantités (ou laisser vide)  
3. Mesurer poids/dimensions colis types  
4. Choisir source Postes Canada (grille manuelle vs API)  
5. Règles / fourchettes autobus QC (validation manuelle par commande)  
6. Activer ou non le ramassage  
7. Feu vert pour `AVAILABILITY_CONFIGURED` / `SHIPPING_CONFIGURED`
