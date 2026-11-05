# Rapport — Tarifs de livraison définitifs (Lucie)

**Date :** 2026-11-04  
**Stripe TEST · aucun déploiement · aucun push**

## Tarifs confirmés

| Option | Prix | Ordre d’affichage | Délai | Notes client |
|--------|------|-------------------|-------|--------------|
| **Express Bus** | **18 $ / commande** | **1er** si QC desservi | 1–2 j. ouvrables | Récupération **obligatoire** en dépôt |
| **Postes Canada** | **18 $ / commande** | 2e | 2–5 j. ouvrables | Mode Postes Canada (boîte / casier / etc.) — **pas** de promesse « à la porte » |
| Purolator | — | Exclu | — | Absent des choix |

Les 18 $ s’appliquent une seule fois par commande (1, 5, 10 articles… même prix). Aucun supplément auto selon la quantité. Paiement Stripe unique (articles + livraison).

## Fichiers touchés

- `shipping/shipping-config.json` + `worker/src/shipping-config.json` (v4)
- `worker/src/shipping.js`, `shipping-quote-service.js`
- `paiement.html`, `panier.html` (+ copies `docs/`)
- Tests livraison / simulation / admin

## Conservé

- Politique garantie (`politique-garantie.html`) + photos pour réclamations
- Pas de mention des coûts réels / économies de Lucie

## Tests

| Exécutés | Réussis | Échoués | Ignorés |
|----------|---------|---------|---------|
| **54** | **54** | **0** | **0** |

— Virtuose
