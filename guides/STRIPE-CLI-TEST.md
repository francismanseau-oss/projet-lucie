# Procédure de test complète — Stripe CLI (mode test)

**Nécessite** : clés `sk_test` de Lucie (locales dans `.dev.vars`, jamais commit), Stripe CLI, Worker local.  
**Ne nécessite pas** : déploiement, `sk_live`, compte Desjardins.

## 0. Distinguer les types de tests

| Type | Commande / outil | Clés Lucie |
|------|------------------|------------|
| **Simulé (mocks)** | `cd worker && npm test` | Non |
| **Stripe réel test** | cette procédure + CLI | Oui (`sk_test` seulement) |

## 1. Préparer le Worker local (test)

```bat
cd C:\Projets\projet-lucie\worker
copy .dev.vars.example .dev.vars
```

Lucie (ou elle seule devant l’écran) remplit `.dev.vars` :

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…   REM provisoire : voir étape 3 (CLI)
```

Lancer le Worker **config test** :

```bat
npx wrangler dev -c wrangler.test.toml
```

Vérifier : `http://127.0.0.1:8787/health` → `stripe_mode: test`.

## 2. Site local

- Ouvrir le site (Live Server / Pages local)  
- `checkout-config.js` → `apiBase: "http://127.0.0.1:8787"`  
- Ajouter 1 article au panier → Paiement

## 3. Stripe CLI — forward webhooks

Installer : https://stripe.com/docs/stripe-cli  

```bat
stripe login
stripe listen --forward-to localhost:8787/api/webhooks/stripe
```

Le CLI affiche un **webhook signing secret** `whsec_…` : le coller dans `.dev.vars` → `STRIPE_WEBHOOK_SECRET`, puis **redémarrer** `wrangler dev`.

Événements utiles à observer : `checkout.session.completed`, doublons (CLI peut renvoyer).

## 4. Cartes de test officielles Stripe

Source : https://docs.stripe.com/testing#cards  

| Scénario | Numéro | Attendu |
|----------|--------|---------|
| Succès | `4242 4242 4242 4242` | Redirect → `commande-confirmee.html` puis **confirmed** après `/api/order-status` |
| Déclin | `4000 0000 0000 0002` | Échec au Checkout, pas de confirmation |
| 3D Secure | `4000 0025 0000 3155` | Auth puis succès si complété |
| Fonds insuffisants | `4000 0000 0000 9995` | Déclin |

- Date : toute date future  
- CVC : 3 chiffres quelconques  
- Code postal CA valide (ex. H2X 1Y4)

## 5. Checklist pendant le parcours

1. Panier → Paiement → Stripe Checkout (badge **Test**)  
2. Carte `4242…` → succès  
3. URL = `commande-confirmee.html?session_id=cs_test_…`  
4. Texte initial = « Vérification… » **pas** « Commande confirmée » immédiatement sans API  
5. Après poll : « Commande confirmée » + source `webhook_kv` ou `stripe_retrieve`  
6. `GET /api/order-status?session_id=cs_test_…` → `"confirmed": true`  
7. Ouvrir `commande-confirmee.html` **sans** `session_id` → **pas** confirmé  
8. Annuler un Checkout → `commande-annulee.html`, panier intact  
9. Renvoyer le même événement webhook (CLI / Dashboard) → réponse `duplicate: true`, une seule commande KV

## 6. Erreurs à simuler

| Action | Attendu |
|--------|---------|
| Arrêter `wrangler` pendant le retour | Page succès : « Vérification interrompue » — **pas** payé |
| Mauvaise `STRIPE_WEBHOOK_SECRET` | Webhook 400, commande non confirmée via KV (retrieve peut encore confirmer si payé) |
| Mettre `sk_live` dans `.dev.vars` avec `FORCE_TEST_KEYS_ONLY=true` | Checkout **403** |

## 7. Interdit

- Push / deploy sans autorisation  
- `sk_live` sur le Worker test  
- Dire « commande payée » uniquement parce que l’URL de succès s’est ouverte
