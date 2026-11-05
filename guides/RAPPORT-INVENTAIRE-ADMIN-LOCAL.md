# Rapport — admin inventaire local (préparation)

**Date :** 2026-11-01  
**Périmètre :** préparation locale uniquement  
**Suite UI :** voir aussi `RAPPORT-INVENTAIRE-UI-SIMPLIFIEE.md` (cartes photo, filtres, boutons simples)  
**Non fait :** deploy, push, prix, Stripe, activation vente, fabrication sur commande / délais Lucie

---

## Réalisé

| Fonction | Détail |
|----------|--------|
| Objectif min. **3** / référence | Champ `min_stock_target` (défaut 3), **configurable** par produit |
| Séparation objectif ≠ stock | `qty_on_hand` réel reste **`null`** sur les 66 lignes ; le 3 n’y est **jamais** copié |
| Données DEMO séparées | `inventory/admin/demo/demo-inventory.json` (`data_mode: demo` + avertissement) |
| Interface téléphone | `inventory/admin/public/` — liste 66, saisie qty, +fabriqué, corriger, min, alertes, historique |
| Auth | Mot de passe env `INVENTORY_ADMIN_PASSWORD` (≥8), session Bearer, bind `127.0.0.1` |
| Confirmation | API refuse sans `confirm: true` ; UI `window.confirm` |
| Historique | Journal mémoire des changements (action, avant/après, acteur) |
| Alerte sous seuil | Seulement si `qty_on_hand` **connue** et `< min_stock_target` ; `null` ≠ alerte |
| Migration D1 future | `worker/migrations/0002_inventory_admin.sql` (non appliquée en prod) |
| Tests | 7/7 OK — `worker/test/inventory-admin.test.mjs` |
| Boutique | Inchangée : pas d’activation achat ; `availability=contact` conservé |

### Fichiers principaux

- `worker/src/inventory-admin-core.js`
- `inventory/admin/` (server, UI, store, auth, demo, README)
- `inventory/inventory.json` — `min_stock_target: 3`, `qty_on_hand: null`
- `docs/PLAN-INVENTAIRE-HYBRIDE-LUCIE.md` (contexte hybride / délais toujours en attente Lucie)

### Lancer en local

Voir `inventory/admin/README.md`.

---

## Points restant à confirmer (Lucie / Francis)

1. **Quantités réelles** par référence (comptage) — seules valeurs autorisées dans `qty_on_hand`.
2. **Objectifs minimum** autres que 3 pour certains produits (enfants / bestsellers ?).
3. **Fabrication sur commande** + délais affichés (hybride stock→MTO) — toujours **en attente Lucie**.
4. Auth production (ex. Cloudflare Access) avant tout hébergement hors localhost.
5. Persistance D1 + import des saisies Lucie (aujourd’hui : mémoire locale / demo).
6. Décrément auto après paiement Stripe — seulement après stocks + livraison + gates validés.
7. Lien éventuel sur-mesure ↔ stock boutique.

---

## Non modifié (volontaire)

- Prix catalogue / Stripe / Resend  
- Checkout / `AVAILABILITY_CONFIGURED`  
- Pas de déploiement ni push  
- Pas d’URL admin publique  
