# Rapport SEO — Les Fourrures Boréales (préparation Google gratuit)

**Date :** 2026-11-04  
**Domaine prévu :** `lesfourruresboreales.ca`  
**Statut domaine :** **pas encore acheté** (libre ; Lucie l’achètera sous peu)  
**Indexation Google :** **non activée** — ne pas soumettre le sitemap tant que le site n’est pas publié officiellement sur ce domaine.  
**Contraintes respectées :** aucun deploy, aucun push, prix / 66 produits non modifiés, Stripe / commandes / CSM / livraisons non perturbés.

---

## 1. Analyse réelle du dépôt (avant corrections)

| Constat | Détail |
|---------|--------|
| Pages HTML publiques | Accueil, Boutique, Créations personnalisées, Nos créations, Lucie, Contact, Sur mesure (redirige) |
| Fiches produit individuelles | **Absentes** — les 66 articles étaient seulement des cartes dans `boutique.html` |
| `robots.txt` / `sitemap.xml` | **Absents** |
| Canonical / Open Graph / JSON-LD | Absents ou très limités |
| Pages panier / paiement / confirmation | Publiques côté fichiers (à exclure de l’index) |

**Découvrabilité Google des 66 produits :**  
Sans URL propre par produit, Google voyait surtout **une** page boutique. Les cartes étaient en HTML statique (bon pour la page boutique), mais **pas** indexables une par une.

**Solution retenue (sans casser la boutique) :**  
- Ancres stables `id="produit-{id}"` sur chaque carte boutique  
- **66 pages** `produits/{id}.html` (contenu catalogue réel)  
- **7 pages** catégories  
- Liens croisés boutique ↔ catégorie ↔ fiche  

---

## 2. Pages optimisées

### Publiques (indexables une fois le site en ligne)

| Page | Titre / meta | H1 | Notes |
|------|----------------|----|-------|
| Accueil | Unique + mots-clés naturels | La chaleur du Nord. | Liens catégories ; Organization JSON-LD |
| Boutique | Mitaines, chapeaux, pantoufles, mukluks | BOUTIQUE | Intro SEO + nav catégories + ItemList 66 URL |
| Créations personnalisées | Fourrure sur mesure | Créations personnalisées | Texte enrichi |
| Nos créations | Créations portées | (existant) | Meta / canonical / OG |
| Lucie | Artisane | (existant) | Meta / canonical / OG |
| Contact | Contact | Contact | Meta / canonical / OG |
| 7 catégories | Titres dédiés | Nom de catégorie | BreadcrumbList |
| 66 produits | Nom + catégorie | Nom produit | Product + BreadcrumbList (prix catalogue, dispo limitée — pas d’avis inventés) |

### Exclues de l’indexation (`noindex, nofollow` + `robots.txt`)

- Panier, paiement, confirmation / annulation Stripe  
- `inventory/`, `orders/`, `worker/`, `docs/`, `scripts/`, `seo/`, `log/`  

**Rappel sécurité :** `robots.txt` et `noindex` **ne remplacent pas** l’authentification admin (déjà en place sur le serveur local 8791).

---

## 3. Technique préparée

| Fichier / élément | Rôle |
|-------------------|------|
| `robots.txt` | Allow public ; Disallow privés ; Sitemap futur |
| `sitemap.xml` | **79 URL** préparées pour `https://lesfourruresboreales.ca/…` |
| `seo/config.json` | Origine future + `indexing_active: false` |
| `scripts/generate-seo.mjs` | Régénération locale (`node scripts/generate-seo.mjs`) |
| Canonical + OG + Twitter | Pages publiques et privées (noindex) |
| `serve.json` | Rewrites `/produits/…` et `/categories/…` |

Expressions utilisées **naturellement** (sans bourrage) : Fourrures Boréales, mitaines en fourrure recyclée, chapeaux en fourrure, pantoufles en fourrure, mukluks, créations artisanales québécoises, articles en fourrure sur mesure.

---

## 4. Problèmes détectés → corrections

| Problème | Correction |
|----------|------------|
| Pas de fiches produit crawlables | 66 pages `produits/` + ancres boutique |
| Pas de pages catégories | 7 pages `categories/` |
| Pas de sitemap / robots | Créés (soumission **après** publication) |
| Meta / partage faibles | Titres, descriptions, OG, canonical |
| Risque d’indexer panier / paiement | `noindex` + Disallow |
| Domaine pas acheté | Config + commentaires : **ne pas** activer Search Console maintenant |

---

## 5. Ce qui reste après l’achat du domaine

1. Lucie achète **lesfourruresboreales.ca** (registrar de son choix).  
2. Brancher le DNS vers l’hébergement choisi (Cloudflare Pages, etc.).  
3. Publier le site **officiellement** (HTTPS).  
4. Vérifier que `https://lesfourruresboreales.ca/robots.txt` et `/sitemap.xml` répondent.  
5. Ouvrir [Google Search Console](https://search.google.com/search-console) → propriété **Domaine** `lesfourruresboreales.ca` (méthode DNS).  
6. Soumettre le sitemap : `https://lesfourruresboreales.ca/sitemap.xml`.  
7. Demander l’indexation de l’accueil (et éventuellement boutique) via « Inspection d’URL ».  
8. Surveiller Couverture / Pages dans les jours suivants (gratuit).  
9. Ne **pas** pointer Search Console vers une URL temporaire GitHub / local.

---

## 6. Étapes Search Console (rappel gratuit)

1. search.google.com/search-console → Ajouter une propriété → **Domaine**.  
2. Copier l’enregistrement DNS TXT fourni chez le registrar.  
3. Attendre validation.  
4. Sitemaps → ajouter `sitemap.xml`.  
5. Inspection d’URL → URL canonique du site → **Demander une indexation**.  
6. Patience : l’indexation n’est pas instantanée.

**Aucun compte Search Console n’a été créé ni validé dans cette passe** (domaine pas encore à Lucie / site pas public sur ce domaine).

---

## 7. Régénérer le SEO en local

Après un changement de catalogue (sans changer les prix ici) :

```bat
cd /d C:\Projets\projet-lucie
node scripts\generate-seo.mjs
```

---

## 8. Hors périmètre (inchangé)

- Déploiement / push GitHub  
- Modification des 66 prix ou contenus catalogue  
- Activation Stripe live  
- Indexation Google **avant** publication officielle sur le domaine acheté  
