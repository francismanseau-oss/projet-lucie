# Resend — procédure simple pour connecter (plus tard)

**Aujourd’hui :** le formulaire Contact / suggestion fonctionne en **mode essai** (pas d’envoi réel si aucune clé).  
**Ce document :** comment Lucie branchera Resend **quand elle le décidera**.  
**Virtuose ne crée pas le compte et n’active rien** sans nouvel ordre.

Détail technique : `SUGGESTION-CONTACT-RESEND.md`.

---

## En 8 étapes

1. Créer un compte gratuit sur [resend.com](https://resend.com).  
2. Ajouter un **domaine** (ex. sous-domaine du site des Fourrures Boréales).  
   - Resend n’envoie **pas** depuis une adresse `@gmail.com`.  
3. Copier les enregistrements DNS (SPF / DKIM) chez l’hébergeur du nom de domaine.  
4. Attendre que Resend marque le domaine **vérifié**.  
5. Créer une **clé API** dans Resend.  
6. Lucie colle la clé **elle-même** dans Cloudflare Worker (secret `RESEND_API_KEY`) — **jamais** dans le site public, jamais dans un message à Francis.  
7. Définir l’expéditeur, ex. `Les Fourrures Boréales <suggestions@…son-domaine…>`.  
8. Faire **un envoi test** depuis la page Contact, puis vérifier la boîte Gmail de Lucie.

Destinataire prévu (déjà dans le projet) : Gmail de Lucie.  
Réponse : Lucie peut répondre directement au client (Reply-To = e-mail du client).

---

## Ce qu’il ne faut pas faire

- Mettre la clé API dans le HTML / JavaScript du site  
- Activer l’envoi réel avant le domaine vérifié  
- Demander à Virtuose de « coller la clé » à sa place  

---

## Checklist Lucie

- [ ] Compte Resend créé  
- [ ] Domaine vérifié  
- [ ] Clé collée dans Cloudflare (par Lucie)  
- [ ] Expéditeur défini  
- [ ] Un message test reçu dans Gmail  
