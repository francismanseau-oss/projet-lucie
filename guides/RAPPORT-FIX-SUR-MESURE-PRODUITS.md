# Rapport — produits absents du configurateur sur mesure

**Date :** 2026-11-01  
**URL testée :** `http://127.0.0.1:8766/creations-personnalisees.html#mesure`  
**Navigateur :** Chromium (Playwright) + captures PNG

---

## Cause exacte

**Sur l’état actuel du code + serveur `:8766`, les 66 produits s’affichent bien** (constaté à l’écran, captures `_e2e-sur-mesure-step1-fr.png` / `_diag-sur-mesure-8766.png`).

Le catalogue `catalog/products.json` répond **200**, `BOREALES_SUR_MESURE` est présent, **66** tuiles `.sm-product-tile` sont dans le DOM et visibles.

### Failles qui pouvaient donner l’impression « aucun produit »

1. **Messages d’erreur uniquement dans `#sm-msg` (étape 4, souvent masquée)**  
   Si le catalogue ne chargeait pas (`file://`, JSON 404, JS pricing manquant), la grille restait **vide** sans message visible à l’étape 1.

2. **Sorties silencieuses** dans `sur-mesure-app.js` :  
   `if (!api) return;` et `if (!els.products || !els.add) return;` — aucun feedback à l’écran.

3. **UX mobile** : après « Commander », beaucoup de contenu (retour, titre, progression, filtres) avant la grille — risque de croire qu’il n’y a rien si on ne scrolle pas.

Ce n’était **pas** un second catalogue vide, ni un filtre qui excluait les 66 SKU.

---

## Corrections faites

| Fichier | Changement |
|---------|------------|
| `sur-mesure-app.js` | Statut visible `#sm-products-status` (chargement / erreur / vide) ; plus de return silencieux ; catégorie sur la tuile ; logs console si fetch KO |
| `creations-personnalisees.html` | Élément `#sm-products-status` |
| `creations-personnalisees.css` | Styles statut + catégorie |
| `creations-personnalisees.js` | Scroll vers l’étape 1 à l’ouverture `#mesure` |

Aucun prix / Stripe / Resend / livraison modifié. Pas de 2ᵉ catalogue.

---

## Produits affichés

| Filtre | Nombre |
|--------|--------|
| Tous | **66** |
| Mitaines (essai E2E) | 27 |

**Exclusion :** aucune règle d’éligibilité séparée — **tous les produits `active` du catalogue Boutique** sont proposés au sur-mesure (prix = `price_cad_cents` du même JSON).

---

## Essais navigateur (obligatoires)

| Étape | FR | EN |
|-------|----|----|
| Ouverture `#mesure` | 66 tuiles visibles | 66 tuiles visibles |
| Filtre mitaines | 27 | 27 |
| Sélection produit | OK | OK |
| Illustration mesures | `mitaines-mesures-fr.webp` | `mitaines-mesures-en.webp` |
| Saisie 2 mesures + cm | OK | OK |
| Ajout panier | OK — prix **40 $** (catalogue) | OK (2ᵉ ligne panier) |

Script : `node scripts/e2e-sur-mesure-browser.mjs`  
Captures : `docs/_e2e-sur-mesure-step1-fr.png`, `docs/_e2e-sur-mesure-step1-en.png`

---

## Point signalé (pas inventé)

`catalog/products.json` n’a souvent **pas** de `name_en` : en anglais, le configurateur affiche le **nom FR** en secours (comportement déjà prévu). La Boutique, elle, a les `data-en` dans le HTML. Pas de traduction inventée dans ce correctif.

---

## Si Francis ne voit toujours rien

1. Confirmer l’URL avec **`#mesure`** (ou clic **Commander**).  
2. Serveur HTTP depuis `C:\Projets\projet-lucie` (pas `file://`).  
3. Rechargement forcé (Ctrl+F5).  
4. Lire le bandeau sous les filtres (nouveau statut d’erreur / chargement).
