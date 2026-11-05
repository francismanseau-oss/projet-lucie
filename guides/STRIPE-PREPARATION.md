# Stripe — prérequis techniques (sans activation réelle)

**But :** savoir que tout est prêt **sur papier** avant un jour d’activation.  
**Interdit maintenant :** paiements réels (`sk_live`), déploiement, transmission de clés secrètes dans ce document.

Guides détaillés déjà présents : `GUIDE-MISE-EN-SERVICE.md`, `PHASE-A-STRIPE.md`, `STRIPE-CLI-TEST.md`, `STRIPE-TEST-CLICS-LUCIE.md`.

---

## 1. Compte Stripe de Lucie

| Prérequis | Fait ? |
|-----------|:------:|
| Compte Stripe au **nom de Lucie** / de l’entreprise | ☐ |
| Identité / infos entreprise complétées dans Stripe (quand elle passera en live) | ☐ |
| Mode **Test** utilisé pour tous les essais | ☐ |

Virtuose / Francis **ne demandent pas** et **ne reçoivent pas** les clés secrètes.

---

## 2. Clés de test

| Élément | Où | Note |
|---------|-----|------|
| Clé secrète test `sk_test_…` | Dashboard Stripe → Developers → API keys (mode Test) | Lucie la colle **elle-même** dans Cloudflare / `.dev.vars` local |
| Clé publiable test (si un jour besoin côté navigateur) | Même écran | Aujourd’hui le Checkout est créé **côté Worker** |
| Jamais de `sk_live` | — | Bloqué tant que la production n’est pas déverrouillée |

---

## 3. Webhooks

| Élément | Détail |
|---------|--------|
| Endpoint (après Worker test autorisé) | `…/api/webhooks/stripe` |
| En local | Stripe CLI → forward vers le Worker local (voir `STRIPE-CLI-TEST.md`) |
| Secret de signature `whsec_…` | Lucie le colle seule (secret Cloudflare) |
| Événements à écouter | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `payment_intent.canceled`, `payment_intent.payment_failed` |

Sans webhook (ou retrieve serveur), la **redirection** seule ne confirme **pas** un paiement.

---

## 4. Stockage des commandes

| Stockage | Rôle |
|----------|------|
| KV `ORDERS` | Idempotence des webhooks + statut de session |
| D1 inventaire (quand Lucie aura validé les stocks) | Réservations / stock — **pas encore rempli de quantités réelles** |

À créer sur le compte Cloudflare de Lucie (voir guide §2) — **pas fait dans ce mandat**.

---

## 5. Confirmation de paiement

| Étape | Comportement attendu |
|-------|----------------------|
| Client paie (test) | Stripe Checkout |
| Retour site | Page « confirmation » → le site **demande au serveur** |
| Serveur | Confirme via webhook KV et/ou retrieve Stripe |
| Sans `session_id` / sans preuve | **Pas** affiché comme payé |

---

## 6. Échecs et annulations

| Cas | Résultat attendu |
|-----|------------------|
| Client annule Checkout | Page annulation ; panier inchangé |
| Carte refusée (test) | Pas de commande confirmée |
| Session expirée | Webhook `expired` ; pas de « payé » |
| Paiement async échoué | Webhook d’échec ; pas de confirmation |
| Remboursement | Événement `charge.refunded` (suivi Dashboard + webhook) |
| Paié mais plus de stock (plus tard) | Cas `paid_no_stock` — Lucie décide : rembourser / contact / autre |

---

## 7. Checklist « prêt pour essais test » (pas la production)

- [ ] Compte Stripe Lucie ouvert  
- [ ] Secrets test collés par Lucie (Worker ou local) — **sans les écrire ici**  
- [ ] Webhook ou Stripe CLI branché  
- [ ] Un paiement test `4242…` réussi + confirmation serveur  
- [ ] Une annulation test vérifiée  
- [ ] Une carte refusée test vérifiée  
- [ ] `/health` ne montre aucun secret  

**Paiements réels :** non activés. `PRODUCTION_UNLOCKED` reste false.
