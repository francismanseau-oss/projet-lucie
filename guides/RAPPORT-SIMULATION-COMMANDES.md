# Rapport — simulation complète des commandes

**Date :** 2026-11-01  
**Environnement :** local · mocks Node · **aucun** Stripe Dashboard · **aucun** Resend réel  
**Résultat global :** **115/115** tests (`npm run check`) dont **17/17** simulation dédiée (`test/order-simulation.test.mjs`)

---

## Distinction importante

| Type | Qu’est-ce que c’est | Fait ici |
|------|---------------------|----------|
| **Simulation locale (mocks)** | Worker + catalogue + webhooks simulés, zéro réseau Stripe/Resend | **Oui — suite complète** |
| **Essais Stripe Test réels** | Compte Lucie, `sk_test`, Stripe CLI, cartes 4242… | **Non** — comptes / secrets non branchés (volontaire) |
| **Paiement live** | `sk_live` | **Interdit / bloqué** |

---

## Tableau des scénarios

| # | Scénario | Type | Résultat | Notes |
|---|----------|------|----------|-------|
| A1 | Produit standard | Mock local | **OK** | ids, qty, prix serveur |
| A2 | Produit sur mesure | Mock local | **OK** | mesures, Raynaud, cuir, commentaires |
| A3 | Panier mixte | Mock local | **OK** | boutique + custom |
| A4 | Deux perso. même produit | Mock local | **OK** | ids `custom:…` distincts, même SKU |
| B1 | Paiement réussi | Mock local | **OK** | confirmed **après webhook** seulement |
| B2 | Paiement annulé / expiré | Mock local | **OK** | `confirmed=false` |
| B3 | Carte refusée + interrupt | Mock local | **OK** | HTTP erreur contrôlée |
| B4 | Redirect seule ≠ payé | Mock local | **OK** | |
| C1 | Livraison désactivée refusée | Mock local | **OK** | quote Postes/autobus refusées |
| C2 | Checkout sans livraison autorisée | Mock local | **OK** | refus si gates fermées |
| C3 | Stocks officiels non inventés | Mock local | **OK** | `qty_on_hand` toujours `null` |
| C4 | `sk_live` refusé | Mock local | **OK** | Worker test |
| D1 | Courriel Lucie (simulation) | Mock local | **OK** | `mocked=true`, contenu OK |
| D2 | Suggestion Contact mock | Mock local | **OK** | suite `suggestion.test` |
| E1 | Falsification prix | Mock local | **OK** | prix navigateur ignoré |
| E2 | Doublon webhook | Mock local | **OK** | idempotence KV |
| E3 | Signature webhook | Mock local | **OK** | suite phase-a |
| E4 | Erreur réseau Stripe | Mock local | **OK** | |
| F1 | Adresse CA collectée | Mock local | **OK** | `allowed_countries[0]=CA` |
| G1 | Stripe Test réel (4242…) | Stripe Test | **Non exécuté** | nécessite compte Lucie |
| G2 | Resend envoi réel | Resend | **Non exécuté** | mock seulement |

**Échoués (bugs corrigés dans cette passe) :** aucun bug produit.  
Un assert de meta-test (`MOCK_MODE`) a été corrigé dans la suite de simulation (chaîne `"simulated"`).

---

## Données de commande vérifiées

| Donnée | Conservée / vérifiée |
|--------|----------------------|
| Identifiants produits | Oui (SKU + ids custom uniques) |
| Prix serveur uniquement | Oui (catalogue) |
| Quantités | Oui |
| Mensurations / perso. | Oui (lignes + metadata Checkout) |
| Adresse CA | Collection Stripe limitée à **CA** |
| Statut paiement réel | Oui — pas de « payé » sans webhook/retrieve |

---

## Stock et livraison

- Inventaire officiel : **non modifié**, quantités toujours `null`.  
- Méthodes livraison : **toujours désactivées**.  
- Le système **refuse** correctement les devis / checkout « réel » quand les conditions manquent.  
- En Phase A test, `ALLOW_CHECKOUT_WITHOUT_SHIPPING=true` permet seulement les **mocks** locaux (documenté) — ce n’est **pas** une activation production.

---

## Notifications

- Courriel commande Lucie : construit + `notifyLucieOrderPaid` → **`mocked: true`**.  
- Aucun prétendu envoi réel.  
- Messages client Checkout : pages succès/annulation présentes ; confirmation UI liée à `/api/order-status`.

---

## Sécurité

| Contrôle | Statut |
|----------|--------|
| Montants côté serveur | OK |
| Prix falsifiés | Ignorés |
| Doublons webhook | Ignorés (`duplicate`) |
| Signature Stripe | Validée / refus invalide |
| Erreurs réseau / abort / carte | Gérées |
| Clés production | Bloquées en Worker test |

---

## Problèmes détectés

| Problème | Gravité | Action |
|----------|---------|--------|
| Aucun défaut fonctionnel nouveau | — | — |
| Essais Stripe Test / Resend réels absents | Attendu | À faire avec Lucie + Francis plus tard |
| Livraison / stocks non configurés | Attendu | Refus correct ; pas de contournement |

**Corrections locales :** ajout `order-simulation.test.mjs` + inclusion dans `npm run check` (tests uniquement — pas de règles commerciales).

---

## Obstacles avant services réels

1. Inventaire Lucie non rempli  
2. Tarifs livraison non confirmés  
3. Compte Stripe test + CLI non branchés ici  
4. Resend non connecté  
5. Taxes / politiques encore sur fiche Lucie  

---

## Comment rejouer

```bat
cd C:\Projets\projet-lucie\worker
npm run test:simulation
npm run check
```

*Aucun déploiement, push, paiement réel, stock ou tarif inventé.*
