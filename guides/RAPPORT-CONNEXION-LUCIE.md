# Rapport — Connexion initiale de Lucie (inventaire)

**Date :** 2026-11-04  
**Portée :** local seulement · Stripe TEST · aucun déploiement · aucun push · aucun courriel réel

---

## Ce qui est prêt

| Élément | Détail |
|--------|--------|
| Mot de passe temporaire **choisi par Francis** | Script interactif → hash scrypt dans fichier privé gitignoré |
| 1ʳᵉ connexion | Temporaire → écran forcé « Choisissez votre mot de passe » → temporaire mort |
| Mot de passe oublié | Formulaire + lien one-shot ; écriture dans `mail-outbox/` (simulation, **pas** d’envoi Internet) |
| Rester connecté | Cookie HttpOnly + SameSite=Strict ; jeton opaque seulement (jamais le MDP en clair) |
| Anti-bruteforce | Verrouillage ~15 min après 5 échecs |
| Déconnexion | Bouton Quitter |
| Raccourcis **locaux** | Dossier Bureau `Fourrures Boreales - ESSAI LOCAL` (logo + logo/+ vert) |
| Raccourcis **publics Lucie** | **Refusés** tant que les URLs HTTPS publiques ne répondent pas |
| Stripe | TEST only ; LIVE toujours bloqué côté Worker |
| Tests | 21/21 OK (`inventory-auth` + `inventory-admin`, recompte 2026-11-04) |

## Ce qu’il reste à configurer (plus tard)

1. Francis lance le script et saisit **son** temporaire + le courriel de Lucie.  
2. Domaine `lesfourruresboreales.ca` acheté + site / inventaire en HTTPS.  
3. Alors seulement : raccourcis publics (`-Public` + URLs qui répondent).  
4. Brancher un vrai envoi courriel (Resend / autre) — aujourd’hui = boîte locale.  
5. Procédure de récupération si Lucie perd son courriel (hors bande : Francis relance le script temporaire).  
6. Stripe LIVE : **pas maintenant**.

---

## Étapes Francis (une fois)

### 1. Configurer le mot de passe temporaire (vous le tapez)

```bat
cd /d C:\Projets\projet-lucie
node inventory\admin\scripts\configurer-mot-de-passe-temporaire.mjs
```

- Entrez le courriel de Lucie  
- Entrez **deux fois** le mot de passe temporaire que **vous** avez choisi  
- Confirmez avec `oui`  
- Rien n’est écrit en clair ; fichier : `inventory\admin\data\lucie-account.json` (gitignoré)

### 2. Raccourcis d’essai local (déjà possibles)

```bat
powershell -ExecutionPolicy Bypass -File inventory\admin\scripts\creer-raccourcis.ps1
```

→ Bureau : dossier **Fourrures Boreales - ESSAI LOCAL**

### 3. Démarrer l’inventaire

Double-clic **Ajouter du stock (local)**  
ou :

```bat
inventory\admin\demarrer-inventaire.bat
```

Puis : `http://127.0.0.1:8791/`

---

## Première connexion Lucie (très simple)

1. Ouvrir **Ajouter du stock (local)**.  
2. Taper le **mot de passe temporaire** (celui que Francis a configuré).  
3. (Optionnel) cocher **Rester connecté** — seulement après avoir choisi son propre mot de passe ; à la 1ʳᵉ fois le changement est obligatoire d’abord.  
4. À l’écran suivant : choisir **son** mot de passe (deux fois) → **Enregistrer**.  
5. Elle voit les 66 produits et peut utiliser **+** / **−**.  
6. Plus tard : **Mot de passe oublié ?** → son courriel (lien dans `mail-outbox` en local ; vrai courriel plus tard).

---

## Raccourcis publics (bloqués pour l’instant)

```bat
powershell -ExecutionPolicy Bypass -File inventory\admin\scripts\creer-raccourcis.ps1 -Public -PublicBoutiqueUrl "https://…" -PublicInventaireUrl "https://…"
```

Si les adresses ne répondent pas en HTTPS → **REFUS**, aucun raccourci Lucie créé. C’est voulu.

---

## Fichiers privés (ne jamais committer)

- `inventory/admin/data/lucie-account.json`  
- `inventory/admin/data/lucie-sessions.json`  
- `inventory/admin/data/mail-outbox/`  
- `inventory/admin/data/lucie-inventory.json`

## Récupération si Lucie perd son courriel

Francis relance le script de mot de passe temporaire (écrasement confirmé par `oui`), donne le nouveau temporaire à Lucie oralement / hors ligne, puis elle choisit à nouveau son mot de passe personnel.

— Virtuose
