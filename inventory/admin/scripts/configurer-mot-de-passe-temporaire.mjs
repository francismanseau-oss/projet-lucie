/**
 * Configuration sécurisée du mot de passe TEMPORAIRE de Lucie.
 * - Saisie interactive (écho masqué) — Francis choisit le mot de passe
 * - Stockage haché uniquement dans inventory/admin/data/lucie-account.json (gitignoré)
 * - Aucun mot de passe écrit dans les logs ni dans Git
 *
 * Usage :
 *   node inventory/admin/scripts/configurer-mot-de-passe-temporaire.mjs
 */

import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { hashPassword, validatePasswordPlain, MIN_PASSWORD_LENGTH } from "../lib/password-crypto.js";
import { saveAccount, loadAccount, ensureAccountDirs, accountFilePath } from "../lib/account-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Masque l’écho (étoiles) — compatible Windows. */
function askHidden(rl, question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const muted = (buf) => {
      const s = buf.toString("utf8");
      for (const ch of s) {
        if (ch === "\u0003") process.exit(1);
      }
    };
    stdin.on("data", muted);
    rl.stdoutMuted = true;
    const origWrite = rl._writeToOutput?.bind(rl);
    if (rl._writeToOutput) {
      rl._writeToOutput = function (str) {
        if (rl.stdoutMuted && str && !str.includes(question)) {
          origWrite?.("*".repeat(String(str).replace(/\r?\n/g, "").length) || "");
          return;
        }
        origWrite?.(str);
      };
    }
    rl.question(question, (value) => {
      rl.stdoutMuted = false;
      if (rl._writeToOutput && origWrite) rl._writeToOutput = origWrite;
      stdin.removeListener("data", muted);
      process.stdout.write("\n");
      resolve(value);
    });
  });
}

async function main() {
  ensureAccountDirs(adminRoot);
  const existing = loadAccount(adminRoot);

  console.log("");
  console.log("=== Mot de passe temporaire Lucie ===");
  console.log("Le mot de passe ne sera PAS enregistré en clair.");
  console.log(`Fichier privé : ${accountFilePath(adminRoot)}`);
  console.log(`Minimum : ${MIN_PASSWORD_LENGTH} caractères, sans espaces.`);
  console.log("");

  if (existing?.password_hash) {
    console.log("Un compte existe déjà.");
    console.log(
      existing.temp_password_active
        ? "État : temporaire encore actif (changement 1ʳᵉ connexion en attente)."
        : "État : Lucie a déjà un mot de passe personnel.",
    );
    console.log("");
  }

  const rl = createRl();
  try {
    const emailRaw = await ask(rl, "Courriel officiel de Lucie : ");
    const email = String(emailRaw || "").trim().toLowerCase();
    if (!email.includes("@") || email.length < 5) {
      console.error("Courriel invalide. Abandon — rien n’a été enregistré.");
      process.exit(1);
    }

    const p1 = await askHidden(rl, "Mot de passe temporaire : ");
    const check = validatePasswordPlain(p1);
    if (!check.ok) {
      console.error(check.error);
      process.exit(1);
    }
    const p2 = await askHidden(rl, "Confirmez le mot de passe temporaire : ");
    if (p1 !== p2) {
      console.error("Les deux saisies ne correspondent pas. Abandon.");
      process.exit(1);
    }

    const confirm = await ask(
      rl,
      existing?.password_hash
        ? "Écraser le compte existant et remettre un temporaire ? (oui/non) : "
        : "Enregistrer ce mot de passe temporaire haché ? (oui/non) : ",
    );
    if (!/^oui$/i.test(String(confirm).trim())) {
      console.log("Annulé — aucun fichier modifié.");
      process.exit(0);
    }

    const hashed = await hashPassword(p1);
    const account = {
      version: 1,
      email,
      password_algo: hashed.algo,
      password_salt: hashed.salt,
      password_hash: hashed.hash,
      must_change_password: true,
      temp_password_active: true,
      password_changed_at: null,
      failed_attempts: 0,
      locked_until: null,
      reset_tokens: [],
      created_at: existing?.created_at || new Date().toISOString(),
      note_fr:
        "Fichier privé. Ne jamais committer. Le temporaire devient inutilisable après le premier changement par Lucie.",
    };
    const fp = saveAccount(adminRoot, account);

    console.log("");
    console.log("OK — compte temporaire enregistré (hash seulement).");
    console.log(`Fichier : ${fp}`);
    console.log(`Courriel : ${email}`);
    console.log("Lucie devra changer ce mot de passe à sa première connexion.");
    console.log("");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Erreur :", err.message || err);
  process.exit(1);
});
