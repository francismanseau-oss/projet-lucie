# Rapport — Paiement unique + bon de commande Lucie

**Date :** 2026-11-04  
**Environnement :** local · Stripe **TEST** · aucun deploy · aucun push  
**Décision :** un seul Checkout = produits + frais de livraison **réels** ; jamais de 2ᵉ facture ; jamais de tarif inventé.

---

## 1. Ce qui fonctionne réellement (code local)

| Élément | État |
|---------|------|
| Choix livraison client (Postes Canada / autobus QC) | Oui — `paiement.html` + `GET /api/shipping-methods` |
| `POST /api/shipping-quote` | Oui — cote auto **ou** `quote_required` + hold |
| Jeton `quote_token` → un seul `/api/checkout` avec `shipping_options` | Oui |
| Hold Lucie → `confirm` → `resume` → même paiement unique | Oui |
| Grille Postes Canada Lucie (si remplie + enabled) | Oui (lookup CP / province / DEFAULT) |
| API Rating Postes Canada | **Stub / porte** seulement — pas d’appel tant que credentials absents |
| Autobus QC | Hold Lucie obligatoire tant qu’aucune grille réelle |
| N° permanent `LFB-YYYYMMDD-XXXX` | Oui |
| Archive serveur KV `order:{cs_…}` (indépendante du courriel) | Oui |
| Bon de commande HTML/texte (identification, client, articles, CSM, livraison, totaux) | Oui |
| Envoi **après** webhook payé seulement | Oui |
| Anti-doublon notify (`notify_status`) + resend `/api/orders/resend-bon` | Oui |
| Taxes | Libellé « non configurées — à valider » — **aucun montant inventé** |
| Tests automatisés | **159/159** OK (`npm run check`) |

---

## 2. Ce qui est encore simulé

| Élément | Note |
|---------|------|
| Envoi Resend | **Mock** si pas de `RESEND_API_KEY` / `SUGGESTION_MOCK=true` |
| Stripe Checkout réel | Nécessite Worker + `sk_test` locaux (non exécuté dans ce rapport) |
| API Postes Canada live | Non branchée (`api.configured: false`) |
| Frais autobus | Toujours confirmation Lucie (pas d’API publique unifiée) |
| Admin local holds | Confirm via `POST /api/shipping-hold/confirm` (Worker) — UI admin à brancher plus tard si besoin |
| Parcours test `phase_a_deferred` | Conservé **uniquement** pour mocks Worker test (hors boutique paiement unique) |

---

## 3. Ce qu’il reste à configurer (bloquants métier)

1. **Colis types** Lucie (poids / dimensions) — fiche validation encore vide.  
2. **Postes Canada** : grille de devis réels **ou** compte + clés Rating (jamais dans Git).  
3. **Autobus** : compagnies, points, règles ; montants par devis Lucie.  
4. **Taxes** TPS/TVQ — décision Lucie.  
5. **Resend** : domaine + `RESEND_API_KEY` + from vérifié.  
6. **KV ORDERS** + Worker local pour holds / archives.  
7. Ne **pas** mettre `SHIPPING_CONFIGURED=true` tant qu’aucune cote réelle n’est prête (le jeton Lucie suffit pour un paiement unique confirmé).

---

## 4. Exemple complet de bon de commande (données fictives)

```
BON DE COMMANDE — Les Fourrures Boréales

N° commande : LFB-20261104-0042
Date / heure : 2026-11-04T16:30:00.000Z
Référence Stripe : cs_test_exempleFictif123
Statut paiement : paid

CLIENT
  Nom : Camille Bouchard
  Courriel : camille.exemple@courriel.test
  Téléphone : 418-555-0100
  Adresse / destination : 12 rue des Érables, Québec QC G1A 1A1, CA

ARTICLES
- 12-CSM — Sur mesure — Mitaines × 1 @ 160,00 $ CAD = 160,00 $ CAD
    Code CSM : 12-CSM
    Réf. boutique : mitaines-classiques
    Unité : cm
    Mensurations : hand_length : 18 cm · hand_circ : 20 cm
    Raynaud : oui
    Cuir / matière : noir
    Instructions : Doublure plus chaude
- N° 7 — Foulard loup × 1 @ 95,00 $ CAD = 95,00 $ CAD

LIVRAISON
  Méthode : Postes Canada
  Frais payés : 18,50 $ CAD
  Destination : 12 rue des Érables, Québec QC G1A 1A1, CA
  Suivi : non encore attribué
  Statut initial : a_preparer

RÉSUMÉ FINANCIER
  Sous-total produits : 255,00 $ CAD
  Livraison : 18,50 $ CAD
  Taxes : non configurées — à valider avec Lucie
  TOTAL PAYÉ : 273,50 $ CAD
```

*(Exemple pour approbation de présentation — aucune vente réelle.)*

---

## 5. Étapes restantes pour que Lucie reçoive automatiquement ses commandes

1. Remplir colis + devis Postes Canada (ou ouvrir compte Rating).  
2. Décider le processus autobus (délai de confirmation Lucie acceptable pour le client).  
3. Créer compte Resend, vérifier le domaine / from, coller `RESEND_API_KEY` dans `.dev.vars` (pas dans le chat).  
4. Lancer Worker local (`wrangler dev`) + KV ORDERS preview.  
5. Essai Stripe **TEST** (carte 4242…) : cote → Checkout unique → webhook → courriel mock puis réel.  
6. Approuver le modèle de bon (section 4) ; ajuster wording si besoin.  
7. Seulement ensuite : déploiement (hors de cette passe).

---

## Fichiers principaux touchés

- `worker/src/shipping-quote-service.js` (nouveau)  
- `worker/src/order-numbers.js`, `order-archive.js` (nouveaux)  
- `worker/src/shipping.js`, `index.js`, `lucie-notify.js`, `logic.js`  
- `shipping/shipping-config.json` (+ miroir Worker)  
- `paiement.html`  
- `worker/test/shipping-single-payment.test.mjs`  
- Ce rapport  

**Inchangé :** 66 produits, prix, numérotation, inventaire provisoire, pas de deploy, pas de push.
