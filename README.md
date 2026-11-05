# Les Fourrures Boréales

Site web de création artisanale en fourrure recyclée et cuir d’agneau.

## Publication GitHub Pages (boutique publique seulement)

Le dossier **`docs/`** est le contenu prévu pour GitHub Pages (Settings → Pages → Deploy from branch → Folder **`/docs`**).

- Contient uniquement : pages boutique, 66 fiches, 7 catégories, images, CSS/JS publics, SEO.
- **N’inclut pas** : `worker/`, `inventory/`, `shipping/`, `orders/`, `guides/`, `scripts/`, secrets.

Préparer / régénérer en local (aucun push automatique) :

```bat
cd /d C:\Projets\projet-lucie
node scripts\build-pages-site.mjs
node scripts\check-publish-safety.mjs
```

Tester localement le site public :

```bat
npx --yes serve docs -p 5500
```

## Guides techniques (hors Pages)

→ **[guides/GUIDE-MISE-EN-SERVICE.md](guides/GUIDE-MISE-EN-SERVICE.md)**  
→ **[guides/GITHUB-PAGES-SECURISE.md](guides/GITHUB-PAGES-SECURISE.md)**

Inventaire Lucie : `inventory/INVENTAIRE-LUCIE.csv`  
Admin local (jamais via Pages) : `inventory/admin/`

## Sécurité

- Secrets Stripe / Resend / Cloudflare : uniquement `.dev.vars` local (gitignoré) ou Cloudflare Secrets.
- Jamais dans le JavaScript public ni dans `docs/`.
- Contrôle auto : `node scripts/check-publish-safety.mjs`
