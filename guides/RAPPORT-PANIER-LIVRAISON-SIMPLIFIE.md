# Rapport — panier et livraison simplifiés

**Date :** 2026-11-04  
**Décision Lucie :** le client ne choisit pas le transporteur ; Lucie assigne Express Bus (si dépôt accessible) ou Postes Canada. Forfait **18 $ / commande**.

## Client

| Élément | Statut |
|--------|--------|
| « Livraison du panier complet : 18,00 $ » | Panier + paiement |
| Sous-total / Livraison 18 $ / Total à payer | Affiché |
| Notice Express Bus ou Postes Canada + confirmation avant expédition | Affiché |
| Dépôt jamais imposé sans accord préalable | Mention paiement + policy config |
| Textes « une seule fois » / « un seul paiement » | Retirés |
| Stripe TEST clairement indiqué | Conservé |

## Technique

- Config `shipping-config.json` **v5** : méthode client `flat_order` (1800 ¢) ; `bus_quebec` / `canada_post` = `customer_selectable: false`
- Checkout : un seul `shipping_options` Stripe + lignes articles — **pas de double facturation**
- Pages : `panier.html`, `paiement.html` (+ copies `docs/`)

## Tests

54/54 OK (`shipping-single-payment`, `order-simulation`, `inventory-shipping`, `orders-admin`).

## Hors périmètre

Aucun déploiement, aucun push GitHub.
