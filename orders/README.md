# Commandes admin (local)

Interface Lucie : **Commandes** + **Inventaire** (même mot de passe).

```bat
cd /d C:\Projets\projet-lucie
set INVENTORY_ADMIN_PASSWORD=********
node inventory\admin\server.mjs
```

- Inventaire : http://127.0.0.1:8791/  
- Commandes : http://127.0.0.1:8791/orders.html  

## Données

| Fichier | Rôle |
|---------|------|
| `orders/admin-orders.json` | Ops Lucie (statuts fabrication, livraison) — démarre **vide** |
| Import Stripe TEST | Bouton « Actualiser depuis Stripe TEST » — sessions **paid** seulement |

Les jeux d’essai (`source: test_fixture`) sont étiquetés clairement — jamais présentés comme ventes réelles.

## Livraison

Voir `shipping/shipping-config.json` : Postes Canada + autobus QC **sélectionnables** pour devis, **non auto-facturés** tant que tarifs absents. Paiement boutique = **un seul** Checkout (produits + livraison confirmée).

Flux : `paiement.html` → `/api/shipping-quote` → (hold Lucie si besoin) → `quote_token` → `/api/checkout` → webhook → bon `LFB-…`.

Détail : `docs/RAPPORT-PAIEMENT-UNIQUE-BON-COMMANDE.md`.
