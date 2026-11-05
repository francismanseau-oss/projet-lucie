# Rapport — navigation par catégorie (sur mesure)

**Date :** 2026-11-01  
**Objectif :** catégorie → modèles → mesures (jamais les 66 d’un coup ; pas de taille S/M/L/XL imposée).

---

## Changements UX

1. **Départ :** 7 cartes catégories seulement (0 produit).  
2. **Clic catégorie** → modèles de cette catégorie + scroll auto.  
3. **« Changer de catégorie »** → retour aux 7 cartes.  
4. Bouton **Personnaliser** sur chaque modèle.  
5. Libellés sans tokens **S / M / L / XL / M-L / L-XL** (affichage sur mesure + panier / récap).  
6. Boutique standard : **inchangée**.

---

## Ambiguïté signalée (prix non arbitraires)

Après retrait des tailles du libellé, **1 groupe** partage le même nom affiché :

| Affiché | SKU conservés | Prix |
|---------|---------------|------|
| Mitaines — renard | `mitaines-m-renard` et `mitaines-m-l-renard` | **140 $** chacun |

Même prix → pas de conflit tarifaire. Les deux SKU restent sélectionnables ; l’UI ajoute un rappel descriptif / réf. pour les distinguer. **Aucun prix inventé ni fusionné.**

---

## Tests E2E (Playwright, `:8766`)

| Contrôle | FR | EN |
|----------|----|----|
| 7 catégories, 0 produit au départ | OK | OK |
| Mitaines → 27 modèles | OK | OK |
| Pas de token taille dans le 1er nom | OK | OK |
| Mesures + illustration | OK | OK |
| Panier (réf. + 40 $) | OK | OK |
| Changer de catégorie → 7 cats, 0 tuile | OK | OK |

`node scripts/e2e-sur-mesure-browser.mjs` → `ok: true`

---

## Fichiers

- `sur-mesure-app.js`  
- `creations-personnalisees.html` / `.css`  
- `scripts/e2e-sur-mesure-browser.mjs`  
- `scripts/analyze-size-ambiguity.mjs`

**Non modifié :** Stripe, stocks, `products.json` prix, Boutique HTML.
