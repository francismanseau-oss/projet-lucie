# Stripe mode TEST — où cliquer (Lucie)

**But :** brancher les paiements **test** (cartes fictives, pas d’argent réel).  
**Interdit :** `sk_live`, déploiement sans autorisation Francis, envoyer les clés par message.

Guide technique détaillé : `GUIDE-MISE-EN-SERVICE.md` · CLI local : `STRIPE-CLI-TEST.md`.

---

## A. État code (déjà prêt en local)

| Élément | État |
|---------|------|
| Worker (`worker/src/index.js`) | Routes `/api/checkout`, `/api/webhooks/stripe`, `/api/order-status`, `/health` |
| 66 produits + prix CAD | Catalogue serveur |
| `checkout-config.js` | `apiBase: http://127.0.0.1:8787`, `mode: "test"`, **aucune clé** |
| KV `ORDERS` | Prévu dans `wrangler.test.toml` — **IDs pas encore collés** (à créer chez Cloudflare) |
| Secrets | Modèle `worker/.dev.vars.example` — fichier `.dev.vars` **absent** (normal) |
| Confirmation | `commande-confirmee.html` interroge le Worker ; redirect ≠ payé |
| Gates prod | Toutes à `false` + `FORCE_TEST_KEYS_ONLY=true` |

---

## B. Chez Stripe (compte Lucie) — mode Test

### B1. Activer le mode Test

1. Aller sur [https://dashboard.stripe.com](https://dashboard.stripe.com)  
2. En haut à droite, trouver l’interrupteur **Test mode** / **Mode test**  
3. Le mettre **ON** (souvent fond orange « Test »)

### B2. Copier la clé secrète test

1. Menu gauche : **Developers** (Développeurs)  
2. Cliquer **API keys** (Clés API)  
3. Section **Secret key** → bouton **Reveal** / **Révéler**  
4. Copier la clé qui commence par **`sk_test_`**  
5. **Ne pas** copier une clé `sk_live_`  
6. Coller plus tard dans Cloudflare ou dans `.dev.vars` local (jamais dans un chat / Git)

### B3. Créer le webhook (après que le Worker test existe en ligne **ou** utiliser Stripe CLI en local)

**Option locale (recommandée d’abord — pas de deploy) :** voir section D (Stripe CLI).

**Option cloud (Worker déjà déployé en test) :**

1. Toujours en **Test mode**  
2. **Developers** → **Webhooks**  
3. **Add endpoint** / **Ajouter un point de terminaison**  
4. **Endpoint URL** :  
   `https://fourrures-boreales-checkout-test.<sous-domaine>.workers.dev/api/webhooks/stripe`  
   (remplacer par l’URL exacte affichée après deploy test)  
5. **Events to send** → sélectionner au minimum :  
   - `checkout.session.completed`  
   - `checkout.session.async_payment_succeeded`  
   - `checkout.session.async_payment_failed`  
   - `checkout.session.expired`  
   - `charge.refunded`  
   - `payment_intent.canceled`  
   - `payment_intent.payment_failed`  
6. **Add endpoint**  
7. Ouvrir l’endpoint → **Signing secret** → **Reveal** → copier **`whsec_…`**

---

## C. Chez Cloudflare (compte Lucie de préférence)

### C1. Connexion Wrangler (une fois)

Sur le PC :

```bat
cd C:\Projets\projet-lucie\worker
npm install
npx wrangler login
```

Une page navigateur s’ouvre → Lucie se connecte avec **son** compte Cloudflare → autoriser.

### C2. Créer le KV ORDERS (test)

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler kv namespace create ORDERS_TEST
npx wrangler kv namespace create ORDERS_TEST --preview
```

Noter les deux **id** affichés.

Dans `wrangler.test.toml`, décommenter le bloc et coller :

```toml
[[kv_namespaces]]
binding = "ORDERS"
id = "…id du premier create…"
preview_id = "…id du create --preview…"
```

### C3. Coller les secrets Stripe test (Lucie tape seule)

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler secret put STRIPE_SECRET_KEY -c wrangler.test.toml
```

→ Coller `sk_test_…` puis Entrée.

```bat
npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.test.toml
```

→ Coller `whsec_…` puis Entrée.

**Dashboard alternatif :** Cloudflare → **Workers & Pages** → worker test → **Settings** → **Variables and Secrets** → **Add** → type **Secret**.

### C4. Déploiement test

**Seulement si Francis a autorisé explicitement un deploy test.** Sinon rester en local (section D).

```bat
npx wrangler deploy -c wrangler.test.toml
```

Noter l’URL `https://fourrures-boreales-checkout-test.…workers.dev`.

Puis mettre à jour `checkout-config.js` :

```js
apiBase: "https://fourrures-boreales-checkout-test.…workers.dev",
mode: "test",
confirmViaServer: true,
```

(sans slash final, **aucune** clé dans ce fichier)

### C5. Vérifications après secrets / deploy

Navigateur : `https://…workers.dev/health`  
Attendu : JSON avec `stripe_mode: "test"`, **aucun** secret visible.

---

## D. Test 100 % local (sans déployer) — ordre des clics / fenêtres

1. Copier le modèle de secrets :
   ```bat
   cd C:\Projets\projet-lucie\worker
   copy .dev.vars.example .dev.vars
   ```
2. Lucie ouvre `.dev.vars` et colle `sk_test_…` (le `whsec` viendra à l’étape 4).  
3. Terminal 1 — Worker :
   ```bat
   npx wrangler dev -c wrangler.test.toml
   ```
4. Terminal 2 — Stripe CLI (installée) :
   ```bat
   stripe listen --forward-to localhost:8787/api/webhooks/stripe
   ```
   Copier le `whsec_…` affiché → coller dans `.dev.vars` → **relancer** le terminal Worker.  
5. Ouvrir le site local (Live Server, etc.) — `checkout-config.js` reste sur `http://127.0.0.1:8787`.  
6. Boutique → ajouter un produit → Panier → Paiement → **Payer avec Stripe (test)**.  
7. Carte : `4242 4242 4242 4242` · date future · CVC quelconque · nom quelconque.  
8. Après succès → page **Commande confirmée** doit afficher « Vérification… » puis confirmation **serveur** (pas seulement la redirection).  
9. Ouvrir `commande-confirmee.html` **sans** `session_id` → ne doit **pas** dire « payé ».

---

## E. Ce que Francis / Virtuose ne font pas

- Recevoir ou coller `sk_test` / `whsec` à la place de Lucie  
- Mettre une clé dans Git ou dans `checkout-config.js`  
- Activer `sk_live` ou `PRODUCTION_UNLOCKED`  
- Déployer sans demande explicite
