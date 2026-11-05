# Sur mesure — à confirmer avec Lucie

**Statut :** mesures proposées, pas figées.  
**Prix :** déjà figés = catalogue Boutique (`catalog/products.json`, 66 SKU). Ne pas saisir de prix ici.

**Tableau de validation détaillé (actuel vs proposé +) :**  
→ `docs/SUR-MESURE-TABLEAU-VALIDATION-LUCIE.md`  
**Priorité :** mitaines d’abord, puis illustrations FR/EN mitaines seulement.

Config technique : `catalog/sur-mesure-config.json` (miroir Worker : `worker/src/sur-mesure-config.json`).

## Mensurations (cocher / corriger)

### Mitaines — VALIDÉ Lucie 2026-11-01
- [x] Tour de main (paume, sans pouce)
- [x] Longueur de la main (pli du poignet → bout du majeur)
- [x] ~~Longueur du majeur~~ — retiré
- [x] ~~Tour de poignet / longueur du pouce~~ — non ajoutés
- Brief illus : `docs/SUR-MESURE-BRIEF-MITAINES-ILLUS.md`

### Pantoufles / mukluks
- [ ] Longueur du pied
- [ ] Largeur du pied
- [ ] Autre : _______________

### Chapeaux / cache-oreilles
- [ ] Tour de tête
- [ ] Autre : _______________

### Semelles
- [ ] Longueur du pied
- [ ] Largeur (optionnelle) — garder ?
- [ ] Autre : _______________

### Foulards — PROVISOIRE (dans le formulaire)
- [ ] Longueur souhaitée
- [ ] Largeur souhaitée
- [ ] Ou revenir aux commentaires seulement : _______________

## Options

- [ ] Option Raynaud (mitaines, **sans frais**) — wording OK ?
- [ ] Cuir noir seulement — confirmer
- [ ] Note « couleurs de fourrure recyclée variables » — OK ?

## Périmètre produits

- [ ] Les **66** articles Boutique sont commandables en sur-mesure
- [ ] Sinon, lister les SKU **non configurables** (afficher « contact » seulement) : _______________

## Après validation Lucie

1. Mettre `awaiting_lucie_validation: false` sur les catégories validées  
2. Ajuster les `fields` dans `sur-mesure-config.json`  
3. Recopier vers `worker/src/sur-mesure-config.json`  
4. Relancer les tests Worker (`node --test test/sur-mesure.test.mjs`)
