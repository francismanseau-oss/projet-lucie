# Rapport — premier essai Stripe TEST (pré-paiement)

**Date :** 2026-11-04  
**Mode :** TEST uniquement — aucune clé affichée, aucun deploy / push  
**Résultat :** correctif `payment_method_types` + **session_id perdu après redirect** corrigé  
**Cause session_id :** `npx serve` (cleanUrls) faisait `301` `commande-confirmee.html?session_id=…` → `/commande-confirmee` **sans query**  
**Correctif :** `serve.json` (`cleanUrls: false`) + normalisation success_url + garde-fous page confirmation  
**Tests :** checkout-session-id + phase-a + order-simulation OK ; curl local → **200** (plus de 301)  
**Webhook local :** toujours placeholder — confirmation via `order-status` / `stripe_retrieve` OK quand `session_id` présent

---

## 1. Clé `sk_test_` reconnue par Stripe

| Contrôle | Résultat |
|----------|----------|
| Présente dans `.dev.vars` (gitignored) | Oui |
| Préfixe live interdit | Non (`sk_live` absent) |
| Appel API Stripe `GET /v1/balance` | **HTTP 200** — clé reconnue |
| Worker `stripe_mode` | `test` |
| `force_test_keys` | true |

Aucune valeur de clé dans ce rapport.

---

## 2. Site ↔ Worker

| Contrôle | Résultat |
|----------|----------|
| Boutique `:8766` | OK |
| Health Worker `:8787` | OK |
| `checkout-config.js` → `8787` + `mode: test` | OK |
| Catalogue avec Origin boutique | OK |
| CORS `Access-Control-Allow-Origin` | `http://127.0.0.1:8766` |

---

## 3. Ouverture Checkout TEST

| Contrôle | Résultat |
|----------|----------|
| `POST /api/checkout` (1 mitaine catalogue) | **HTTP 200** (après correctif) |
| Session | préfixe `cs_test_…`, `livemode: false`, status `open` |
| URL | `checkout.stripe.com` |

**Correctif (2026-11-04) :** retrait de `payment_method_types` dans `buildCheckoutParams` (`logic.js`) — seul changement commercialement neutre.

---

## 4. Livraison / restrictions

| Contrôle | Résultat |
|----------|----------|
| `SHIPPING_CONFIGURED` | false |
| Tarifs inventés | Non — grille `unset` / `null` |
| `ALLOW_CHECKOUT_WITHOUT_SHIPPING` (Phase A test) | true |
| Mode livraison attendu si checkout OK | `phase_a_deferred_test_only`, frais **0** (pas de faux tarif Postes Canada) |
| Stocks vente auto | `AVAILABILITY_CONFIGURED=false` — pas de décrément |

---

## 5. Webhook

| Contrôle | Résultat |
|----------|----------|
| `STRIPE_WEBHOOK_SECRET` | **Placeholder local** (`PENDING`) |
| Webhook local signé | **Pas prêt** tant que `stripe listen` + vrai `whsec` |

Même après correctif checkout : un paiement test peut réussir chez Stripe ; la page de confirmation locale peut s’appuyer sur **retrieve** session ; le webhook local restera fragile jusqu’à Stripe CLI.

---

## 6. Étapes paiement (à faire **après** correctif)

1. Boutique → ajouter 1 article → Panier → Paiement  
2. Badge **Test** Stripe  
3. Carte `4242 4242 4242 4242` · date future · CVC quelconque  
4. Dashboard Lucie (mode Test) : paiement visible  
5. Puis (optionnel) Stripe CLI pour webhook

---

## Décision demandée

Dis **oui** pour que je retire `payment_method_types` du checkout Worker (TEST seulement, pas de deploy).  
Ensuite on reteste la création de session, puis tu fais le paiement carte.
