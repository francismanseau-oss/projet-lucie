# GitHub Pages sécurisé — Les Fourrures Boréales

**Dépôt :** reste public `francismanseau-oss/projet-lucie`  
**Pages :** uniquement le dossier `docs/` (boutique), pas la racine du dépôt.

## Réglage GitHub (à faire manuellement plus tard — pas maintenant)

1. Repo → **Settings** → **Pages**
2. Source : **Deploy from a branch**
3. Branch : `main` (ou celle utilisée)
4. Folder : **`/docs`** (pas `/` racine)
5. Enregistrer

Tant que la source Pages est `/` (racine), les dossiers techniques du dépôt restent exposés via Pages.

## Contenu de `docs/`

Généré par `node scripts/build-pages-site.mjs` :

| Inclus | Exclus |
|--------|--------|
| Accueil, boutique, créations, contact, Lucie | `worker/` |
| Panier / paiement / confirmations (noindex) | `inventory/` |
| 66 fiches `produits/` | `shipping/` |
| 7 `categories/` | `orders/` |
| `assets/`, CSS, JS public | `guides/`, `scripts/` |
| `robots.txt`, `sitemap.xml` | `.dev.vars`, secrets |

## Avant tout push futur

```bat
node scripts\build-pages-site.mjs
node scripts\check-publish-safety.mjs
```

Si le contrôle échoue → **ne pas pousser**.

## Admin et commandes

Restent **locaux / serveur protégé** (`inventory/admin`, Worker Cloudflare).  
Jamais servis par GitHub Pages.
