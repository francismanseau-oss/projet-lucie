# Lucie — ajouter ses secrets Stripe dans Cloudflare (elle-même)

**Francis / Virtuose ne doivent pas recevoir** `sk_test`, `sk_live` ni `whsec` par texto ou courriel.

Aucun déploiement n’est autorisé sans accord explicite. Ce guide prépare le moment où Lucie aura son compte Cloudflare + Stripe.

## Prérequis (compte Lucie)

1. Compte **Stripe** Canada, mode **Test** activé  
2. Compte **Cloudflare** (idéalement au nom de Lucie)  
3. Worker test déjà créé / prêt : `fourrures-boreales-checkout-test`  
   (config locale : `worker/wrangler.test.toml`)

## A. Dans Stripe (mode Test)

1. Dashboard → **Developers** → **API keys**  
2. Copier la **Secret key** qui commence par `sk_test_`  
3. **Developers** → **Webhooks** → Add endpoint  
   - URL (après deploy test autorisé) :  
     `https://fourrures-boreales-checkout-test.<compte>.workers.dev/api/webhooks/stripe`  
   - Events à cocher :
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
     - `charge.refunded`
     - `payment_intent.canceled`
     - `payment_intent.payment_failed`
4. Ouvrir l’endpoint → copier le **Signing secret** `whsec_…`

## B. Dans Cloudflare (Lucie colle les secrets)

### Option dashboard (recommandée pour Lucie)

1. Cloudflare → **Workers & Pages** → Worker `fourrures-boreales-checkout-test`  
2. **Settings** → **Variables and Secrets**  
3. **Add** → type **Secret** :
   - Nom : `STRIPE_SECRET_KEY` → coller `sk_test_…` → Encrypt  
   - Nom : `STRIPE_WEBHOOK_SECRET` → coller `whsec_…` → Encrypt  
4. Vérifier les variables plain (non secrètes) :
   - `WORKER_ENV` = `test`
   - `FORCE_TEST_KEYS_ONLY` = `true`
   - `PRODUCTION_UNLOCKED` = `false`
   - `SHIPPING_CONFIGURED` = `false`
   - `AVAILABILITY_CONFIGURED` = `false`
5. **Ne jamais** coller une clé `sk_live` dans ce Worker test.

### Option ligne de commande (si Lucie a Wrangler + login)

```bat
cd worker
npx wrangler secret put STRIPE_SECRET_KEY -c wrangler.test.toml
npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.test.toml
```

Coller la valeur quand le terminal le demande (elle ne s’affiche pas).

## C. KV ORDERS (test)

```bat
npx wrangler kv namespace create ORDERS_TEST
npx wrangler kv namespace create ORDERS_TEST --preview
```

Décommenter `[[kv_namespaces]]` dans `wrangler.test.toml` avec les IDs, **sans** réutiliser le KV de production.

## D. Ce que Lucie ne partage pas

| OK à dire à Francis | À ne jamais envoyer |
|---------------------|---------------------|
| « Les secrets sont collés » | `sk_test_…` / `sk_live_…` |
| URL du Worker | `whsec_…` |
| « Le webhook est vert » | Mot de passe Stripe / Desjardins |

## E. Vérification rapide (sans exposer les secrets)

Après deploy test autorisé :

```text
GET https://<worker-test>/health
```

Attendu : `"stripe_mode":"test"`, `"force_test_keys":true`, **aucun** secret dans la réponse.
