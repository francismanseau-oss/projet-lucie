# Rapport — optimisation professionnelle Boutique

**Date :** 2026-11-01  
**Périmètre :** photos WebP + cartes CSS · **hors** Stripe / Resend / prix / stocks / règles commerciales  
**Déploiement / push :** aucun

---

## 1. Photos

| Élément | Détail |
|---------|--------|
| PNG originaux | **Intacts** dans `assets/produits/*.png` (57 fichiers, **9,79 Mo**) |
| WebP générés | `assets/produits/webp/*.webp` (57 fichiers, **3,11 Mo**) |
| Gain si navigateur WebP | **−68,2 %** vs PNG (affichage) |
| Dimensions encode | max **800 px** côté long, proportionnel, **sans recadrage** |
| Qualité | WebP q=82 (détail fourrure) |
| Boutique HTML | 66× `<picture>` (WebP + fallback PNG) |
| Chargement | 8 premières : `eager` + `fetchpriority=high` · 58 : `lazy` + `low` + `decoding=async` |

Aucune photo manquante : chaque PNG source a son WebP ; les 66 cartes boutique pointent vers un fichier existant.

Script : `scripts/optimize-produits-webp.py` · patch : `scripts/patch-boutique-webp.mjs`

---

## 2. Apparence cartes

- Titres : hauteur min + clamp 2 lignes  
- Descriptions : clamp 2 lignes  
- Prix (`strong`) : `margin-top: auto` → bas de carte  
- Boutons `.demo-add` : largeur 100 %, `min-height: 44px`, centrés — **alignés** malgré titres de longueurs différentes  
- `<picture>` intégré dans le cadre image existant (`object-fit: cover` inchangé côté CSS)

---

## 3. Mobile (CSS)

Breakpoints couverts / renforcés : **320 · 375 · 390 · 768 · 1440**  
(Grilles 1 / 2 / 3 / 4 colonnes selon largeur — déjà présentes + ajouts 320 / 375 / 1440.)

*Essais appareil réel : toujours via `CHECKLIST-MOBILE-MANUELLE.md` — non déclarés réussis ici.*

---

## 4. Traduction & panier

| Contrôle | Résultat |
|----------|----------|
| `data-fr` / `data-en` sur titres / descriptions | Présents (structure inchangée) |
| `site.js` ajout panier `name_fr` / `name_en` | Intact |
| 66 boutons `.demo-add` + `data-id` / `data-price` | Intact |
| `test-cart-i18n.mjs` | OK |
| Audit site global | 17/17 OK (panier simulé inclus) |

---

## 5. Tests exécutés

| Test | Résultat |
|------|----------|
| `node scripts/verify-boutique-webp.mjs` | OK |
| `node scripts/test-cart-i18n.mjs` | OK |
| `node scripts/audit-site-global.mjs` | 17 OK · 0 warn |

---

## 6. Non modifié

- Prix catalogue · stocks · Stripe · Resend · `availability`  
- Contenu binaire des PNG originaux  
- Push / déploiement  

---

## 7. Suite possible

- Ouvrir la boutique en local (`npx serve -l 8766`) et vérifier visuellement 1–2 filtres + FR/EN + ajout panier  
- Checklist mobile sur iPhone / Android  
