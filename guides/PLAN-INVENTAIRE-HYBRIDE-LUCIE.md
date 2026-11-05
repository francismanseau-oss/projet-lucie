# Plan — inventaire hybride (créations déjà faites + sur commande)

**Date :** 2026-11-01  
**Statut :** hybride / délais **en attente Lucie** ; **préparation admin locale** autorisée (2026-11-01) — voir `RAPPORT-INVENTAIRE-ADMIN-LOCAL.md`  
**Amendement Francis (2026-11-01) :** le mode hybride stock → sur commande → indisponible doit être **prévu dans l’architecture dès la V1** (activation selon Lucie)  
**Interdit pour l’instant :** inventer `qty_on_hand`, vente auto, admin public sans auth, deploy / push, Stripe/Resend live

---

## 0. Précisions Lucie (contexte, pas des stocks)

Lucie a déjà des pièces fabriquées (surtout enfants), vend régulièrement, puis refabrique.

Volumes de vente **habituels** cités (hommes ~3–4 paires mitaines, femmes ~20, enfants très demandés) = **description d’activité**, **pas** l’inventaire actuel.  
→ **Ne jamais** les copier dans `qty_on_hand` ni en prévisions garanties.

État technique actuel (à conserver jusqu’à activation) :

| Élément | Valeur |
|---------|--------|
| Quantités | `qty_on_hand = null` |
| Boutique | `availability = contact` |
| Inventaire | `fulfillment_type = pending_lucie` |
| Checkout prod stocks | `AVAILABILITY_CONFIGURED = false` |

---

## 1. Mitaines renard (rappel)

| SKU | Prix | Action |
|-----|------|--------|
| `mitaines-m-renard` | 140 $ | Carte **séparée** |
| `mitaines-m-l-renard` | 140 $ | Carte **séparée** |

Photos différentes → pas de fusion. Pas de sélecteur S/M/L/XL. Suivi Lucie : `VALIDATION-FINALE-LUCIE.md` §2b.

---

## 2. Mapping métier ↔ architecture existante

### Ce que Lucie décrit → types déjà prévus

| Besoin Lucie | Type déjà dans D1 / `inventory.json` | Comportement prévu |
|--------------|--------------------------------------|--------------------|
| **A. Déjà fabriqué** (+ quantité réelle) | `unique_stock` + `qty_on_hand` entier + `lucie_confirmed` | Réservation atomique → commit au paiement confirmé |
| **B. Sur commande** | `made_to_order` + `lucie_confirmed` | Pas de décrément stock ; délai / matériaux = notes Lucie (pas de date auto) |
| **C. Temporairement indisponible** | **Partiellement** : `pending_lucie` ou `lucie_confirmed=false` bloque la vente | Manque un libellé clair « indisponible » + message client « contacter Lucie » |

### Comportement hybride cible (architecture **V1**, activation Lucie)

Fonctionnement souhaité (confirmé Francis, à valider avec Lucie) :

| Situation | Comportement boutique / checkout |
|-----------|----------------------------------|
| `qty_on_hand` disponible (ex. 5) | Achat **immédiat** (réservation atomique) |
| `qty_on_hand` = 0 **et** Lucie autorise la fabrication | Proposer **fabrication sur commande** automatiquement |
| Fabrication proposée | Afficher le **délai selon ses indications** (jamais inventer une date) |
| Fabrication **désactivée** par Lucie | **Temporairement indisponible** (contact possible, pas de vente auto) |

Aujourd’hui le schéma n’a qu’**un** `fulfillment_type` exclusif par SKU — insuffisant pour ce flux.

**Exigence V1 (architecture, pas activation) :** prévoir dès la conception des champs / règles du type :

- stock physique (`qty_on_hand`, réservations) ;
- drapeau Lucie « j’accepte la fabrication si stock à 0 » (ex. `accepts_made_to_order`) ;
- texte / délai de fabrication **fourni par Lucie** (ex. `mto_lead_time_text`, nullable — jamais auto-promis) ;
- état « temporairement indisponible » explicite si fabrication off et stock 0 (ou drapeau dédié).

| | Décision |
|--|----------|
| **Modèle de données V1** | Hybride **sur la même fiche produit** (pas reporter en V2) |
| **Activation commerciale** | Seulement quand Lucie a confirmé sa façon de gérer commandes + fabrication + quantités réelles |
| **En attendant Lucie** | Aucune Phase 1 code ; état actuel `pending_lucie` / `qty null` / `contact` inchangé |

Détail d’implémentation (noms de colonnes, migration) : **après** réponse Lucie — pas avant.

---

## 3. Déjà préparé (ne pas reconstruire)

### Données

- `inventory/inventory.json` — 66 lignes, `qty_on_hand: null`, `pending_lucie`
- `inventory/INVENTAIRE-LUCIE.csv` + `README-LUCIE.md`
- Schéma D1 : `inventory`, `reservations`, `reservation_lines`, `stock_alerts`

### Logique anti-survente (tests mocks OK)

```
checkout → reserve (held, TTL 30 min) → Stripe
  ├─ webhook payé (1 seule fois via KV evt:) → commit (qty_on_hand − n)
  ├─ doublon webhook → ignored (duplicate)
  ├─ annulation / TTL → release
  └─ payé sans stock → paid_no_stock + alerte (pas de 2ᵉ décrément magique)
```

- **D1** (ou MemoryTx en test) pour stocks — **pas KV**
- **KV `ORDERS`** pour idempotence webhooks Stripe uniquement
- Gates : `AVAILABILITY_CONFIGURED`, `SHIPPING_CONFIGURED`, etc.

### Manquant aujourd’hui

| Besoin | État |
|--------|------|
| Interface téléphone Lucie (admin) | **Absente** (CSV manuel seulement) |
| Auth admin solide | **Absente** |
| Historique des changements d’inventaire | **Absent** (pas de table `inventory_audit`) |
| Seuil stock bas + alerte Lucie | **Absent** (configurable non branché) |
| Statut explicite « indisponible temporaire » | **À préciser** (V1 : mode + message) |
| Délai MTO structuré | Notes libres seulement — OK si on **n’affiche pas** de date promise |
| Sync CSV ↔ D1 en un clic | Processus manuel Francis/Virtuose |
| Boutique affichant stock / MTO | Toujours `contact` — volontaire |

---

## 4. Risques commandes simultanées / Stripe (déjà anticipés)

| Risque | Mitigation existante | À renforcer à l’activation |
|--------|----------------------|----------------------------|
| Deux clients, dernier exemplaire | `UPDATE … WHERE (qty_on_hand - qty_reserved) >= ?` | Activer D1 réel + tests concurrence |
| Webhook Stripe en double | KV `evt:{id}` → `duplicate` | Garder + ne jamais `commit` si déjà `committed` |
| Paiement annulé / expiré | `release` / status reservation | Vérifier parcours UI + webhook `expired` |
| Remboursement | Event loggé ; **pas** de restock auto aujourd’hui | Décision Lucie : restock manuel via admin |
| Décrément ×2 même paiement | Idempotence commit + evt | Conserver tels quels |
| `paid_no_stock` | Alerte + statut | Processus humain (échange / contact) — déjà dans politiques |

---

## 5. Interface Lucie (téléphone) — proposition V1

**Principe :** pas de jargon (pas « fulfillment », « D1 », « SKU » en titre).  
**Auth :** obligatoire (ex. Cloudflare Access / mot de passe fort + session, ou magic link) — **jamais** d’URL admin publique.

### Écrans simples

1. **Liste** — photo miniature, nom, pastille : *En stock (n)* / *Sur commande* / *Pas dispo* / *À classer*  
2. **Fiche produit** — actions en gros boutons :  
   - « J’en ai combien ? » → nombre  
   - « J’en ai fabriqué +1 / +2… » → ajoute à la quantité  
   - « Corriger le nombre » → saisie + **confirmation**  
   - « Si je n’en ai plus : j’accepte de fabriquer » **oui/non** (hybride)  
   - « Délai de fabrication (texte) » — ex. « environ 2 semaines » (vide = pas d’affichage de délai)  
   - « Indisponible pour l’instant » (coupe vente + fabrication)  
3. **Confirmation** avant chaque changement important (« Passer de 3 à 0 ? »)  
4. **Historique** — « Hier 14 h : mitaines… 2 → 1 (vente) » / « +2 (Lucie) »

### Technique suggérée (après validation)

- API Worker authentifiée : `GET/PATCH /api/admin/inventory/:id`  
- Écriture **D1** + ligne `inventory_audit`  
- Option : miroir périodique vers `inventory.json` pour backup (pas source de vérité en prod)

---

## 6. Automatisation (après stocks Lucie + gates)

| Fonction | Comportement |
|----------|--------------|
| Vente confirmée | Déjà : commit une fois |
| Stock faible | Nouveau : si `qty_on_hand - qty_reserved <= seuil` → courriel/Resend mock puis réel **à Lucie** (seuil **choisi par Lucie**, pas inventé) |
| Réappro | Lucie tape « +n » dans l’admin ; pas d’auto-prévision ventes |
| Sur mesure | Ligne `custom` : prix catalogue ; stock : `skip_inventory` aujourd’hui — à clarifier : MTO toujours, ou lier au SKU boutique si `unique_stock` |

**Sur mesure vs stock boutique :** aujourd’hui le custom **ne réserve pas** le stock boutique (`skip_inventory`).  
Décision minimale Lucie : une commande sur mesure **consomme-t-elle** une pièce déjà fabriquée du même SKU, ou est-elle **toujours** fabrication ?

---

## 7. Plan d’implémentation concret (phases)

### Phase 0 — maintenant (ce document) — **en cours / en attente Lucie**

Plan amendé (hybride V1). **Pas de Phase 1** tant que Lucie n’a pas confirmé sa gestion commandes / fabrication.

### Phase 1 — données & règles (sans vente live) — **bloquée**

1. Étendre le schéma pour le **hybride** : stock + `accepts_made_to_order` + délai texte Lucie + indisponible.  
2. Règles `canSellLine` : qty > 0 → réserve ; qty = 0 + fabrication OK → MTO ; sinon → indisponible.  
3. Table `inventory_audit` (qui, quand, avant/après, motif).  
4. Documenter le flux pour Lucie en français simple.  
5. Garder `qty_on_hand = null` jusqu’à saisie réelle ; **aucun** flag commercial allumé.

### Phase 2 — admin mobile Lucie (auth)

1. Auth (Cloudflare Access recommandé — peu de code, bon pour téléphone).  
2. UI liste + fiche + confirmation + historique.  
3. Tests : correction qty, +fabrication, passage indisponible, refus sans auth.

### Phase 3 — brancher checkout (toujours test d’abord)

1. Import D1 depuis saisies Lucie.  
2. `AVAILABILITY_CONFIGURED=true` **seulement** sur Worker test + stocks confirmés.  
3. Scénarios : concurrence, webhook double, annulation, `paid_no_stock`.  
4. Alerte stock bas (seuil Lucie).

### Phase 4 — production

1. Livraison + taxes + politiques déjà validées.  
2. `PRODUCTION_UNLOCKED` + clés live — **autre mandat**.

---

## 8. Décisions minimales demandées à Lucie

1. Confirmer le flux hybride : stock > 0 → achat immédiat ; stock 0 + fabrication OK → sur commande ; fabrication off → indisponible.  
2. Pour quels produits (tous / certains / enfants seulement) elle **autorise** la fabrication quand le stock est à 0.  
3. Comment elle veut formuler les **délais** (texte libre par produit ou phrase unique).  
4. Quantités **réelles** actuelles (jamais les volumes de vente habituels).  
5. Mitaines renard M vs M-L : même modèle ou deux ? (§2b fiche validation).  
6. Sur mesure : consomme le stock boutique du même SKU **oui/non**.  
7. Seuil « stock bas » — **chiffre Lucie**, pas inventé.  
8. Remboursement Stripe : **remettre** l’unité en stock **oui/non** (manuel V1 OK).

---

## 9. Critères de reprise (après réponse Lucie)

Avant Phase 1 code :

- [x] Francis : hybride stock → MTO → indisponible **dans l’architecture V1**  
- [ ] Lucie confirme sa façon de gérer commandes + fabrication  
- [ ] Admin derrière auth (pas d’URL ouverte)  
- [ ] Volumes de vente habituels **ne** deviennent **pas** des stocks  
- [ ] Mitaines renard restent 2 cartes  
- [ ] Ordre des phases 1 → 2 → 3 respecté ; **aucun** deploy / push / vente live sans mandat

---

## 10. Références code / docs

- `docs/INVENTORY-SHIPPING.md`  
- `worker/migrations/0001_inventory.sql`  
- `worker/src/inventory-core.js`, `inventory.js`, `store/d1-store.js`  
- `inventory/README-LUCIE.md`  
- `docs/VALIDATION-FINALE-LUCIE.md` (§2b mitaines renard)
