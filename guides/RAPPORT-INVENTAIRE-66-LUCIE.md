# Rapport — Inventaire des 66 produits (Lucie)

**Date :** 2026-11-04  
**Contraintes respectées :** Stripe TEST seulement · aucun paiement réel · aucun déploiement · aucun push GitHub · numéros et prix inchangés.

---

## 1. Ce qui existait déjà

- Catalogue **66 produits** avec numéros permanents (100–700).
- Fichier provisoire `inventory/provisional-inventory.json` : **66 × 3 = 198** exemplaires.
- Inventaire officiel `inventory/inventory.json` : quantités à `null` (pas encore validées pour la vente).
- Admin local `inventory/admin/` : connexion par mot de passe, liste produits, photos, recherche, historique.
- Worker Stripe : déduction de stock **uniquement** après paiement confirmé, si `AVAILABILITY_CONFIGURED=true` + store D1/MemoryTx ; **CSM** = `skip_inventory` (ne touche pas le stock standard).
- Site public séparé dans `docs/` (GitHub Pages) — **pas** l’admin inventaire.

## 2. Ce qui a été ajouté ou corrigé

- Mode **provisional** par défaut : charge les 198 exemplaires provisoires.
- **Persistance privée** : `inventory/admin/data/lucie-inventory.json` (gitignoré) + historique.
- Interface Lucie simplifiée : gros boutons **+** / **−**, saisie directe, **Enregistrer**, toast de confirmation en français.
- Badge **Rupture de stock** quand la quantité est 0.
- API `/adjust` + enregistrement automatique après chaque changement.
- Script `inventory/admin/demarrer-inventaire.bat`.
- Tests étendus (provisoire 198, +/−, persist, UI).

**Non changé :** prix, numéros, mensurations CSM, vente en ligne (toujours fermée).

## 3. Ce qui fonctionne en local

| Point | État |
|-------|------|
| 66 produits = catalogue = inventaire = 66 fiches SEO `docs/produits/` | OK |
| Seed 198 exemplaires provisoires | OK |
| Connexion mot de passe + session | OK |
| + / − / saisie / Enregistrer + toast | OK |
| Historique (date, produit, avant → après) | OK |
| Fichier privé local (hors Pages) | OK |
| Vente en ligne selon ces quantités | **Non** — volontairement désactivée |
| Deduction Stripe après paiement (Worker, tests) | Logique déjà en place ; inactive tant que `AVAILABILITY_CONFIGURED≠true` |

## 4. Ce qui nécessite encore une configuration

1. **Mot de passe admin** sur le PC de Lucie : variable `INVENTORY_ADMIN_PASSWORD` (≥ 8 caractères).
2. **Validation Lucie** des quantités réelles (compter / corriger dans l’interface).
3. **Décision explicite** avant d’activer la vente : ne pas traiter les 198 comme vérifiés physiquement.
4. Pour la boutique en ligne plus tard : Worker Cloudflare + D1 + `AVAILABILITY_CONFIGURED=true` + secrets Stripe **TEST** d’abord — **pas** fait dans ce livrable (aucun déploiement).

## 5. Comment Lucie accède à son inventaire

1. Sur le PC (Francis prépare une fois le mot de passe) :
   ```bat
   set INVENTORY_ADMIN_PASSWORD=********
   C:\Projets\projet-lucie\inventory\admin\demarrer-inventaire.bat
   ```
2. Ouvrir le navigateur : **http://127.0.0.1:8791/**
3. Entrer le mot de passe.
4. Chercher un produit (nom ou N°) → **+** / **−** ou taper le chiffre → **Enregistrer**.
5. Un message vert confirme l’enregistrement.
6. **Quitter** en fermant la fenêtre noire (Ctrl+C) ou le bouton Quitter.

Lucie n’a **jamais** besoin de GitHub, Cursor ni de fichiers JSON.

## 6. Comment confirmer les 198 exemplaires avant activation

1. Lucie parcourt les 66 produits et ajuste les quantités réelles.
2. Quand elle est d’accord, Francis note la validation (oral / écrit) — le fichier local garde `lucie_validated_for_sale: false` jusqu’à décision métier.
3. **Ensuite seulement**, et sur mandat explicite : activer le Worker (`AVAILABILITY_CONFIGURED=true`) avec store transactionnel.
4. Tant que ce n’est pas fait : la boutique reste en mode contact ; les 198 restent **provisoires**.

---

## Rappel sécurité

- Admin = PC local + mot de passe serveur.
- Pas de stocks réels dans GitHub Pages / dépôt public.
- Pas de clés secrètes dans le navigateur.
- Stripe = **TEST** uniquement pour l’instant.

— Virtuose
