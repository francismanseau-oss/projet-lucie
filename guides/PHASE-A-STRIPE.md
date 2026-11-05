# Phase A — Stripe Checkout (test) — Les Fourrures Boréales

## Ce qui a été préparé (local, non déployé)

- Catalogue serveur `catalog/products.json` : **66 produits**, prix **identiques** à `boutique.html`
- Worker Cloudflare `worker/` : `/api/checkout`, `/api/webhooks/stripe`, `/api/catalog`, `/health`
- Page `paiement.html` branchée sur le Worker (mode test)
- **Aucun** `sk_live`, **aucun** frais de livraison inventé
- **Paiements réels bloqués** tant que `PRODUCTION_UNLOCKED`, `SHIPPING_CONFIGURED` et `AVAILABILITY_CONFIGURED` ne sont pas `true`
- Tests simulés : `cd worker && npm test` (mocks, **sans** clés Lucie)
- Setup Cloudflare / KV : `docs/CLOUDFLARE-WORKER-SETUP.md`
- Worker test isolé : `worker/wrangler.test.toml` (`npm run dev:test`)
- Secrets Lucie : `docs/LUCIE-SECRETS-CLOUDFLARE.md`
- Stripe CLI : `docs/STRIPE-CLI-TEST.md`
- Checklist avant prod : `docs/PREPROD-CHECKLIST.md`
- Pages : `commande-confirmee.html` (vérif serveur) + `commande-annulee.html`

## Séparation Lucie / Francis

| | Lucie | Francis |
|--|--------|---------|
| Compte Stripe + banque Desjardins | Oui (seule) | Non |
| Dashboard financier Stripe | Oui | Non |
| Clés secrètes `sk_…` / `whsec_…` | Elle les crée et les colle dans Cloudflare Secrets **elle-même** | Ne doit pas les recevoir par message |
| Code site + Worker (Git) | Optionnel | Oui (technique) |
| Compte Cloudflare / DNS | Idéalement Lucie propriétaire | Si Francis admin CF : accès technique possible aux secrets/logs |

### Limite importante (à assumer)

Si Francis conserve l’accès administrateur Cloudflare (déploiements, secrets, logs Worker), il **peut techniquement** lire des métadonnées de commandes (e-mail, montants, IDs Stripe) même sans compte Stripe.  
Pour une séparation forte : **compte Cloudflare au nom de Lucie**, Francis = accès code seulement (PR), Lucie déploie et colle les secrets.

## Test local (Francis)

```bat
cd worker
npm install
copy .dev.vars.example .dev.vars
REM coller sk_test_… et whsec_… de TEST dans .dev.vars (jamais commit)
npm run check
npx wrangler dev
```

Puis ouvrir le site en local (ou Live Server) avec `checkout-config.js` → `apiBase: "http://127.0.0.1:8787"`.

Webhook local : Stripe CLI  
`stripe listen --forward-to localhost:8787/api/webhooks/stripe`

## Ce que Lucie configure (sans partager ses secrets)

### Dans Stripe (compte Lucie, mode Test)

1. Créer / ouvrir le compte Stripe Canada au nom de Lucie.
2. Activer le **mode Test**.
3. Developers → API keys → copier **Secret key** `sk_test_…` (ne pas l’envoyer à Francis).
4. Developers → Webhooks → Add endpoint  
   URL (après déploiement autorisé) : `https://<worker>.workers.dev/api/webhooks/stripe`  
   Events : `checkout.session.completed`, `charge.refunded`, `payment_intent.canceled`
5. Copier le **Signing secret** `whsec_…` (ne pas l’envoyer à Francis).
6. (Plus tard) Compte bancaire Desjardins — pour les vrais paiements seulement.

### Dans Cloudflare (idéalement compte Lucie)

1. Créer un Worker (ou laisser Francis préparer le code ; Lucie colle les secrets).
2. Workers → Settings → Variables → **Encrypt** :
   - `STRIPE_SECRET_KEY` = `sk_test_…`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_…`
3. Variables plain :
   - `ALLOW_TEST_CHECKOUT` = `true`
   - `PRODUCTION_UNLOCKED` = `false`
   - `SHIPPING_CONFIGURED` = `false`
   - `AVAILABILITY_CONFIGURED` = `false`
   - `SITE_ORIGIN` = `https://francismanseau-oss.github.io`
4. KV namespace `ORDERS` (idempotence) — binding `ORDERS`.
5. Ne **jamais** mettre `sk_live` tant que livraison + stocks + obligations ne sont pas prêts.

### Francis ne doit pas

- Demander le mot de passe Stripe / banque
- Recevoir `sk_live` / `sk_test` / `whsec` par texto ou courriel
- Activer `PRODUCTION_UNLOCKED=true` sans feu vert explicite

## Blocage production (code)

Le Worker refuse `sk_live` sauf si les trois drapeaux sont `true`.  
Même alors, les articles avec `availability: "contact"` sont refusés en live.

## Hors Phase A (prochaines phases)

- Vrais tarifs Postes Canada / bus QC
- Stocks confirmés pièce par pièce
- TPS/TVQ selon statut fiscal Lucie
- E-mails transactionnels
- Admin Lucie
