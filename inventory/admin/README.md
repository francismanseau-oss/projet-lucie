# Admin inventaire — local seulement

Interface simple pour Lucie : connexion sécurisée, photo, nom, N°, **+** / **−**, saisie, historique.

## Première mise en place (Francis)

```bat
cd /d C:\Projets\projet-lucie
node inventory\admin\scripts\configurer-mot-de-passe-temporaire.mjs
powershell -ExecutionPolicy Bypass -File inventory\admin\scripts\creer-raccourcis.ps1
inventory\admin\demarrer-inventaire.bat
```

Ouvrir : `http://127.0.0.1:8791/`

Rapport : `guides/RAPPORT-CONNEXION-LUCIE.md`

## Règles

- Mot de passe **haché** dans `data/lucie-account.json` (gitignoré) — jamais en clair dans Git.
- Essais Francis : le mot de passe de test peut servir plusieurs fois. Le bouton « Changer le mot de passe » est dans l’inventaire, sans ouverture forcée.
- Avant la livraison à Lucie : `node inventory\admin\scripts\reactiver-changement-mot-de-passe.mjs --oui` (remet l’obligation, sans changer le hash).
- Oubli = simulation locale (`data/mail-outbox/`) — pas d’envoi réel pour l’instant.
- Raccourcis publics Lucie : seulement si URLs HTTPS répondent (`-Public`).
- Vente boutique : toujours fermée ici ; Stripe **TEST** uniquement côté Worker.

## Tests

```bat
cd /d C:\Projets\projet-lucie\worker
node --test test\inventory-auth.test.mjs test\inventory-admin.test.mjs
```
