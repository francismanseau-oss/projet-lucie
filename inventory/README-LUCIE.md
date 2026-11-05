# Inventaire — à remplir par Lucie

Fichiers :

| Fichier | Usage |
|---------|--------|
| `INVENTAIRE-LUCIE.csv` | Tableau simple (Excel / Sheets) |
| `inventory.json` | Même données pour le Worker (généré depuis le catalogue) |

## Règles

1. **Ne pas inventer** de quantité : laisser `qty_on_hand` vide tant que ce n’est pas compté.
2. **Objectif minimum** (`min_stock_target`, défaut **3**) = seuil d’alerte provisoire — **ce n’est pas** le stock disponible. Ne jamais copier ce 3 dans `qty_on_hand` sans comptage réel.
3. **Ne pas changer** les prix (colonne absente volontairement).
4. Pour chaque article, choisir `fulfillment_type` :

| Valeur | Signification |
|--------|----------------|
| `pending_lucie` | Pas encore classé (défaut) — **non vendable** en production |
| `unique_stock` | En stock / pièce limitée — saisir `qty_on_hand` (ex. `1`) |
| `made_to_order` | Fabriqué sur commande — `qty_on_hand` peut rester vide |

5. Mettre `lucie_confirmed` à `true` seulement quand la ligne est validée.
6. Renvoyer le CSV rempli à Francis / Virtuose pour import — **sans** activer les ventes réelles tant que livraison + checklist prod ne sont pas OK.

Interface locale (PC, mot de passe) : voir `inventory/admin/README.md`.

## Exemple de lignes (illustratif — ne pas copier comme stock réel)

```text
product_id,...,fulfillment_type,qty_on_hand,...,lucie_confirmed
chapeau-dame-m-l-coyote,...,unique_stock,1,...,true
mukluk-exemple,...,made_to_order,,délai 2 semaines,true
```

Régénérer le gabarit vide (écrase les saisies non sauvegardées ailleurs) :

```bat
node inventory/generate-from-catalog.mjs
```
