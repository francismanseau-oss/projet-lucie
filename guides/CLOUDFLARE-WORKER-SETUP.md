# Cloudflare Worker — préparation Phase A (sans déploiement)

Document local. **Aucun push / deploy** tant que Lucie n’est pas disponible avec ses comptes.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `worker/wrangler.toml` | Dev local générique |
| `worker/wrangler.test.toml` | Worker **test** isolé (`…-checkout-test`), `FORCE_TEST_KEYS_ONLY` |
| `worker/src/index.js` | Routes HTTP |
| `worker/src/logic.js` | Logique pure (tests) |
| `worker/src/products.json` | Catalogue serveur (copie de `catalog/products.json`) |
| `worker/.dev.vars.example` | Modèle secrets locaux (copier → `.dev.vars`) |
| `checkout-config.js` | `apiBase` seulement — **zéro secret** |

## Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/health` | Flags Phase A, mode Stripe (`test` / unset) — sans secrets |
| GET | `/api/catalog` | Lecture seule des 66 prix CAD |
| POST | `/api/catalog` | **405** — catalogue non modifiable par le client |
| GET | `/api/order-status?session_id=` | Statut payé **serveur** (KV webhook et/ou retrieve Stripe) |
| POST | `/api/checkout` | Crée Session Checkout (prix serveur uniquement) |
| POST | `/api/webhooks/stripe` | HMAC + idempotence KV + événements async |

## Variables d’environnement

### Plain (`[vars]` dans `wrangler.toml` ou dashboard)

| Variable | Phase A | Notes |
|----------|---------|--------|
| `SITE_ORIGIN` / `PUBLIC_SITE_URL` | URL site | Succès / annulation Checkout |
| `ALLOWED_ORIGINS` | CSV origines CORS | Pages + Live Server local |
| `ALLOW_TEST_CHECKOUT` | `true` | Documentation |
| `PRODUCTION_UNLOCKED` | **`false`** | Bloque `sk_live` |
| `SHIPPING_CONFIGURED` | **`false`** | Bloque vente réelle sans livraison |
| `AVAILABILITY_CONFIGURED` | **`false`** | Bloque vente réelle sans stocks |

### Secrets (`.dev.vars` local / `wrangler secret` prod — **jamais dans git**)

| Secret | Valeur Phase A |
|--------|----------------|
| `STRIPE_SECRET_KEY` | `sk_test_…` uniquement |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` de l’endpoint test |

Lucie colle ces valeurs **elle-même**. Francis ne les reçoit pas par message.

## Créer le stockage KV `ORDERS`

À faire **une fois** quand le compte Cloudflare de Lucie (ou infra) est prêt — pas maintenant si comptes absents.

```bat
cd worker
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create ORDERS --preview
```

Copier les IDs dans `wrangler.toml` :

```toml
[[kv_namespaces]]
binding = "ORDERS"
id = "<id production>"
preview_id = "<id preview>"
```

Rôles KV :

- `evt:<event_id>` — anti-doublon webhook
- `pending:<session_id>` — session créée, pas encore payée
- `order:<session_id>` — confirmé après `checkout.session.completed`

Sans KV en local : les tests mocks utilisent un MemoryKV ; en `wrangler dev` sans binding, l’idempotence webhook est limitée (OK pour smoke test).

## Secrets côté client / Git

- `checkout-config.js` : URL Worker seulement
- `.gitignore` : `.dev.vars`, `.env`, `node_modules`, `.wrangler`
- `/health` et `/api/catalog` : jamais de `sk_` / `whsec_`
- Catalogue : embarqué dans le Worker (bundle) — le navigateur ne peut pas le réécrire

## Tests (distinction importante)

| Commande | Type | Besoin clés Lucie ? |
|----------|------|---------------------|
| `npm test` | **Simulé** (mocks Stripe) | Non |
| `npm run test:catalog` | Fichiers locaux HTML↔JSON | Non |
| Stripe CLI + `wrangler dev` + `sk_test` | **Vrai** Stripe test | Oui (Lucie) |

## Quand Lucie est dispo (ordre suggéré)

1. Compte Stripe CA mode **Test** → `sk_test` + webhook `whsec`
2. Compte Cloudflare (idéalement à son nom) → coller secrets encryptés
3. Créer KV ORDERS → décommenter binding
4. `wrangler deploy` **seulement** avec son accord
5. Brancher `checkout-config.js` `apiBase` sur l’URL Worker
6. Test carte `4242…` — toujours mode test
