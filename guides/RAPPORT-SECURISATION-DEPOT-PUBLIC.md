# Rapport — sécurisation dépôt public / GitHub Pages

**Date :** 2026-11-04  
**Dépôt :** `francismanseau-oss/projet-lucie` (reste **public**)  
**Fait :** préparation **locale** seulement — **aucun push**, **aucun déploiement**

---

## 1. Modifications effectuées

| Action | Détail |
|--------|--------|
| `.gitignore` renforcé | Secrets, `.dev.vars`, `orders/admin-orders.json`, env admin |
| Docs techniques | Déplacés `docs/` → **`guides/`** (conservés, non effacés) |
| Site Pages | Dossier **`docs/`** = miroir **boutique publique uniquement** |
| Scripts | `build-pages-site.mjs` + `check-publish-safety.mjs` |
| SEO | Chemins relatifs (fiches / catégories) pour Pages projet |
| Exemples MDP | Remplacés par `********` dans README admin |
| README racine | Instructions Pages `/docs` |

---

## 2. Ce qui pourra être publié en toute sécurité (dossier `docs/`)

Après réglage GitHub Pages → Folder **`/docs`** :

- Accueil, boutique, créations personnalisées / sur mesure, Lucie, contact  
- Panier, paiement, confirmations Stripe (pages **noindex**)  
- **66** fiches `produits/`  
- **7** catégories  
- Images / CSS / JS **publics**  
- `robots.txt` + `sitemap.xml` (**79** URL)  

**Contrôle local :** `check-publish-safety.mjs` → **OK**  
**Test HTTP local (`serve docs`) :** pages publiques **200** ; `worker/`, `inventory/`, `guides/` → **404**

---

## 3. Ce qui ne doit PAS être servi par Pages

| Dossier / fichier | Raison |
|-------------------|--------|
| `worker/` | Code serveur, logique Stripe |
| `inventory/` | Inventaire + admin |
| `shipping/` | Config livraison interne |
| `orders/` | Commandes / données clients |
| `guides/` | Guides techniques / secrets procédure |
| `scripts/` | Scripts build / serveur |
| `seo/config.json` | Config interne |
| `.dev.vars` | Clés (déjà gitignoré) |

L’admin inventaire/commandes reste **uniquement** en environnement local / Worker protégé.

---

## 4. Secrets

- Aucune clé Stripe / Resend / Cloudflare dans le JS public de `docs/`  
- `checkout-config.js` : URL API seulement (pas de secret)  
- Fichier local `worker/.dev.vars` : **présent sur le PC**, **gitignoré**, non inclus dans `docs/`  
- Contrôle auto **bloque** une publication `docs/` contenant des motifs de secrets

---

## 5. Étape manuelle encore nécessaire (toi / Lucie, plus tard)

Aujourd’hui sur GitHub, Pages est encore sur la **racine** `/`.  
Quand un push sera **autorisé** :

1. Pousser les changements (sur ton ordre explicite)  
2. Settings → Pages → Folder = **`/docs`**  
3. Relancer `build` + `check-publish-safety` avant chaque publication  

Tant que Pages = `/`, les dossiers techniques du dépôt restent exposés via Pages.

---

## 6. Commandes locales utiles

```bat
node scripts\build-pages-site.mjs
node scripts\check-publish-safety.mjs
npx --yes serve docs -l 5505
```

---

## 7. Non fait (conforme au mandat)

- Pas de dépôt privé  
- Pas de suppression des fichiers de travail  
- Pas de changement des 66 prix / produits  
- Pas de push / deploy  
- Stripe TEST non perturbé  
