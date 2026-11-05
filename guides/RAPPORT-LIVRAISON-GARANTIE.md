# Rapport — Livraison et garantie / remboursement

**Date :** 2026-11-04  
**Local · Stripe TEST · aucun déploiement · aucun push**

## Ce qui existait déjà

- Config livraison sans tarifs inventés ; **Purolator absent** (confirmé, rien à retirer).
- Paiement unique produits + livraison (`no_second_invoice`).
- Express Bus / autobus : frais seulement après confirmation Lucie.
- Notes internes : échanges OK, pas de remboursement « ordinaire » (sauf loi) — **pas de page publique garantie**.

## Modifications

### Livraison
| Règle | Application |
|-------|-------------|
| Pas de Purolator | Confirmé + `no_purolator` dans la config |
| Postes Canada **18 $ / commande** | `fixed_per_order`, 1800 ¢, pas par produit |
| Délai CP | 2 à 5 jours ouvrables (affiché) |
| Express Bus | Libellé « Express Bus », délai 1–2 j. ouvrables |
| Récupération dépôt | Avis clair avant paiement (`paiement.html`) |
| Zone desservie | QC seulement ; hors QC → méthode masquée / refusée |
| Prix Express Bus | `null` — confirmation Lucie obligatoire |
| Paiement unique | Conservé (pas de 2ᵉ facture) |

Fichiers : `shipping/shipping-config.json`, `worker/src/shipping-config.json`, `shipping.js`, `shipping-quote-service.js`, `paiement.html` (+ `docs/`).

### Garantie / remboursement
- Nouvelle page : `politique-garantie.html` (+ `docs/`)
- Garantie commerciale **3 mois** dès réception (défauts de fabrication)
- Procédure : contacter Lucie + photos → examen
- Usure / mauvais usage ≠ défaut
- Solutions : réparation, remplacement ou remboursement
- Frais de livraison aller-retour **raisonnables** si défaut confirmé
- Droits légaux QC/Canada **non limités**
- Lien depuis Contact

## Tests

`shipping-single-payment` + `order-simulation` + `inventory-shipping` + `orders-admin` :

| Exécutés | Réussis | Échoués | Ignorés |
|----------|---------|---------|---------|
| **54** | **54** | **0** | **0** |

## Reste hors périmètre

- Déploiement / domaine / Stripe LIVE  
- Grille réelle Express Bus (toujours confirmation Lucie)  
- API refund Stripe automatisée  

— Virtuose
