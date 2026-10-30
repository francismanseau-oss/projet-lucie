# Guide de mise en service — Les Fourrures Boréales

**Objectif :** terminer la configuration avec Lucie, étape par étape, sans improvisation.  
**Interdit pour l’instant :** déploiement, push Git, paiement réel (`sk_live`), modification des prix / photos / catalogue.

Ce guide suppose que le code Phase A + stocks + livraison est déjà prêt en local (72 tests simulés OK).

---

## 0. État des lieux (vérifié)

### Fichiers de configuration présents et cohérents

| Fichier | Rôle | Cohérence |
|---------|------|-----------|
| `worker/wrangler.toml` | Dev local | Gates prod à `false` |
| `worker/wrangler.test.toml` | Worker **test** isolé | `FORCE_TEST_KEYS_ONLY=true`, `sk_live` interdit |
| `worker/.dev.vars.example` | Modèle secrets locaux | Placeholders seulement ; **jamais** commit de `.dev.vars` |
| `worker/migrations/0001_inventory.sql` | Schéma D1 stocks/réservations | Prêt |
| `inventory/inventory.json` + `INVENTAIRE-LUCIE.csv` | 66 articles, qty `null` | Aucun stock fictif |
| `shipping/shipping-config.json` | Postes Canada / autobus | Tarifs `unset` / `null` |
| `checkout-config.js` | URL Worker seulement | Aucune clé secrète |
| `.gitignore` | Protège `.dev.vars`, `.env`, `.wrangler` | OK |

### Secrets / données personnelles dans Git

| Contrôle | Résultat |
|----------|----------|
| Fichier `.dev.vars` présent dans le dépôt | Non (absent) |
| Vraies clés `sk_test` / `sk_live` / `whsec` dans les sources | Non (placeholders / mocks uniquement) |
| E-mails clients Stripe dans le code | Non (API masque l’e-mail) |
| E-mail public boutique (`contact.html`) | Oui — **contact commercial volontaire**, pas un secret Stripe |

Si un jour un `.dev.vars` est créé : **ne jamais** le committer ni le pousser.

---

## 1. Qui fait quoi

| Personne | Fait | Ne fait pas |
|----------|------|-------------|
| **Lucie** | Compte Stripe, secrets Cloudflare, inventaire, colis, tarifs, politiques | Envoyer ses clés par texto/courriel |
| **Francis / Virtuose** | Code, commandes Wrangler (si Lucie le demande), tests | Recevoir / coller les secrets à sa place |
| **Compte Cloudflare** | Idéalement **au nom de Lucie** | Francis admin permanent sur les secrets (à éviter) |

---

## 2. Créer les ressources Cloudflare (compte Lucie)

Faire **dans l’ordre**, sur le compte Cloudflare de Lucie.

### 2.1 Prérequis

- Compte Cloudflare créé / ouvert par Lucie  
- Node.js installé sur le PC utilisé pour Wrangler  
- Dossier projet : `C:\Projets\projet-lucie\worker`

```bat
cd C:\Projets\projet-lucie\worker
npm install
npx wrangler login
```

Lucie se connecte dans le navigateur (son compte).

### 2.2 KV — idempotence webhooks (pas les stocks)

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler kv namespace create ORDERS_TEST
npx wrangler kv namespace create ORDERS_TEST --preview
```

Noter les deux IDs affichés. Dans `wrangler.test.toml`, décommenter et coller :

```toml
[[kv_namespaces]]
binding = "ORDERS"
id = "COLLER_ID_PRODUCTION_KV_TEST"
preview_id = "COLLER_ID_PREVIEW_KV_TEST"
```

### 2.3 D1 — stocks et réservations (transactionnel)

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler d1 create boreales-inventory-test
```

Noter le `database_id`. Dans `wrangler.test.toml`, décommenter et coller :

```toml
[[d1_databases]]
binding = "DB"
database_name = "boreales-inventory-test"
database_id = "COLLER_DATABASE_ID"
```

### 2.4 Migrer le schéma D1 (commandes exactes)

**Local / preview :**

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler d1 execute boreales-inventory-test --local --file=migrations/0001_inventory.sql
```

**Distant (base test Cloudflare) — seulement quand Lucie a créé la base et autorise l’exécution distante :**

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler d1 execute boreales-inventory-test --remote --file=migrations/0001_inventory.sql
```

Vérifier les tables :

```bat
npx wrangler d1 execute boreales-inventory-test --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Tables attendues : `inventory`, `reservations`, `reservation_lines`, `stock_alerts`.

### 2.5 Worker test (déploiement — **pas maintenant**)

Quand Francis aura **autorisé explicitement** un déploiement test :

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler deploy -c wrangler.test.toml
```

Noter l’URL : `https://fourrures-boreales-checkout-test.<compte>.workers.dev`

Jusque-là : rester en local avec :

```bat
npx wrangler dev -c wrangler.test.toml
```

---

## 3. Connexion Stripe mode test (sans transmettre les secrets)

Lucie fait **seule** devant son écran. Francis peut guider à voix haute.

### 3.1 Stripe Dashboard (mode Test)

1. Ouvrir Stripe → basculer **Test mode** (interrupteur).  
2. **Developers → API keys** → Secret key `sk_test_…`  
3. **Developers → Webhooks → Add endpoint**  
   - URL (après deploy test autorisé) :  
     `https://fourrures-boreales-checkout-test.<compte>.workers.dev/api/webhooks/stripe`  
   - En local avec Stripe CLI : voir §6 (pas besoin d’endpoint public tout de suite).  
4. Événements à cocher :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `payment_intent.canceled`
   - `payment_intent.payment_failed`
5. Copier le **Signing secret** `whsec_…` (ne pas l’envoyer à Francis).

### 3.2 Coller les secrets dans Cloudflare (Lucie)

**Dashboard Cloudflare → Workers → `fourrures-boreales-checkout-test` → Settings → Variables → Encrypt :**

| Nom | Valeur |
|-----|--------|
| `STRIPE_SECRET_KEY` | `sk_test_…` (Lucie colle) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (Lucie colle) |

**Ou en ligne de commande (Lucie tape elle-même) :**

```bat
cd C:\Projets\projet-lucie\worker
npx wrangler secret put STRIPE_SECRET_KEY -c wrangler.test.toml
npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.test.toml
```

### 3.3 Ce que Lucie peut dire à Francis (sans secret)

- « Les deux secrets test sont collés. »  
- « L’URL du Worker est : https://… »  
- « Le webhook Stripe est vert. »

### 3.4 Variables plain à laisser à `false` (test)

Dans `wrangler.test.toml` / dashboard :

- `PRODUCTION_UNLOCKED=false`  
- `SHIPPING_CONFIGURED=false`  
- `AVAILABILITY_CONFIGURED=false`  
- `PACKAGE_PROFILES_CONFIGURED=false`  
- `COMMERCIAL_TERMS_CONFIGURED=false`  
- `FREE_SHIPPING_AUTHORIZED=false`  
- `FORCE_TEST_KEYS_ONLY=true`  
- `ALLOW_CHECKOUT_WITHOUT_SHIPPING=true` *(test Phase A seulement)*

---

## 4. Informations que Lucie doit fournir

Remplir **avant** d’activer stocks / livraison / production. Aucune invention côté technique.

### 4.1 Stocks (fichier `inventory/INVENTAIRE-LUCIE.csv`)

Pour **chaque** des 66 articles :

| Champ | Valeurs possibles |
|-------|-------------------|
| `fulfillment_type` | `unique_stock` ou `made_to_order` (plus `pending_lucie`) |
| `qty_on_hand` | Nombre entier réel, ou **vide** si inconnu / sur commande |
| `notes_lucie` | Délai fabrication, particularités |
| `lucie_confirmed` | `true` seulement si la ligne est validée |

### 4.2 Colis

- Poids typique (g)  
- Longueur / largeur / hauteur (cm)  
- Variantes si plusieurs formats de colis  

→ Permet plus tard `PACKAGE_PROFILES_CONFIGURED=true`.

### 4.3 Livraison

| Méthode | À décider |
|---------|-----------|
| Postes Canada | Grille manuelle Lucie **ou** API Rating ; provinces / CP |
| Autobus Québec | Règles + validation manuelle des frais par commande |
| Ramassage | Oui/non, lieu, gratuit ? |
| Livraison gratuite | Oui/non → si oui, `FREE_SHIPPING_AUTHORIZED` plus tard |

### 4.4 Taxes

- TPS / TVQ : inscrite ou non ?  
- Prix affichés TTC ou HT ?  
- Qui produit les factures ?

### 4.5 Politiques commerciales

- Délais de fabrication (sur commande)  
- Retours / échanges  
- Que faire si **paiement reçu sans stock** (`paid_no_stock`) : rembourser, pièce équivalente, contact manuel ?  
- Confidentialité / mentions légales paiement  

---

## 5. Brancher le site (après Worker test joignable)

Dans `checkout-config.js` (toujours **sans** secret) :

```js
window.BOREALES_CHECKOUT = {
  apiBase: "https://fourrures-boreales-checkout-test.XXXX.workers.dev", // URL réelle
  mode: "test",
  confirmViaServer: true,
};
```

En local avant deploy :

```js
apiBase: "http://127.0.0.1:8787",
```

---

## 6. Tests de bout en bout (après comptes connectés)

### 6.1 Automatisés (déjà OK sans comptes)

```bat
cd C:\Projets\projet-lucie\worker
npm run check
```

Attendu : catalogue 66/66 + **72** tests simulés.

### 6.2 Avec Stripe test + Worker (Lucie a collé `sk_test`)

1. `npx wrangler dev -c wrangler.test.toml`  
2. Terminal 2 : `stripe listen --forward-to localhost:8787/api/webhooks/stripe`  
3. Coller le `whsec_` CLI dans `.dev.vars` (local) → redémarrer Wrangler  
4. Site local → panier → paiement  
5. Carte test : `4242 4242 4242 4242`  
6. Retour `commande-confirmee.html` → texte « Vérification… » puis confirmation **serveur**  
7. Sans `session_id` → **pas** « payé »  
8. Annulation Checkout → `commande-annulee.html`, panier intact  
9. `GET /health` → `stripe_mode: test`, aucun secret dans la réponse  
10. Carte refusée `4000 0000 0000 0002` → pas de commande confirmée  

Détail cartes : `docs/STRIPE-CLI-TEST.md`.

### 6.3 Après D1 + inventaire Lucie rempli (plus tard)

1. Importer les lignes confirmées dans D1  
2. `AVAILABILITY_CONFIGURED=true` **seulement** si Lucie est d’accord  
3. Deux navigateurs / deux paniers sur le **dernier** exemplaire → un seul checkout OK  
4. Laisser expirer une réservation puis payer → réacquisition **ou** `paid_no_stock` (pas de survente)

---

## 7. Retour arrière en cas d’échec

| Symptôme | Action immédiate |
|----------|------------------|
| Mauvaise clé / webhook en erreur | Lucie retire ou remplace le secret CF ; repasser `FORCE_TEST_KEYS_ONLY=true` |
| Worker test se comporte mal | Remettre `checkout-config.js` → `apiBase` local ou retirer l’URL ; **ne pas** toucher la prod (elle n’existe pas encore) |
| Déploiement test non désiré | Cloudflare → Worker → Delete / Disable route ; site statique sans `apiBase` prod |
| Suspicion de clé exposée | Lucie **roll** la clé dans Stripe (Test) + recolle le nouveau secret CF |
| Paiement test « coincé » | Dashboard Stripe Test → annuler / rembourser la session test |
| Inventaire incohérent | Remettre `AVAILABILITY_CONFIGURED=false` ; ne plus vendre tant que D1 n’est pas corrigé |
| Push Git accidentel de `.dev.vars` | Rotation immédiate des clés Stripe + purge Git (hors scope ici) |

**Production :** tant que `PRODUCTION_UNLOCKED=false` et pas de `sk_live`, il n’y a **rien à « désactiver » côté argent réel**.

---

## 8. Fonctions encore simulées ou non branchées

| Fonction | État |
|----------|------|
| Stripe Checkout réel | Prêt en **test** dès que Lucie colle `sk_test` |
| Atomicité stocks | Code D1 prêt ; base Cloudflare **à créer** (§2.3) |
| MemoryTx | Uniquement tests automatisés locaux |
| **Remboursement automatique** si `paid_no_stock` | **Non implémenté** — alerte + revue Lucie manuelle |
| Appel API refund Stripe | **Non branché** |
| API Rating Postes Canada | **Non branchée** (architecture seulement) |
| Cron expiration réservations | Endpoint prêt ; scheduler CF **pas configuré** |
| Worker / DNS production | **Non créé** |
| `sk_live` / Desjardins | **Bloqué** volontairement |

---

## 9. Bloquants mise en production (liste finale)

Rien de tout ceci n’est optionnel pour un vrai paiement client.

1. **Autorisation écrite** Francis pour tout deploy / `sk_live`  
2. Compte **Cloudflare Lucie** + secrets collés par elle  
3. Inventaire Lucie rempli et confirmé (66 lignes)  
4. D1 créé, migré, peuplé ; `AVAILABILITY_CONFIGURED` seulement après validation  
5. Colis mesurés → `PACKAGE_PROFILES_CONFIGURED`  
6. Tarifs livraison réels (ou free explicite) → `SHIPPING_CONFIGURED` / `FREE_SHIPPING_AUTHORIZED`  
7. Taxes + politiques commerciales → `COMMERCIAL_TERMS_CONFIGURED`  
8. Retirer `ALLOW_CHECKOUT_WITHOUT_SHIPPING` sur le Worker **prod**  
9. Worker **prod** distinct du Worker test (pas `wrangler.test.toml`)  
10. Webhook **live** + `sk_live` collés par Lucie  
11. Décision Lucie sur les cas `paid_no_stock` (remboursement manuel au minimum)  
12. Parcours E2E test réussi (§6) avant tout live  
13. `PRODUCTION_UNLOCKED=true` **en dernier**, jamais avant les points 1–12  

---

## 10. Ordre recommandé avec Lucie (résumé une page)

1. Lucie : Cloudflare login + `wrangler login`  
2. Créer KV `ORDERS_TEST` + D1 `boreales-inventory-test` + coller IDs dans `wrangler.test.toml`  
3. Migrer D1 (`--remote` quand autorisé)  
4. Lucie : Stripe Test → coller `sk_test` + `whsec` dans Secrets CF (**elle seule**)  
5. Francis : autoriser **ou non** `wrangler deploy -c wrangler.test.toml`  
6. Tests §6 (CLI + carte `4242`)  
7. Lucie remplit `INVENTAIRE-LUCIE.csv` + colis + livraison + taxes + politiques  
8. Import stocks + activer flags **un par un** avec son accord  
9. **Stop** — production seulement après §9 complet et nouvel OK Francis  

---

## Documents liés

| Doc | Contenu |
|-----|---------|
| `docs/LUCIE-SECRETS-CLOUDFLARE.md` | Secrets sans les partager |
| `docs/STRIPE-CLI-TEST.md` | Cartes test / CLI |
| `docs/PREPROD-CHECKLIST.md` | Checklist avant prod |
| `docs/INTEGRATION-AUDIT.md` | Intégré vs simulé vs à connecter |
| `docs/INVENTORY-SHIPPING.md` | Stocks / livraison |
| `inventory/README-LUCIE.md` | Comment remplir le CSV |

---

*Fin du guide — aucune étape de ce document n’autorise à elle seule un déploiement ou un paiement réel.*
