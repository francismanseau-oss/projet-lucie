# Audit tailles & formats — 66 produits boutique

**Date :** 2026-11-05
**Périmètre :** `catalog/products.json` (lecture seule) — aucun changement de code tailles.
**Illustrations mensurations :** conservées telles quelles (travail précédent non touché).

## Constat central

Aujourd’hui, **chaque taille = un produit séparé** (SKU). Il n’y a **aucun champ** `sizes` / `variants` / `formats` dans le catalogue. La boutique n’offre **pas de sélecteur** de taille : le client choisit la carte produit dont le nom contient déjà la taille (ex. « Mitaines homme M-L — coyote »).

- Produits : **66**
- Champ variante/taille dans le JSON : **non**
- Clés schéma : `active, availability, category, description_fr, id, image, name_fr, price_cad, price_cad_cents, product_number`

## Répartition par système de taille

- **Lettres (S / M / L / M-L / L-XL…)** : 26
- **Tranche d’âge / mois** : 19
- **Pointure (chaussures / semelles)** : 11
- **Public indiqué (dame/homme/bébé…) **sans** taille** : 8
- **Aucune taille ni public dans le nom** : 2

## Par catégorie

### cache-oreilles (4)

- Lettres présentes : M
- Tranches âge : 10-14, 8-10-12
- Systèmes : {'tranche_age': 3, 'lettre_SML': 1}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 500 | Cache-oreilles ado 10-14 — renard et vison | tranche_age | 10-14 | 60 |
| 501 | Cache-oreilles dame M — vison et lapin | lettre_SML | M | 60 |
| 502 | Cache-oreilles enfant 8-10-12 — coyote | tranche_age | 8-10-12 | 60 |
| 503 | Cache-oreilles enfant 8-10-12 — renard | tranche_age | 8-10-12 | 60 |

### chapeaux (14)

- Lettres présentes : L-XL, M, M-L
- Tranches âge : 8-10
- Systèmes : {'tranche_age': 1, 'lettre_SML': 11, 'audience_sans_taille': 1, 'aucune_taille': 1}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 200 | Chapeau — vison recyclée | aucune_taille | — | 80 |
| 201 | Chapeau dame — vison et renard | audience_sans_taille | — | 120 |
| 202 | Chapeau dame M-L — coyote | lettre_SML | M-L | 120 |
| 203 | Chapeau dame M-L — fourrure recyclée | lettre_SML | M-L | 120 |
| 204 | Chapeau dame M-L — renard argenté | lettre_SML | M-L | 120 |
| 205 | Chapeau dame M-L — renard norvégien | lettre_SML | M-L | 120 |
| 206 | Chapeau dame M-L — renard roux | lettre_SML | M-L | 120 |
| 207 | Chapeau dame M-L — vison | lettre_SML | M-L | 120 |
| 208 | Chapeau fille 8-10 — renard | tranche_age | 8-10 | 60 |
| 209 | Chapeau homme L-XL — raton | lettre_SML | L-XL | 180 |
| 210 | Chapeau homme M — castor | lettre_SML | M | 180 |
| 211 | Chapeau homme M-L — coyote | lettre_SML | M-L | 180 |
| 212 | Chapeau homme M-L — renard argenté | lettre_SML | M-L | 180 |
| 213 | Chapeau homme M-L — renard roux | lettre_SML | M-L | 180 |

### foulards (2)

- Systèmes : {'audience_sans_taille': 2}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 600 | Foulard dame — vison | audience_sans_taille | — | 60 |
| 601 | Foulard dame — vison et renard | audience_sans_taille | — | 60 |

### mitaines (27)

- Lettres présentes : M, M-L, S
- Tranches âge : 10-12, 2-4 ans, 4-6, 6-8, 8-10, 8-24 mois
- Systèmes : {'tranche_age': 9, 'audience_sans_taille': 3, 'lettre_SML': 14, 'aucune_taille': 1}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 100 | Mitaines 8-10 — vison (fermeture éclair) | tranche_age | 8-10 | 80 |
| 101 | Mitaines bébé sans pouces — vison (fermeture éclair) | audience_sans_taille | — | 40 |
| 102 | Mitaines bébé sans pouces 8-24 mois — castor | tranche_age | 8-24 mois | 40 |
| 103 | Mitaines bébé sans pouces 8-24 mois — vison | tranche_age | 8-24 mois | 40 |
| 104 | Mitaines dame — renard roux | audience_sans_taille | — | 140 |
| 105 | Mitaines dame — vison et renard | audience_sans_taille | — | 160 |
| 106 | Mitaines dame M — renard | lettre_SML | M | 140 |
| 107 | Mitaines dame M-L — chat sauvage | lettre_SML | M-L | 140 |
| 108 | Mitaines dame M-L — fourrure recyclée | lettre_SML | M-L | 140 |
| 109 | Mitaines enfant 10-12 — mouton rasé | tranche_age | 10-12 | 80 |
| 110 | Mitaines enfant 2-4 ans — castor (fermeture éclair) | tranche_age | 2-4 ans | 60 |
| 111 | Mitaines enfant 4-6 — vison (fermeture éclair) | tranche_age | 4-6 | 60 |
| 112 | Mitaines enfant 6-8 — vison (fermeture éclair) | tranche_age | 6-8 | 60 |
| 113 | Mitaines enfant 8-10 — chat sauvage | tranche_age | 8-10 | 80 |
| 114 | Mitaines fille 8-10 — renard | tranche_age | 8-10 | 40 |
| 115 | Mitaines homme M-L — castor | lettre_SML | M-L | 180 |
| 116 | Mitaines homme M-L — coyote | lettre_SML | M-L | 180 |
| 117 | Mitaines homme M-L — renard roux | lettre_SML | M-L | 180 |
| 118 | Mitaines longues dame M — vison et renard | lettre_SML | M | 160 |
| 119 | Mitaines M — renard | lettre_SML | M | 140 |
| 120 | Mitaines M-L — renard | lettre_SML | M-L | 140 |
| 121 | Mitaines M-L — vison et chat sauvage | lettre_SML | M-L | 160 |
| 122 | Mitaines M-L — vison et renard | lettre_SML | M-L | 160 |
| 123 | Mitaines motoneige M — renard argenté | lettre_SML | M | 160 |
| 124 | Mitaines motoneige M-L — renard norvégien | lettre_SML | M-L | 180 |
| 125 | Mitaines Small — vison | lettre_SML | S | 140 |
| 126 | Mitaines style Inuit — coyote | aucune_taille | — | 140 |

### mukluks (7)

- Tranches âge : 7-18 mois, 8-18 mois, 8-24 mois
- Pointures : 8-9
- Systèmes : {'tranche_age': 4, 'audience_sans_taille': 2, 'pointure': 1}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 400 | Mukluks adulte mobilité réduite 8-9 — vison et renard | pointure | 8-9 | 140 |
| 401 | Mukluks bébé — vison (fermeture éclair) | audience_sans_taille | — | 120 |
| 402 | Mukluks bébé 7-18 mois — vison | tranche_age | 7-18 mois | 120 |
| 403 | Mukluks bébé 8-18 mois — vison | tranche_age | 8-18 mois | 120 |
| 404 | Mukluks bébé 8-24 mois — castor | tranche_age | 8-24 mois | 120 |
| 405 | Mukluks bébé 8-24 mois — vison | tranche_age | 8-24 mois | 120 |
| 406 | Mukluks bébé à 18 mois — coyote | audience_sans_taille | — | 120 |

### pantoufles (11)

- Tranches âge : 0-7 mois, 13-1, 2-3, 5-12 mois
- Pointures : 10-11, 13-1, 2-3, 7-8, 8-9, 9-10
- Systèmes : {'tranche_age': 2, 'pointure': 9}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 300 | Pantoufles bébé 0-7 mois — fourrure recyclée | tranche_age | 0-7 mois | 40 |
| 301 | Pantoufles bébé 5-12 mois — fourrure recyclée | tranche_age | 5-12 mois | 40 |
| 302 | Pantoufles dame 7-8 — mouton rasé et chat sauvage | pointure | 7-8 | 120 |
| 303 | Pantoufles dame 8-9 — vison et coyote | pointure | 8-9 | 120 |
| 304 | Pantoufles dame 8-9 — vison et renard | pointure | 8-9 | 120 |
| 305 | Pantoufles dame 9-10 — vison et renard | pointure | 9-10 | 120 |
| 306 | Pantoufles enfant 13-1 — vison et coyote | pointure | 13-1 | 60 |
| 307 | Pantoufles enfant 2-3 — mouton rasé et coyote | pointure | 2-3 | 60 |
| 308 | Pantoufles enfant 2-3 — renard | pointure | 2-3 | 60 |
| 309 | Pantoufles homme 10-11 — chat sauvage | pointure | 10-11 | 120 |
| 310 | Pantoufles homme 10-11 — mouton et renard roux | pointure | 10-11 | 120 |

### semelles (1)

- Pointures : 5-12
- Systèmes : {'pointure': 1}

| N° | Nom | Système | Tag taille | Prix |
|---:|-----|---------|------------|-----:|
| 700 | Semelles fourrure recyclée — pointures 5 à 12 | pointure | 5-12 | 20 |

## Familles multi-SKU (même modèle, plusieurs formats déjà en catalogue)

**5 familles** seulement ont plus d’un SKU après retrait de la taille du nom. Ailleurs, **un seul format** existe.

### mitaines | Mitaines enfant — vison (fermeture éclair)

- #111 — **4-6** — Mitaines enfant 4-6 — vison (fermeture éclair) (60 $)
- #112 — **6-8** — Mitaines enfant 6-8 — vison (fermeture éclair) (60 $)

### mitaines | Mitaines — renard

- #119 — **M** — Mitaines M — renard (140 $)
- #120 — **M-L** — Mitaines M-L — renard (140 $)

### mukluks | Mukluks bébé — vison

- #402 — **7-18 mois** — Mukluks bébé 7-18 mois — vison (120 $)
- #403 — **8-18 mois** — Mukluks bébé 8-18 mois — vison (120 $)
- #405 — **8-24 mois** — Mukluks bébé 8-24 mois — vison (120 $)

### pantoufles | Pantoufles bébé — fourrure recyclée

- #300 — **0-7 mois** — Pantoufles bébé 0-7 mois — fourrure recyclée (40 $)
- #301 — **5-12 mois** — Pantoufles bébé 5-12 mois — fourrure recyclée (40 $)

### pantoufles | Pantoufles dame — vison et renard

- #304 — **8-9** — Pantoufles dame 8-9 — vison et renard (120 $)
- #305 — **9-10** — Pantoufles dame 9-10 — vison et renard (120 $)

## Produits sans taille choisissable (nom sans format clair)

**10 produits** n’ont ni lettre, ni tranche d’âge, ni pointure dans le nom :

- #101 [mitaines] Mitaines bébé sans pouces — vison (fermeture éclair) — _audience_sans_taille_
- #104 [mitaines] Mitaines dame — renard roux — _audience_sans_taille_
- #105 [mitaines] Mitaines dame — vison et renard — _audience_sans_taille_
- #126 [mitaines] Mitaines style Inuit — coyote — _aucune_taille_
- #200 [chapeaux] Chapeau — vison recyclée — _aucune_taille_
- #201 [chapeaux] Chapeau dame — vison et renard — _audience_sans_taille_
- #401 [mukluks] Mukluks bébé — vison (fermeture éclair) — _audience_sans_taille_
- #406 [mukluks] Mukluks bébé à 18 mois — coyote — _audience_sans_taille_
- #600 [foulards] Foulard dame — vison — _audience_sans_taille_
- #601 [foulards] Foulard dame — vison et renard — _audience_sans_taille_

## Tailles manquantes (lecture catalogue)

Le catalogue ne définit **pas** une grille cible (ex. S/M/L/XL pour toutes les mitaines). On ne peut donc lister que ce qui **existe déjà**, et ce qui est **évident comme trou** à l’intérieur des familles multi-SKU ou par catégorie.

### Trous visibles dans les familles multi-SKU

- **Mitaines — renard** : M (#119) et M-L (#120) existent ; **pas de S, L, XL** séparés.
- **Mitaines dame — renard** : M (#106) existe à côté de « Mitaines dame — renard roux » (#104) sans lettre — **incohérent** (modèle proche, une seule taille M).
- **Pantoufles dame — vison et renard** : 8-9 (#304) et 9-10 (#305) ; **pas de 6-7, 7-8, 10-11** pour ce modèle.
- **Pantoufles enfant — … 2-3** : deux fourrures (mouton/coyote vs renard), **une seule pointure 2-3**.

### Couverture lettres observée (tous produits)
- Lettres / gammes présentes quelque part : **L-XL, M, M-L, S**
- **Absentes du catalogue entier** (jamais utilisées) : `S-M`, `L` seul, `XL` seul, `XXL` (selon extraction).
- Beaucoup de modèles n’offrent **qu’un seul** tag (souvent `M-L`) → pas de vrai choix client.

### Couverture pointures observée
- Pointures / plages présentes : **10-11, 13-1, 2-3, 5-12, 7-8, 8-9, 9-10**
- Semelles (#700) : plage **5 à 12** dans le **nom**, mais **un seul SKU** — pas de choix de pointure au panier (à clarifier avec Lucie : une paire multi-pointures ou sélection manquante).

## Modifications nécessaires (proposition — pas encore codées)

Pour que le client **choisisse son format** sur une fiche / carte :

1. **Décision métier (Lucie)** — pour chaque famille : quelles tailles offrir (S/M/L/XL, M-L seulement, pointures, âges).
2. **Modèle données** — ajouter des variantes (ex. `sizes: ["S","M","L"]`) **ou** regrouper les SKU actuels sous un produit parent.
3. **UI boutique** — sélecteur taille obligatoire avant « Ajouter au panier ».
4. **Panier / Stripe / worker** — transmettre la taille choisie (metadata + e-mail Lucie).
5. **Stock / inventaire** — lier la quantité à la variante, pas seulement au modèle.
6. **Sur-mesure** — rester le fallback quand la taille n’existe pas (déjà en place côté créations personnalisées).

## Ne pas faire avant autorisation

- Pas de fusion/suppression de SKU.
- Pas de nouveau champ catalogue.
- Pas de sélecteur UI.
- Pas de déploiement / push.

_Données brutes : `AUDIT-TAILLES-FORMATS-66.json` · script : `scripts/_audit-tailles-66.py`_