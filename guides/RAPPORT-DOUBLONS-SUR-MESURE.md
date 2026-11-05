# Rapport préalable — doublons visuels sur mesure

**Date :** 2026-11-02  
**Statut :** analyse faite — **aucun regroupement appliqué**  
**Décision Francis (2026-11-01) :** ne **pas** fusionner `mitaines-m-renard` / `mitaines-m-l-renard` tant que Lucie n’a pas tranché (photos différentes). Point **clos techniquement** ; suivi dans `VALIDATION-FINALE-LUCIE.md` §2b.  
**Catalogue :** 66 produits actifs, prix / Boutique / SKU **inchangés**

---

## Synthèse

| Indicateur | Valeur |
|------------|--------|
| Produits analysés | 66 |
| Groupes potentiels (même libellé sans taille) | **1** |
| SKU concernés par ces groupes | 2 |
| Groupes regroupables sans ambiguïté de prix/desc/image | **0** |
| Cartes en moins si ces groupes étaient fusionnés (indicatif) | 0 |
| Groupes proches (décision Lucie) | 1 |
| Autres décisions Lucie | 0 |
| À garder séparés (prix différents) | 0 |

---

## Méthode

1. Retirer du nom FR les tokens de taille : `S`, `M`, `L`, `XL`, `M-L`, `L-XL`, etc.  
2. Grouper par **catégorie + nom sans taille**.  
3. Comparer **prix**, **description**, **image**.  
4. **Ne jamais** fusionner automatiquement sur une simple ressemblance de nom.

---

## Cas regroupables sans ambiguïté de prix (après validation Lucie)

*Même prix, même description, même image ; seuls les tokens de taille diffèrent.  
⚠️ Même après validation visuelle, il restera à décider **quel SKU** envoyer au panier / Worker (interdit de choisir arbitrairement sans Lucie).*

_Aucun groupe dans cette catégorie strict._

## Cas proches — décision Lucie requise

### mitaines — Mitaines — renard

| SKU | Nom | Prix | Image |
|-----|-----|------|-------|
| `mitaines-m-renard` | Mitaines M — renard | 140,00 $ | `assets/produits/mitaines-renard-recyclee-m.png` |
| `mitaines-m-l-renard` | Mitaines M-L — renard | 140,00 $ | `assets/produits/mitaines-renard-recyclee-ml.png` |

**Pourquoi :** Même prix et description, mais images différentes — vérifier si c’est le même modèle.

## Autres cas — décision Lucie / ne pas fusionner auto

_Aucun._

---

## Tous les groupes (liste complète)

- **mitaines** / Mitaines — renard — 2 SKU — prix [140,00 $] — `proche_decision_lucie`

---

## Prochaine étape (après validation Francis / Lucie)

1. Valider quels groupes peuvent être **une seule carte** visuelle.  
2. Pour chaque groupe validé : définir le **SKU panier** (ou règle explicite).  
3. Seulement alors appliquer le regroupement dans le configurateur.

JSON détaillé : `docs/ANALYSE-DOUBLONS-SUR-MESURE.json`
