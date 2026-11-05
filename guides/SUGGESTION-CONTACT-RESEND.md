# Suggestions Contact → Gmail Lucie (Resend)

**État :** code prêt en local · **aucun compte Resend créé par Virtuose** · **aucun déploiement**.

## Limites Resend (plan gratuit)

| Limite | Valeur |
|--------|--------|
| Courriels / mois | 3 000 |
| Courriels / jour | 100 (UTC) |
| Domaines vérifiés | 3 |
| Taille e-mail + pièces jointes | 40 Mo max (après Base64) |
| Prix | 0 $ (tant que dans le gratuit) |

Notre formulaire : max **3 images × 5 Mo** ≈ largement sous 40 Mo.

## Expéditeur (important)

Resend **n’envoie pas** depuis `gmail.com`. Il faut :

1. Un **domaine** que Lucie (ou Francis) contrôle (ex. site Fourrures Boréales), **ou**  
2. Pendant les essais Resend uniquement : l’adresse d’onboarding Resend (limitée — destinataires souvent restreints).

**Destinataire** (déjà prévu) : `luciegosselin852@gmail.com`  
**Reply-To** : le courriel du client (Lucie peut répondre directement).

## Ce que Lucie devra faire pour activer l’envoi réel

1. Créer un compte **gratuit** sur [resend.com](https://resend.com) (quand Francis / Lucie l’autorisent).  
2. **Domains** → **Add Domain** → entrer un domaine / sous-domaine (ex. `mail.votredomaine.com`).  
3. Copier les enregistrements DNS (DKIM / SPF) chez l’hébergeur du nom de domaine.  
4. Attendre la vérification (souvent ~15 min, parfois jusqu’à 72 h).  
5. **API Keys** → créer une clé → coller **uniquement** dans Cloudflare Worker (secret `RESEND_API_KEY`), jamais dans le site.  
6. Définir l’expéditeur, ex. :  
   `Les Fourrures Boréales <suggestions@mail.votredomaine.com>`  
   → secret ou variable `SUGGESTION_FROM_EMAIL`.  
7. Mettre `SUGGESTION_MOCK=false` (ou retirer le mock) sur le Worker déployé.  
8. Vérifier un envoi test depuis la page Contact.

**Virtuose ne crée pas le compte et ne déploie pas** sans autorisation.

## Mode local (déjà actif)

Sans clé Resend / avec `SUGGESTION_MOCK=true` : le Worker **accepte** la suggestion et répond OK, **sans** envoyer de courriel. Utile pour tester le formulaire.

## Rechange HEIC

Si la conversion HEIC → JPEG échoue dans le navigateur : message clair demandant d’exporterer en JPEG (Photos iPhone) ou de choisir JPG/PNG/WEBP. Le serveur **refuse** tout HEIC non converti.
