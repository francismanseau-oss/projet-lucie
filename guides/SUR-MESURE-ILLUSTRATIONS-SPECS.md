# Illustrations bilingues des mensurations — spécifications

**Statut :** emplacements + mapping prêts · **0 / 14** fichiers graphiques livrés  
**Validation :** Lucie doit approuver les emplacements de mesure **avant publication**  
**Déploiement / push :** non autorisé sans validation

## Inventaire (14 fichiers)

| # | Catégorie | Fichier FR | Fichier EN | Statut |
|---|-----------|------------|------------|--------|
| 1–2 | Chapeaux / Hats | `chapeaux-mesures-fr.webp` | `chapeaux-mesures-en.webp` | **À produire** |
| 3–4 | Mitaines / Mittens | `mitaines-mesures-fr.webp` | `mitaines-mesures-en.webp` | **Prêt (vérifié)** |
| 5–6 | Foulards / Scarves | `foulards-mesures-fr.webp` | `foulards-mesures-en.webp` | **À produire** |
| 7–8 | Cache-oreilles / Earmuffs | `cache-oreilles-mesures-fr.webp` | `cache-oreilles-mesures-en.webp` | **À produire** |
| 9–10 | Semelles / Insoles | `semelles-mesures-fr.webp` | `semelles-mesures-en.webp` | **À produire** |
| 11–12 | Mukluks | `mukluks-mesures-fr.webp` | `mukluks-mesures-en.webp` | **À produire** |
| 13–14 | Pantoufles / Slippers | `pantoufles-mesures-fr.webp` | `pantoufles-mesures-en.webp` | **À produire** |

Dossier cible : `assets/mesures/`  
Manifeste technique : `catalog/sur-mesure-illustrations.json`

## Spécifications graphiques (commune aux 14)

| Paramètre | Valeur |
|-----------|--------|
| Format | WebP (export final) ; source Figma/Illustrator/SVG OK |
| Canvas | **1200 × 900 px** (ratio 4:3) |
| Fond | `#FCFAf7` (boutique) |
| Encre | `#25201D` |
| Accent / flèches / pastilles | `#965035` |
| Traits secondaires | `#CBB29E` |
| Texte FR / EN | Langue de la variante uniquement (pas de bilingue sur la même image) |
| Taille minimale texte | ≥ **28 px** sur le canvas 1200 (lisible mobile) |
| Pastilles numérotées | Ø ≥ **48 px**, chiffre blanc gras |
| Style | Schéma pédagogique élégant, professionnel, **même grille** pour les 14 |
| Anatomie | Silhouettes simplifiées correctes (main, pied, tête) — pas de dessin trompeur |

Éléments requis sur chaque image (sauf foulards tant qu’il n’y a pas de champs) :

1. Silhouette du membre / tête concerné  
2. Lignes de mesure + flèches  
3. Pastilles **1, 2, 3…** alignées sur les champs formulaire  
4. Légende courte à côté de chaque numéro (FR ou EN selon fichier)

## Correspondance numéros ↔ champs formulaire

### Mitaines — validé Lucie 2026-11-01
| N° | `field_id` | FR | EN |
|----|------------|----|----|
| 1 | `hand_circumference` | Tour de main (paume, sans pouce) | Hand circumference (palm, no thumb) |
| 2 | `hand_length` | Longueur de la main (pli poignet → majeur) | Hand length (wrist crease → middle fingertip) |

**Retiré :** longueur du majeur · tour de poignet · longueur du pouce.  
Fichiers : `mitaines-mesures-fr.webp` / `mitaines-mesures-en.webp` — **vérifiés** 1200×900, monolingues, `asset_status: pret`.  
Les 12 autres fichiers restent **à produire** (`a_produire`).

### Pantoufles / Mukluks
| N° | `field_id` | FR | EN |
|----|------------|----|----|
| 1 | `foot_length` | Longueur du pied | Foot length |
| 2 | `foot_width` | Largeur du pied | Foot width |

### Semelles
| N° | `field_id` | FR | EN | Note |
|----|------------|----|----|------|
| 1 | `foot_length` | Longueur du pied | Foot length | requis |
| 2 | `foot_width` | Largeur du pied | Foot width | facultatif |

### Chapeaux / Cache-oreilles
| N° | `field_id` | FR | EN |
|----|------------|----|----|
| 1 | `head_circumference` | Tour de tête | Head circumference |

### Foulards
Aucun numéro tant que Lucie n’a pas défini de champs. Illustration = rappel pédagogique + renvoi aux commentaires.

## Comportement site (déjà câblé)

- Produit choisi → illustration de la **catégorie**  
- Basculer FR ↔ EN → même catégorie, fichier langue  
- Mesures saisies **identiques** (indépendantes de la langue)  
- Fichier absent → encart **« Illustration à produire »** (pas d’image trompeuse)  
- `alt` bilingue depuis le manifeste  

## Checklist Lucie

- [ ] Emplacements de mesure corrects pour chaque catégorie  
- [ ] Textes des pastilles (1, 2, 3…)  
- [ ] Foulards : garder sans mesure ou définir des champs  
- [ ] Approuver les 14 fichiers avant mise en ligne  

## Livraison des fichiers

Déposer les WebP dans `assets/mesures/` avec les noms exacts du tableau.  
Ensuite passer `asset_status` à `"pret"` dans `catalog/sur-mesure-illustrations.json` pour chaque catégorie validée.
