# Décisions Lucie — état consolidé

Une seule lecture pour savoir ce qui est **réglé**, ce qui **reste à Lucie**, et ce qui se fait **avec Francis** (technique).  
Fiche à remplir pour Lucie : [VALIDATION-FINALE-LUCIE.md](./VALIDATION-FINALE-LUCIE.md)

Rien n’est activé en production : pas de paiement réel, pas d’envoi automatique, pas de livraison en ligne.

---

## A. Déjà confirmé par Lucie

| Décision | Détail |
|----------|--------|
| Territoire de vente | **Canada seulement** |
| Frais de livraison | **Payés par le client** |
| Modes de livraison envisagés | **Postes Canada** et **autobus au Québec** (détails / tarifs encore ouverts) |
| Après-vente | **Échanges acceptés** ; **pas de remboursement ordinaire**, sous réserve des **obligations légales** |
| Option Raynaud (mitaines) | **Sans supplément** |
| Matières | **Cuir noir** ; **fourrure recyclée** dont la **couleur peut varier** |
| Mesures mitaines | **Tour de main** + **longueur de la main** seulement |

**Prix :** les montants affichés au catalogue **ne sont pas** traités comme nouvellement approuvés ici — ils restent **à vérifier** avec Lucie (voir fiche finale).

---

## B. À confirmer par Lucie

Questions encore ouvertes uniquement (détail et cases : [VALIDATION-FINALE-LUCIE.md](./VALIDATION-FINALE-LUCIE.md)).

1. **Stocks des 66 produits** — déjà fabriqué ? quantité réelle ? sur demande ?  
2. **Prix catalogue** — vérification produit par produit (ou par catégorie)  
3. **Livraison — détails** — colis, vrais frais Postes Canada, compagnies d’autobus, ramassage, gratuité éventuelle  
4. **Délais** de fabrication sur demande  
5. **Si une pièce n’est plus disponible après paiement** — échange / contact (aligné avec la politique d’échanges ; pas de remboursement « ordinaire » inventé)  
6. **Taxes** — inscription TPS/TVQ et façon d’afficher les prix (**à vérifier avant activation** ; l’absence d’inscription connue ≠ dispense fiscale automatique)  
7. **Illustrations de mesures** hors mitaines (provisoires)  
8. **Essais sur téléphone** (iPhone + Android)

Inventaire pratique : [INVENTAIRE-VALIDATION-LUCIE.csv](./INVENTAIRE-VALIDATION-LUCIE.csv)

---

## C. Technique — à réaliser avec Francis

Lucie n’a **pas** à comprendre ni remplir ces points seule. Francis / Virtuose guident ; Lucie garde ses comptes et ses secrets.

| Sujet | Qui |
|-------|-----|
| Compte Stripe (essais), coller les clés **elle-même** si besoin | Lucie + guide Francis |
| Webhooks, Worker, stockage des commandes | Francis / Virtuose |
| Compte Resend, domaine, coller la clé **elle-même** | Lucie + guide Francis |
| Brancher / activer une méthode de livraison **après** tarifs réels | Francis / Virtuose (mandat explicite) |
| Déploiement, Cloudflare, tests automatisés | Francis / Virtuose |
| Ne jamais envoyer de clés secrètes par message | Tout le monde |

Docs techniques (pour Francis) : `GUIDE-MISE-EN-SERVICE.md`, `STRIPE-PREPARATION.md`, `RESEND-CONNEXION.md`, `LIVRAISON-VALIDATION-LUCIE.md`

---

## Ordre suggéré

1. Fiche [VALIDATION-FINALE-LUCIE.md](./VALIDATION-FINALE-LUCIE.md) + CSV inventaire  
2. Mesurer colis + noter vrais frais de livraison  
3. Essais téléphone  
4. Avec Francis : essais Stripe / Resend  
5. Seulement ensuite : ouverture réelle  

*Aucun prix, stock ou tarif n’a été inventé ni modifié dans ce document.*
