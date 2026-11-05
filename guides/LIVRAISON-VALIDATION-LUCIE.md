# Livraison — préparation pour Lucie

**État actuel :** aucune méthode de livraison n’est activée.  
**Aucun tarif ni délai n’a été inventé.**  
Les frais de livraison seront **payés par le client**, une fois confirmés.  
Statut boutique / admin par défaut : **Livraison à confirmer**.

Fichier technique (ne pas activer sans Lucie) : `shipping/shipping-config.json` (v2 — champs Postes Canada / autobus préparés, `enabled: false`).  
Admin commandes local : `docs/RAPPORT-ADMIN-COMMANDES-LIVRAISON.md`

---

## 1. Postes Canada

| Point | Situation |
|-------|-----------|
| Activé sur le site | **Non** |
| Source des tarifs | Non définie (`unset`) |
| Grille de prix | Vide |
| Poids / dimensions colis | À mesurer par Lucie |

### Ce que Lucie peut choisir plus tard

1. **Grille manuelle** — Lucie note des frais réels (ex. selon poids / région), après avoir pesé et mesuré ses colis typiques.  
2. **API Postes Canada** — branchement technique seulement quand Lucie a un compte / accès Rating et a validé les montants.

### Comment confirmer les frais réels avant mise en service

1. Préparer 2–3 colis types (petit / moyen / grand) : poids (g) + longueur × largeur × hauteur (cm).  
2. Demander un **devis réel** Postes Canada (comptoir, site, ou compte d’affaires).  
3. Noter le montant CAD pour des destinations types (ex. Abitibi, Montréal, ailleurs au Canada).  
4. Remplir une grille validée **ou** brancher l’API — **pas les deux à la fois sans contrôle**.  
5. Seulement ensuite : demander à Virtuose d’activer Postes Canada dans la config (mandat explicite).

---

## 2. Autobus au Québec

| Point | Situation |
|-------|-----------|
| Activé sur le site | **Non** |
| Couverture prévue | Québec |
| Frais | Toujours **validation manuelle Lucie** par commande |
| Montant par défaut | Aucun |

### Comment confirmer avant mise en service

1. Lister les compagnies / points de chute que Lucie utilise vraiment.  
2. Noter comment le client paie (inclus Stripe vs réglé hors site — à décider).  
3. Décrire le délai typique **sans promesse fixe** si non garanti.  
4. Activer seulement quand Lucie est à l’aise pour **valider chaque commande** (ou une règle claire écrite).

---

## 3. Autres options (plus tard)

| Option | État |
|--------|------|
| Ramassage | Désactivé — lieu à confirmer si Lucie le souhaite |
| Livraison gratuite | **Non** autorisée tant que Lucie ne l’a pas décidé |

---

## 4. Règles techniques (rappel)

- `SHIPPING_CONFIGURED` reste à **false** jusqu’à validation Lucie.  
- Aucune méthode non vérifiée ne sera activée.  
- Le client paie les frais ; on n’invente pas de montant « pour que ça marche ».

## 5. Déjà acquis / encore ouvert

**Acquis :** vente Canada seulement · frais payés par le client · Postes Canada **et** autobus QC **envisagés**.

**Encore ouvert (fiche Lucie) :** voir [VALIDATION-FINALE-LUCIE.md](./VALIDATION-FINALE-LUCIE.md) §3 — colis, devis réels, compagnies d’autobus, ramassage, gratuité.

Ne pas réactiver de méthode tant que les montants réels ne sont pas confirmés.  

