# Rapport — Admin commandes + préparation livraison

**Date :** 2026-11-04  
**Local uniquement** — aucun deploy / push / prix modifié / transporteur activé / frais inventés

---

## Analyse préalable (existant réutilisé)

| Élément | État avant |
|---------|------------|
| Paiement Stripe TEST + `order-status` | Opérationnel |
| KV `pending:` / `order:` | Worker (pas d’UI Lucie) |
| Admin inventaire + auth | Opérationnel (`8791`) |
| `shipping-config.json` | Méthodes off, tarifs null |
| Numéros + CSM | Opérationnels |

---

## A. Opérationnel (local)

### Commandes (UI)
- URL : `http://127.0.0.1:8791/orders.html` (auth = même mot de passe inventaire)
- Liste : n° session, date, montant, paiement vérifié, source (Stripe TEST / jeu d’essai)
- Détail : N° produits, **CSM rouge gras**, mensurations / options / commentaires
- Filtres : toutes, payées, à fabriquer, à préparer, expédiées, annulées
- Recherche : commande, produit, client
- Statuts fabrication/préparation modifiables **sans** toucher au paiement Stripe
- Historique des changements
- Import : « Actualiser depuis Stripe TEST » (sessions `paid` seulement)
- Fichier vide au départ : `orders/admin-orders.json` — **aucune commande fictive présentée comme réelle**

### Livraison (préparation)
- Config enrichie `shipping/shipping-config.json` v2 :
  - **Postes Canada** : couverture CA/QC, profil colis, suivi, API **non** configurée, `enabled: false`
  - **Autobus QC** : champs transporteur / dépôt / ramassage / référence, frais manuels Lucie, **vérif conditions transporteur** exigée, `enabled: false`
- Sur chaque commande admin : mode, statut frais (**défaut « Livraison à confirmer »**), suivi, champs autobus
- Règles code : pas de montant si `a_confirmer` ; accord client requis avant `facture`

### Tests
Fichier `worker/test/orders-admin.test.mjs` (+ règles shipping).

---

## B. Simulé / partiel

| Sujet | Note |
|-------|------|
| Mensurations CSM à l’import Stripe | OK si metadata Stripe présentes ; sinon message « détail limité » — **pas inventées** |
| Resend / courriel | Toujours mock hors webhook réel |
| Webhook local | `whsec` placeholder — confirmation via retrieve / import TEST |
| Stocks réels | Toujours désactivés |

---

## C. Bloqué / non activé

- `SHIPPING_CONFIGURED` reste false  
- Aucune API Postes Canada  
- Aucun transporteur autobus activé  
- Aucune facturation automatique des frais  
- Pas de Cloudflare Access prod  
- Pas de push / deploy  

---

## D. Lancer

```bat
set INVENTORY_ADMIN_PASSWORD=********
node inventory\admin\server.mjs
```

Puis : http://127.0.0.1:8791/orders.html  

Après un paiement TEST : bouton **Actualiser depuis Stripe TEST**.

---

## E. Prochaines étapes Lucie

1. Valider colis types (poids/dimensions) + devis Postes Canada réels  
2. Lister compagnies d’autobus + conditions d’acceptation des colis  
3. Décider comment le client accepte les frais (courriel / 2ᵉ paiement)  
4. Puis seulement : activer méthodes + grilles  
