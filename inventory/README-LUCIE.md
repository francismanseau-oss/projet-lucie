# Inventaire — à remplir par Lucie

Fichiers :

| Fichier | Usage |
|---------|--------|
| `INVENTAIRE-LUCIE.csv` | Tableau simple (Excel / Sheets) |
| `inventory.json` | Même données pour le Worker (généré depuis le catalogue) |

## Règles

1. **Ne pas inventer** de quantité : laisser `qty_on_hand` vide tant que ce n’est pas compté.
2. **Ne pas changer** les prix (colonne absente volontairement).
3. Pour chaque article, choisir `fulfillment_type` :

| Valeur | Signification |
|--------|----------------|
| `pending_lucie` | Pas encore classé (défaut) — **non vendable** en production |
| `unique_stock` | En stock / pièce limitée — saisir `qty_on_hand` (ex. `1`) |
| `made_to_order` | Fabriqué sur commande — `qty_on_hand` peut rester vide |

4. Mettre `lucie_confirmed` à `true` seulement quand la ligne est validée.
5. Renvoyer le CSV rempli à Francis / Virtuose pour import — **sans** activer les ventes réelles tant que livraison + checklist prod ne sont pas OK.

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
