# Rapport — simplification UI inventaire (téléphone)

**Date :** 2026-11-01  
**Contexte :** outil local déjà prêt (7 tests) → amélioration usage Lucie  
**Non touché :** ventes, prix, Stripe, Resend, livraison, deploy, push

---

## Corrections / améliorations

| Besoin | Réalisation |
|--------|-------------|
| Petit écran | Cartes photo + texte ; boutons min. ~48px ; colonnes empilées &lt;380px ; safe-area |
| Photo | Enrichissement catalogue + service `/assets/…` ; lazy-load |
| Nom | Titre visible ; **pas de SKU** à l’écran |
| Quantité | Nombre ou **« À confirmer »** |
| Objectif min. | Affiché sur chaque carte |
| `+1 fabriqué` | Gros bouton + confirmation |
| `Corriger la quantité` | Dialogue simple (qty + objectif) + confirmation |
| Alertes stock bas | Bandeau + badge « Stock bas » + filtre « Voir seulement les alertes » |
| Recherche | Par **nom** (pas d’ID technique) |
| Filtre catégorie | Liste déroulante (Mitaines, Chapeaux, …) |
| Mots simples | Historique en français (« Fabrication ajoutée », etc.) |
| Auth | Inchangée : mot de passe env, session, API inventaire protégée |
| Demo ≠ réel | `demo-inventory.json` régénéré avec `image` ; `qty_on_hand` réel toujours `null` |

### Fichiers principaux

- `inventory/admin/public/index.html` / `admin.css` / `admin.js`
- `inventory/admin/lib/ui-helpers.js`
- `inventory/admin/server.mjs` (photos + `/lib/`)
- `worker/test/inventory-admin.test.mjs` (tests étendus)

---

## Tests

```bat
cd /d C:\Projets\projet-lucie\worker
npm run test:inventory-admin
```

**Résultat : 12/12 OK**

Couverture ajoutée / conservée :

- Connexion / refus mauvais mot de passe / **déconnexion** (session invalidée)
- Modifications quantité, +fabrication, objectif min., historique
- Alertes sous seuil ; `null` ≠ alerte
- Recherche nom + filtre catégorie + alertes seulement
- Markup mobile (boutons, media query) ; absence jargon SKU/D1/Stripe dans HTML
- Aucun mot de passe hardcodé dans les fichiers admin
- Séparation demo / réel

---

## Comment essayer

```bat
cd /d C:\Projets\projet-lucie
set INVENTORY_ADMIN_PASSWORD=********
node inventory\admin\server.mjs
```

Ouvrir `http://127.0.0.1:8791/` (idéalement fenêtre étroite ou téléphone sur le même Wi‑Fi **uniquement si** bind adapté — défaut `127.0.0.1` = PC seulement).

---

## Toujours en attente (hors mandat)

- Quantités réelles Lucie  
- Hybride fabrication / délais  
- Auth hébergée (Access) + D1 persistant  
- Activation boutique  
