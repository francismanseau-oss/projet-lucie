/**
 * Avant la livraison à Lucie : remet l'obligation de choisir un mot de passe
 * à la prochaine connexion. Ne change pas le hash ni le mot de passe actuel.
 *
 *   node inventory/admin/scripts/reactiver-changement-mot-de-passe.mjs --oui
 *
 * Sans --oui, le fichier n'est pas modifié.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccount, saveAccount } from "../lib/account-store.js";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oui = process.argv.includes("--oui");
const acc = loadAccount(adminRoot);

if (!acc?.password_hash || !acc?.password_salt) {
  console.error("Compte absent. Rien n'a été modifié.");
  process.exit(1);
}

if (!oui) {
  console.log("Aperçu seulement. Le mot de passe et le hash ne sont pas touchés.");
  console.log("Obligation actuelle :", acc.must_change_password ? "oui" : "non");
  console.log("Pour réactiver avant la livraison à Lucie, relancez avec --oui");
  process.exit(0);
}

const hashBefore = acc.password_hash;
const saltBefore = acc.password_salt;
acc.must_change_password = true;
acc.temp_password_active = true;
acc.password_hash = hashBefore;
acc.password_salt = saltBefore;
acc.note_fr =
  "Fichier privé. Changement obligatoire réactivé pour la livraison. Le hash n'a pas été modifié par ce script.";
saveAccount(adminRoot, acc);

const after = loadAccount(adminRoot);
if (after.password_hash !== hashBefore || after.password_salt !== saltBefore) {
  console.error("Le hash a changé. Arrêt.");
  process.exit(1);
}
console.log("Obligation de changement réactivée. Hash inchangé.");
