/**
 * Compte Lucie — fichier privé gitignoré.
 * Contient uniquement des hashes, jamais le mot de passe en clair.
 */
import fs from "node:fs";
import path from "node:path";

export function accountFilePath(adminRoot) {
  return path.join(adminRoot, "data", "lucie-account.json");
}

export function sessionsFilePath(adminRoot) {
  return path.join(adminRoot, "data", "lucie-sessions.json");
}

export function outboxDir(adminRoot) {
  return path.join(adminRoot, "data", "mail-outbox");
}

export function ensureAccountDirs(adminRoot) {
  const data = path.join(adminRoot, "data");
  if (!fs.existsSync(data)) fs.mkdirSync(data, { recursive: true });
  const out = outboxDir(adminRoot);
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
}

export function loadAccount(adminRoot) {
  const fp = accountFilePath(adminRoot);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

export function saveAccount(adminRoot, account) {
  ensureAccountDirs(adminRoot);
  const fp = accountFilePath(adminRoot);
  const payload = {
    ...account,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
  return fp;
}

export function loadSessions(adminRoot) {
  const fp = sessionsFilePath(adminRoot);
  if (!fs.existsSync(fp)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

export function saveSessions(adminRoot, sessions) {
  ensureAccountDirs(adminRoot);
  fs.writeFileSync(
    sessionsFilePath(adminRoot),
    JSON.stringify({ version: 1, sessions, saved_at: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

/** Écrit un « courriel » local — aucun envoi réseau. */
export function writeLocalMail(adminRoot, { to, subject, body_text, meta = {} }) {
  ensureAccountDirs(adminRoot);
  const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fp = path.join(outboxDir(adminRoot), `${id}.json`);
  const doc = {
    id,
    mode: "local_outbox_only",
    sent: false,
    note_fr: "Simulation locale — aucun courriel réel n’a été envoyé.",
    to,
    subject,
    body_text,
    meta,
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2), "utf8");
  return { id, path: fp, doc };
}
