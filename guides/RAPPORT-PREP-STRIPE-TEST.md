# Rapport — préparation essais Stripe TEST (avec Lucie)

**Date :** 2026-11-01  
**Statut :** préparation seulement — **aucun** paiement lancé, **aucun** compte connecté dans cette passe, **aucun** déploiement / push, **aucune** clé live.

Objectif : le jour des essais, Francis + Lucie suivent une liste claire sans improviser.

Guides déjà existants : `STRIPE-CLI-TEST.md` · `STRIPE-TEST-CLICS-LUCIE.md` · `STRIPE-PREPARATION.md`

---

## 1. Ce qui est prêt (technique)

| Élément | État |
|---------|------|
| Worker test (`wrangler.test.toml`) | `FORCE_TEST_KEYS_ONLY=true`, `WORKER_ENV=test`, `PRODUCTION_UNLOCKED=false` |
| Acceptation `sk_test_` / refus `sk_live_` | **Vérifié** par tests locaux (115/115 + contrôles sk_live 403) |
| Routes | `/api/checkout`, `/api/webhooks/stripe`, `/api/order-status`, `/health` |
| `checkout-config.js` | `apiBase: http://127.0.0.1:8787`, `mode: "test"`, **aucune clé** |
| Retour succès | `commande-confirmee.html?session_id={CHECKOUT_SESSION_ID}` |
| Retour annulation | `commande-annulee.html` |
| Confirmation « payé » | Seulement si `/api/order-status` → `confirmed: true` (webhook KV **ou** retrieve Stripe authentifié) — **pas** la redirection seule |
| Adresse | Checkout limité au **Canada** (`allowed_countries = CA`) |
| Catalogue / prix serveur | 66 produits ; prix navigateur ignoré |
| Mode test livraison | `ALLOW_CHECKOUT_WITHOUT_SHIPPING=true` **uniquement** Worker test Phase A |
| Origines CORS site local | Inclut désormais **8766** (port `serve` habituel) + 5500 |

---

## 2. Ce qui manque pour les essais Stripe TEST

| Manque | Qui | Commentaire |
|--------|-----|-------------|
| Compte Stripe Lucie (mode **Test**) | Lucie | Interrupteur Test ON |
| Fichier `worker/.dev.vars` | Lucie colle seule | Absent aujourd’hui (normal) — **ne jamais** coller de clé dans le chat |
| Clé `sk_test_…` dans `.dev.vars` | Lucie | Pas de `sk_live` |
| Stripe CLI installée + `stripe login` | PC essais | Non détectée dans le PATH de cette session |
| `whsec_…` du `stripe listen` | Lucie → `.dev.vars` | Puis **relancer** Wrangler |
| KV `ORDERS` IDs Cloudflare | Optionnel en local pur | **Recommandé** pour persistance / doublons durables ; sans binding, confirmation possible via **retrieve** Stripe si payé, mais KV webhook limitée |
| Autorisation « lancer l’essai » | Francis / Lucie | Pas encore donnée dans ce mandat |

### Limite commerciale (à dire clairement)

Inventaire non rempli + livraison non configurée → ce parcours TEST utilise le **contournement Phase A** (`ALLOW_CHECKOUT_WITHOUT_SHIPPING`).  

**Ce n’est pas une validation de production.**  
Ça valide : Checkout test, webhooks, confirmation serveur, anti-falsification prix, pages succès/annulation.

---

## 3. Commandes le jour des essais (local, sans deploy)

**Ne jamais afficher / coller de secret dans le terminal partagé ni dans un rapport.**

### Terminal A — secrets locaux (Lucie devant l’écran)

```bat
cd C:\Projets\projet-lucie\worker
copy .dev.vars.example .dev.vars
notepad .dev.vars
```

Lucie remplit (hors partage d’écran si possible) :

- `STRIPE_SECRET_KEY=sk_test_…`  
- `STRIPE_WEBHOOK_SECRET=` (temporaire ; complété après Terminal C)

### Terminal B — Worker

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler dev -c wrangler.test.toml
```

Vérifier (sans secret) : navigateur → `http://127.0.0.1:8787/health`  
Attendu : `stripe_mode` = test (ou équivalent), **aucune** clé visible.

### Terminal C — Stripe CLI (webhooks)

```bat
stripe login
stripe listen --forward-to localhost:8787/api/webhooks/stripe
```

Copier le `whsec_…` affiché → Lucie le met dans `.dev.vars` → **redémarrer** Terminal B.

### Terminal D — site

```bat
cd C:\Projets\projet-lucie
npx serve -l 8766
```

Ouvrir `http://127.0.0.1:8766/boutique.html`  
(`checkout-config.js` pointe déjà vers `8787`)

### Option KV Cloudflare (si on veut persistance ORDERS cloud)

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler kv namespace create ORDERS_TEST
npx wrangler kv namespace create ORDERS_TEST --preview
```

Puis coller les IDs dans `wrangler.test.toml` (bloc commenté) — **sans deploy** tant que non autorisé.  
En `wrangler dev`, le preview KV peut servir si configuré.

---

## 4. Parcours carte test (à faire le jour J — pas aujourd’hui)

1. Ajouter 1 article → Panier → Paiement  
2. Badge **Test** Stripe visible  
3. Carte succès : `4242 4242 4242 4242` · date future · CVC quelconque · CP canadien  
4. Autres cartes (si temps) :  
   - refus : `4000 0000 0000 0002`  
   - annulation : fermer / Annuler → `commande-annulee.html`  

---

## 5. Vérifications après le paiement test

| # | Vérification | Attendu |
|---|--------------|---------|
| 1 | URL succès | `commande-confirmee.html?session_id=cs_test_…` |
| 2 | Texte initial | « Vérification… » — **pas** « payé » immédiatement sans API |
| 3 | Après poll | « Commande confirmée » seulement si serveur dit `confirmed: true` |
| 4 | `GET http://127.0.0.1:8787/api/order-status?session_id=…` | `"confirmed": true`, source `webhook_kv` ou `stripe_retrieve` |
| 5 | Même page **sans** `session_id` | **Pas** confirmé |
| 6 | Terminal Stripe CLI | Événement `checkout.session.completed` (ou async) |
| 7 | Renvoi webhook (Dashboard/CLI) | `duplicate: true` si KV ORDERS actif |
| 8 | Annulation | `commande-annulee.html`, panier intact |
| 9 | Carte refusée | Pas de commande confirmée |
| 10 | `.dev.vars` avec `sk_live` (ne pas faire sauf test volontaire isolé) | Checkout **403** |

**KV :** clés utiles `order:cs_test_…`, `evt:…`, `pending:…` — inspection via Dashboard Cloudflare KV **ou** logs Worker ; ne pas logger de secrets.

---

## 6. Corrections techniques faites / restantes

| Item | Statut |
|------|--------|
| CORS / `PUBLIC_SITE_URL` pour port **8766** | **Corrigé** dans `wrangler.test.toml` |
| Bug métier bloquant essais TEST | Aucun détecté |
| Installer Stripe CLI sur le PC d’essai | **À faire** le jour J |
| Créer `.dev.vars` (Lucie) | **À faire** le jour J |
| Brancher KV ORDERS | Recommandé pour idempotence durable |
| Inventaire / livraison réelle | Hors scope TEST Phase A — **pas** une validation prod |

---

## 7. Phrase à retenir pour Lucie

> On teste Stripe en **mode Test** (faux argent). Le site peut encaisser un paiement test **sans** livraison configurée **uniquement** parce qu’on est en Worker test.  
> Quand on ouvrira pour de vrai, livraison + stocks + taxes devront être prêts — et les clés live resteront interdites jusqu’à décision explicite.

---

*Aucun secret dans ce document. Aucun paiement lancé dans cette passe.*
