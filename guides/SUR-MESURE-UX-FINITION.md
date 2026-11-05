# Finition UX / mobile / a11y — rapport

**Date :** 2026-11-01  
**Lien :** http://127.0.0.1:8766/creations-personnalisees.html#mesure  
**Déploiement / push :** aucun · **Prix / Stripe / mitaines validées :** inchangés

## Corrections réalisées

| Zone | Correction |
|------|------------|
| Mobile | Breakpoints CSS **320 / 390 / 768 / 1440** (375 via cascade ≤390) : grille 2 col., cibles ≥44–48 px, récap empilé, textes non coupés |
| Étapes | Barre de progression cliquable ; étape courante visible ; retour sans perdre les saisies |
| A11y | Labels `for` ; `aria-describedby` / `aria-invalid` ; erreurs `role="alert"` FR/EN ; focus sur champ en erreur |
| Saisie | Plus de rebuild DOM à chaque frappe (focus conservé) ; conversion d’unité conserve les valeurs |
| Panier | Disclaimer explicite : **ajout ≠ commande payée** ; message succès clarifié |
| Récap | Titre « Vérifier avant le panier » |

## Tests réussis

| Suite | Résultat |
|-------|----------|
| Worker (phase-a + sur-mesure + ux) | **43 / 43** |
| `scripts/audit-sur-mesure.mjs` | **33** pass · **0** fail · **1** warn (mobile physique) |

## Problèmes restants

1. **Mobile physique** — non testé sur appareil réel (seul contrôle automatisé / CSS). À valider manuellement sur un téléphone.
2. Validations Lucie des mesures provisoires (hors mitaines) — inchangées, toujours provisoires.
