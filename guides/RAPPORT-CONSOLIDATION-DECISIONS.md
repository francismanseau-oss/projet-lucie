# Rapport — consolidation des décisions Lucie

**Date :** 2026-11-01  
**Périmètre :** documentation seulement — aucun changement prix / catalogue / stocks / paiements / livraison activée.

---

## Décisions déjà acquises

1. Vente au **Canada seulement**  
2. Frais de livraison **payés par le client**  
3. **Postes Canada** et **autobus au Québec** envisagés  
4. **Échanges** acceptés ; **pas de remboursement ordinaire** (sauf obligations légales)  
5. Option **Raynaud** sans supplément  
6. **Cuir noir** ; fourrure recyclée à **couleur variable**  
7. Mitaines : **tour de main** + **longueur de la main**  
8. Prix catalogue : **pas** traités comme nouvellement approuvés (restent à vérifier)

---

## Questions encore ouvertes (Lucie)

Voir `VALIDATION-FINALE-LUCIE.md` :

- Inventaire des 66 (fabriqué / qté / sur demande)  
- Vérification des prix  
- Détails livraison (colis, devis, autobus, ramassage, gratuité)  
- Délais fabrication + cas « payé sans pièce »  
- Taxes (inscription + affichage) — **vérification obligatoire avant activation**  
- Illustrations hors mitaines  
- Essais iPhone / Android  

---

## Contradictions / tensions détectées (signalées, non auto-corrigées dans le code)

| # | Où | Tension | Action doc |
|---|-----|---------|------------|
| 1 | Ancienne `DECISIONS` / checklist livraison | Redemandait oui/non Postes Canada & autobus alors que déjà **envisagés** | Docs alignés ; config shipping **inchangée** (toujours désactivée) |
| 2 | GUIDE / STRIPE `paid_no_stock` | Options listant « rembourser » comme choix courant | Reformulé vers échange / contact ; **politique code/Stripe non modifiée** |
| 3 | Ancienne section taxes + échanges | Redemandait « retours / échanges » alors qu’échanges + non-remboursement ordinaire sont acquis | Retiré des questions répétitives |
| 4 | Inventaire / catalogue | Risque de lire les prix comme « officiels approuvés » | Mention « à vérifier avec Lucie » |
| 5 | Taxes | Silence ou « non inscrite » pourrait être mal lu comme « pas de taxes » | Avertissement explicite : **pas de présomption de dispense** |
| 6 | `shipping-config` pays `CA` | Aligné avec Canada seulement | OK — pas une contradiction |

Aucune règle commerciale **dans le code** n’a été changée automatiquement.

---

## Obstacles réels à la mise en service

1. **Inventaire** non rempli (toujours contact / pending)  
2. **Tarifs livraison** non confirmés → méthodes désactivées  
3. **Taxes** non clarifiées (blocage prudent avant argent réel)  
4. **Stripe / Resend** non branchés en réel (volontaire)  
5. **Prix** non revalidés ligne à ligne avec Lucie  
6. Illustrations hors mitaines provisoires  
7. Mobile réel non validé  

---

## Fichiers touchés

- `docs/DECISIONS-RESTANTES-LUCIE.md` (restructuré A/B/C)  
- `docs/VALIDATION-FINALE-LUCIE.md` (**nouveau**)  
- `docs/LIVRAISON-VALIDATION-LUCIE.md` (checklist alignée)  
- `docs/GUIDE-MISE-EN-SERVICE.md` (liens + § politiques)  
- `docs/INVENTAIRE-VALIDATION-LUCIE.md` (note prix)  
- `docs/RAPPORT-CONSOLIDATION-DECISIONS.md` (ce fichier)  
