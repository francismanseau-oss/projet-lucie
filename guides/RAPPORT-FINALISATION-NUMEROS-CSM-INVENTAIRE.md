# Rapport final — numérotation, inventaire provisoire, CSM

**Date :** 2026-11-04  
**Périmètre :** local uniquement — **aucun** deploy / push / paiement réel / prix modifié  
**Paiement test 66 articles (7 320 $ CAD)** : déjà validé précédemment via `stripe_retrieve` (hors ce lot)

---

## A. Numérotation

| | |
|--|--|
| Fichier tableau | `docs/NUMEROTATION-PRODUITS-66.md` |
| Machine | `catalog/product-numbers.json` |
| Champ catalogue | `product_number` dans `catalog/products.json` (+ sync Worker) |

Plages : Mitaines 100+, Chapeaux 200+, Pantoufles 300+, Mukluks 400+, Cache-oreilles 500+, Foulards 600+, Semelles 700+.

- **66/66** numéros uniques, **aucun doublon**
- `id` technique **préservé**
- Prix **inchangés**
- Affichage boutique : pastille `N° …` (66 cartes)
- Panier / admin : numéro visible ; recherche admin par N° ou nom

---

## B. Inventaire

| | |
|--|--|
| Provisoire | `inventory/provisional-inventory.json` → **66 × 3 = 198** unités |
| Réel Lucie | `inventory/inventory.json` → `qty_on_hand: null` partout |
| Politique | `provisional_not_for_live_sale: true` |
| Seuil alerte | `min_stock_target: 3` (objectif, pas stock) |

- Admin locale : quantités, provisoire, alertes, historique (déjà en place) + N°
- **Pas** d’activation `AVAILABILITY_CONFIGURED` → stocks provisoires **non vendables** en auto
- À valider avec Lucie : quantités physiques réelles ; éventuels ~20 sur bestsellers (pas attribués ici)

---

## C. Commandes sur mesure (CSM)

| | |
|--|--|
| Code affichage | `{product_number}-CSM` **rouge gras** (CSS `.product-code--csm`) |
| Id ligne panier | `custom:…` (unique) — inchangé |
| Stock | `skip_inventory: true` — **ne retire pas** le stock régulier |
| Mensurations | conservées dans `custom_config` + pending KV + metadata Stripe + courriel Lucie |

Exemple libellé Lucie : `119-CSM — Sur mesure — Mitaines M — renard` + bloc mensurations / cuir / notes.

---

## D. Stripe

| Sujet | État |
|-------|------|
| Mode | TEST uniquement |
| Confirmation | Redirect seule ≠ payé ; serveur `order-status` / `stripe_retrieve` / webhook |
| Session_id | Correctif `serve.json` + normalisation success_url **conservés** |
| Frais livraison | Aucun inventé (Phase A différé) |
| Tests auto ce lot | **63/63** (numéros/CSM + phase-a + simulation + session_id + notify) |
| Scénarios 1–20 (mandat) | Couverture **largement simulée** dans `order-simulation` / phase-a ; **pas** rejoués en E2E Stripe live ce tour |
| Encore simulé | Webhook local `whsec` placeholder ; Resend mock ; décrément stock live **éteint** |
| Double webhook | Idempotence KV déjà testée (mocks) |

---

## E. Administration

| Dispo | Reste |
|-------|--------|
| Inventaire téléphone + auth locale | Écran **commandes** dédié (liste CSM / fabrication) — **pas** livré ce lot |
| N°, famille, provisoire, alertes | Auth production (Cloudflare Access) |
| Historique mouvements mémoire | Persistance D1 audit en prod |

**Pas** d’admin public sans mot de passe.

---

## F. Prochaines étapes

**Terminé localement :** numéros 66, affichage, CSM rouge, mensurations dans pipeline checkout/courriel, inventaire provisoire 198, tests.

**Reste à corriger / bâtir :** UI commandes Lucie ; `stripe listen` + vrai `whsec` ; brancher D1 stocks quand Lucie valide qty ; éventuel restock remboursement.

**Décisions Lucie :** quantités réelles ; bestsellers à 20? ; hybride stock→fabrication ; délais CSM ; feu vert `AVAILABILITY_CONFIGURED`.

**Bloque prod :** livraison/tarifs, stocks validés, Access admin, Resend réel, `PRODUCTION_UNLOCKED`, clés live (interdites ici).

---

## Fichiers clés

- `scripts/assign-product-numbers.mjs` / `scripts/patch-boutique-product-numbers.mjs`
- `product-codes.js`, `worker/src/product-codes.js`
- `docs/NUMEROTATION-PRODUITS-66.md`
- `inventory/provisional-inventory.json`
