# Commander sur mesure — rapport (2026-11-01)

## Objectif

Configurateur branché sur le **catalogue Boutique unique** (`catalog/products.json`, 66 SKU / 66 prix). Aucun second catalogue de prix. Aucun supplément inventé.

## Audit données

| Contrôle | Résultat |
|----------|----------|
| Produits actifs Boutique | **66** |
| Prix `price_cad_cents` entiers | **66 / 66** |
| Catégories | mitaines, pantoufles, chapeaux, cache-oreilles, foulards, semelles, mukluks |
| Source prix sur-mesure (client) | `officialPrice(products.json)` |
| Source prix sur-mesure (Worker) | même `products.json` embarqué |
| Config mesures / options | `catalog/sur-mesure-config.json` (pas de prix) |

**Fourrure / taille / âge :** déjà encodés dans chaque SKU Boutique (nom + id). Choisir le produit = choisir ces attributs. Pas de dropdowns de prix séparés.

**Cuir :** noir seulement (note policy + panier / courriel Lucie).

**Raynaud :** option gratuite mitaines uniquement (`price_addon_cad_cents: 0`).

## UI livrée

Page : `creations-personnalisees.html#mesure`

1. Filtres catégorie + tuiles photo / nom / prix officiel  
2. Personnaliser (Raynaud si mitaines, commentaires, note cuir/fourrure)  
3. Mensurations cm ↔ po (aucune unité présélectionnée)  
4. Récap + « Ajouter au panier » seulement si valide  

Pas de grand panneau « Prix à configurer » sans produit.

## Panier / Stripe

- Ligne `custom:<sku>:<uid>` avec `custom_config` (mesures, cm, Raynaud, commentaires, cuir, `product_id`).
- Checkout envoie la config ; Worker recalcule le prix depuis Boutique.
- Metadata Stripe + courriel Lucie : SKU, mesures, Raynaud, cuir, commentaires.
- **Pas** de paiement live, **pas** de modification de secrets, **pas** de déploiement.

## Décisions à valider avec Lucie

Toutes les grilles de mesures sont marquées `awaiting_lucie_validation: true` :

| Catégorie | Champs proposés | Question Lucie |
|-----------|-----------------|----------------|
| Mitaines | tour de main + longueur main (**validé Lucie 2026-11-01**) | Majeur / poignet / pouce retirés |
| Pantoufles / mukluks | longueur + largeur pied | OK ? Pointure en plus ? |
| Chapeaux / cache-oreilles | tour de tête | OK ? |
| Semelles | longueur (+ largeur optionnelle) | OK ? |
| Foulards | aucun champ obligatoire | Quelles mesures / longueurs utiles ? |

Autres points Lucie :

1. Tous les 66 SKU sont-ils commandables en sur-mesure, ou certains doivent être « contact seulement » (non configurables) ?
2. Texte d’aide mesure : formulations exactes ?
3. Option Raynaud : wording final + s’applique vraiment à toutes les mitaines ?

## Fichiers touchés (principaux)

- `catalog/sur-mesure-config.json` (nouveau)
- `sur-mesure-pricing.js`, `sur-mesure-app.js`
- `creations-personnalisees.html` / `.css`
- `panier.html`, `paiement.html`
- `worker/src/logic.js`, `sur-mesure-pricing.js`, `sur-mesure-config.json`, `index.js`, `lucie-notify.js`
- `worker/test/sur-mesure.test.mjs`

## Tests

Voir exécution Node `worker/test/sur-mesure.test.mjs` + vérif HTTP locale catalogue.
