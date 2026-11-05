# Audit global — Les Fourrures Boréales

**Date :** 2026-11-01  
**Lien local :** http://127.0.0.1:8766/  
**Déploiement / push :** aucun · Stripe réel / Resend réel : non activés · Prix / mesures Lucie mitaines : inchangés

## Synthèse

| Zone | Verdict |
|------|---------|
| Navigation (10 pages + redirect sur-mesure) | OK — 0 lien/src cassé |
| Boutique 66 produits / photos | OK (54 images uniques partagées) |
| Panier standard + sur-mesure | OK — isolation + prix serveur |
| Créations personnalisées (2 parcours) | OK |
| Sécurité front (secrets) | OK |
| Tests Worker (+ suggestion + UX) | **51 / 51** |
| Audit site global | **17** contrôles OK · **0** critique |

## Corrections réalisées (cette passe)

| Priorité | Problème | Correction | Fichiers |
|----------|----------|------------|----------|
| Important | Message suggestion honeypot / défaut pouvait laisser croire à un **vrai courriel** alors que Resend est souvent en mock | Messages neutres + respect de `mocked` / `message_fr` serveur | `contact-suggestion.js` |
| Important | Fusion qty boutique pouvait collisionner avec une ligne `custom:` même SKU | Ne fusionner que les lignes non-custom ; ajouter `price_cad_cents` | `site.js` |

## Classement des points restants

### Critique
*Aucun détecté.*

### Important
*Aucun bloquant restant après correctifs.*

### Mineur / à planifier
1. **Mobile physique** — non testé sur appareil réel (CSS + audits automatisés seulement).  
2. **Noms panier bilingues** — le libellé boutique est figé à la langue du moment de l’ajout (pas de re-traduction au bascule FR/EN).  
3. **Perf images** — ~11,8 Mo total boutique, médiane ~174 Ko ; quelques PNG plus lourds possibles (optimisation WebP ultérieure).  
4. **Mesures hors mitaines** — toujours provisoires (validation Lucie commerciale).  
5. **Resend / Stripe live** — volontairement non configurés pour la prod réelle.

## Vérifications effectuées

- Accueil, Boutique, Nos créations, Créations personnalisées, À propos, Contact, Panier, Paiement, confirm/annul + redirect `#mesure`
- Menus FR/EN (`data-fr` / `data-en`), `aria-current` page
- 66 prix catalogue = Worker ; photos présentes
- Mélange panier boutique + custom ; qty ; suppression ; prix navigateur ignoré
- Suggestion : validations + messages mock honnêtes
- Pas de `sk_live` / clé Resend en dur dans le front

## Scripts de rejeu

```bat
cd /d C:\Projets\projet-lucie
node scripts\audit-site-global.mjs
node scripts\audit-sur-mesure.mjs
cd worker && node --test test\sur-mesure.test.mjs test\sur-mesure-ux.test.mjs test\phase-a.test.mjs test\suggestion.test.mjs
```

## Objectif « prêt Lucie »

Le site est **cohérent, bilingue et professionnel** pour les validations commerciales finales. Reste : validations Lucie (mesures provisoires, wording), test téléphone réel, activation Resend/Stripe test quand elle le décidera.
