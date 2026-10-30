# Liste de vérification — avant mise en production

**Aucun `sk_live` / déploiement prod sans autorisation écrite.**  
Cocher seulement quand c’est vraiment prêt.

## A. Technique (Francis / Virtuose + Lucie)

- [ ] Worker **test** validé (`wrangler.test.toml`) avec `sk_test` uniquement  
- [ ] Parcours Stripe CLI + carte `4242` OK (`docs/STRIPE-CLI-TEST.md`)  
- [ ] Page succès : confirmation **uniquement** via `/api/order-status` (redirect ≠ payé)  
- [ ] Webhooks : completed, async success/fail, expired, refunds ; doublons OK  
- [ ] KV `ORDERS` (prod) **distinct** du KV test  
- [ ] Secrets collés **par Lucie** dans Cloudflare (pas transmis par message)  
- [ ] `checkout-config.js` pointe vers le bon `apiBase` (prod) seulement au go-live  
- [ ] Catalogue 66 prix inchangé / `npm run test:catalog` vert  

## B. Livraison

- [ ] Tarifs réels définis (Postes Canada / ramassage / bus QC…) — **pas** de montant fictif  
- [ ] `SHIPPING_CONFIGURED=true` **seulement** après validation Lucie  
- [ ] Checkout affiche / facture les frais correctement (phase ultérieure)  
- [ ] Adresse CA collectée et processus d’expédition documenté pour Lucie  

## C. Stocks / disponibilité

- [ ] Chaque article vendable a `availability: "available"` confirmé par Lucie  
- [ ] Les pièces « contact » restent non vendables en live  
- [ ] `AVAILABILITY_CONFIGURED=true` seulement après revue stock  
- [ ] Processus de retrait / sold-out après vente  

## D. Taxes (TPS / TVQ)

- [ ] Statut fiscal Lucie clarifié (inscriptions requises ou non)  
- [ ] Affichage prix TTC / HT selon décision  
- [ ] Stripe Tax ou calcul manuel documenté  
- [ ] Factures / reçus conformes  

## E. Confidentialité & comptes

- [ ] Compte Cloudflare au nom de Lucie (idéal) ou accès Francis limité  
- [ ] Politique de confidentialité / mentions paiement à jour  
- [ ] Pas de secrets dans le dépôt Git / Pages  
- [ ] E-mails clients traités selon engagement Lucie  
- [ ] Séparation Stripe Dashboard : Lucie seule sur le financier  

## F. Gates production (Worker)

Ne passer à `true` **que** avec feu vert explicite :

| Variable | Avant go-live |
|----------|----------------|
| `PRODUCTION_UNLOCKED` | `false` → `true` seulement au lancement |
| `SHIPPING_CONFIGURED` | `false` jusqu’à tarifs validés |
| `AVAILABILITY_CONFIGURED` | `false` jusqu’à stocks confirmés |
| `FORCE_TEST_KEYS_ONLY` | **absent** ou `false` sur Worker **prod** (rester `true` sur Worker **test**) |
| `STRIPE_SECRET_KEY` | `sk_live` uniquement sur Worker prod, après checklist |

## G. Go-live (ordre)

1. Feu vert Francis + Lucie  
2. Deploy Worker **prod** (config séparée, pas `wrangler.test.toml`)  
3. Lucie colle `sk_live` + `whsec` prod  
4. Activer gates une fois livraison + stocks + taxes OK  
5. Test carte réelle **1 $** ou article réel contrôlé  
6. Surveiller webhooks + e-mails 24–48 h  

## Hors scope tant que non coché

Vente réelle, pubs, abo, sync cloud, modification prix/photos catalogue.
