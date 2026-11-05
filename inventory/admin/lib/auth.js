/**
 * Auth inventaire Lucie — serveur local.
 * - Mot de passe temporaire (hashé) → changement forcé à la 1ʳᵉ connexion
 * - Sessions cookie / Bearer, « Rester connecté »
 * - Oubli de mot de passe → lien one-shot (courriel simulé local)
 * - Anti-bruteforce
 * Jamais de mot de passe en clair dans les fichiers.
 */

import {
  hashPassword,
  verifyPassword,
  hashToken,
  newOpaqueToken,
  validatePasswordPlain,
  MIN_PASSWORD_LENGTH,
} from "./password-crypto.js";
import {
  loadAccount,
  saveAccount,
  loadSessions,
  saveSessions,
  writeLocalMail,
  ensureAccountDirs,
} from "./account-store.js";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const COOKIE_NAME = "inv_admin_session";

function httpErr(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function createAuth(opts = {}) {
  const adminRoot = opts.adminRoot;
  if (!adminRoot) throw new Error("createAuth: adminRoot requis");
  ensureAccountDirs(adminRoot);

  /** @type {Map<string, {expiresAt:number, createdAt:number, remember:boolean, mustChange:boolean}>} */
  const memorySessions = new Map();

  function hydrateSessions() {
    const now = Date.now();
    for (const s of loadSessions(adminRoot)) {
      if (!s?.token_hash || !s.expires_at) continue;
      if (new Date(s.expires_at).getTime() <= now) continue;
      // On ne peut pas restaurer le token clair — seulement les hashes pour validation persistée
      memorySessions.set(`persist:${s.token_hash}`, {
        expiresAt: new Date(s.expires_at).getTime(),
        createdAt: s.created_at ? new Date(s.created_at).getTime() : now,
        remember: !!s.remember,
        mustChange: !!s.must_change_password,
        tokenHash: s.token_hash,
      });
    }
  }
  hydrateSessions();

  function purgeSessions() {
    const now = Date.now();
    for (const [k, s] of memorySessions) {
      if (s.expiresAt <= now) memorySessions.delete(k);
    }
    const kept = loadSessions(adminRoot).filter((s) => new Date(s.expires_at).getTime() > now);
    if (kept.length !== loadSessions(adminRoot).length) saveSessions(adminRoot, kept);
  }

  function persistRemembered() {
    const rows = [];
    for (const [k, s] of memorySessions) {
      if (!s.remember) continue;
      const th = s.tokenHash || (k.startsWith("persist:") ? k.slice(8) : null);
      if (!th) continue;
      rows.push({
        token_hash: th,
        expires_at: new Date(s.expiresAt).toISOString(),
        created_at: new Date(s.createdAt).toISOString(),
        remember: true,
        must_change_password: !!s.mustChange,
      });
    }
    saveSessions(adminRoot, rows);
  }

  function accountOrThrow() {
    const acc = loadAccount(adminRoot);
    if (!acc?.password_hash || !acc?.password_salt) {
      throw httpErr(
        "Compte non configuré. Francis doit lancer le script de mot de passe temporaire.",
        503,
      );
    }
    return acc;
  }

  function publicAccountStatus() {
    const acc = loadAccount(adminRoot);
    return {
      configured: !!(acc?.password_hash && acc?.password_salt),
      must_change_password: !!acc?.must_change_password,
      email_hint: acc?.email ? maskEmail(acc.email) : null,
      temp_password_active: !!acc?.temp_password_active,
      min_password_length: MIN_PASSWORD_LENGTH,
    };
  }

  function assertNotLocked(acc) {
    if (acc.locked_until && new Date(acc.locked_until).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(acc.locked_until).getTime() - Date.now()) / 60000);
      throw httpErr(`Trop d’essais. Réessayez dans environ ${mins} minute(s).`, 429);
    }
  }

  function registerFail(acc) {
    const fails = (acc.failed_attempts || 0) + 1;
    acc.failed_attempts = fails;
    if (fails >= MAX_FAILS) {
      acc.locked_until = new Date(Date.now() + LOCK_MS).toISOString();
      acc.failed_attempts = 0;
    }
    saveAccount(adminRoot, acc);
  }

  function clearFails(acc) {
    acc.failed_attempts = 0;
    acc.locked_until = null;
    saveAccount(adminRoot, acc);
  }

  function createSession({ remember = false, mustChange = false }) {
    purgeSessions();
    const token = newOpaqueToken(32);
    const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
    const expiresAt = Date.now() + ttl;
    const tokenHash = hashToken(token);
    memorySessions.set(token, {
      expiresAt,
      createdAt: Date.now(),
      remember: !!remember,
      mustChange: !!mustChange,
      tokenHash,
    });
    if (remember) persistRemembered();
    return {
      token,
      expires_in_sec: Math.floor(ttl / 1000),
      remember: !!remember,
      must_change_password: !!mustChange,
    };
  }

  function resolveSession(token) {
    purgeSessions();
    if (!token) return null;
    let s = memorySessions.get(token);
    if (s && s.expiresAt > Date.now()) return { key: token, ...s };
    const th = hashToken(token);
    s = memorySessions.get(`persist:${th}`);
    if (s && s.expiresAt > Date.now()) {
      // Remonter en session mémoire avec le token clair de cette requête
      memorySessions.set(token, { ...s, tokenHash: th });
      memorySessions.delete(`persist:${th}`);
      return { key: token, ...memorySessions.get(token) };
    }
    return null;
  }

  return {
    COOKIE_NAME,
    MIN_PASSWORD_LENGTH,
    isConfigured() {
      return publicAccountStatus().configured;
    },
    status: publicAccountStatus,

    async login(candidate, { remember = false } = {}) {
      const acc = accountOrThrow();
      assertNotLocked(acc);
      const ok = await verifyPassword(candidate, {
        salt: acc.password_salt,
        hash: acc.password_hash,
      });
      if (!ok) {
        registerFail(acc);
        throw httpErr("Identifiants incorrects", 401);
      }
      clearFails(acc);
      const mustChange = !!acc.must_change_password;
      // Pendant must_change, on n’accorde pas « rester connecté » longue durée
      const session = createSession({
        remember: mustChange ? false : !!remember,
        mustChange,
      });
      return {
        ...session,
        email_hint: maskEmail(acc.email),
      };
    },

    async changePassword({ token, currentPassword, newPassword, confirmPassword }) {
      const sess = this.requireSession(token, { allowMustChange: true });
      const acc = accountOrThrow();
      if (String(newPassword) !== String(confirmPassword)) {
        throw httpErr("Les deux nouveaux mots de passe ne correspondent pas.", 400);
      }
      const check = validatePasswordPlain(newPassword);
      if (!check.ok) throw httpErr(check.error, 400);
      if (String(newPassword) === String(currentPassword)) {
        throw httpErr("Choisissez un mot de passe différent du temporaire.", 400);
      }
      const ok = await verifyPassword(currentPassword, {
        salt: acc.password_salt,
        hash: acc.password_hash,
      });
      if (!ok) throw httpErr("Mot de passe actuel incorrect.", 401);

      const hashed = await hashPassword(newPassword);
      acc.password_salt = hashed.salt;
      acc.password_hash = hashed.hash;
      acc.password_algo = hashed.algo;
      acc.must_change_password = false;
      acc.temp_password_active = false;
      acc.password_changed_at = new Date().toISOString();
      acc.reset_tokens = [];
      clearFails(acc);
      saveAccount(adminRoot, acc);

      // Invalider toutes les sessions sauf celle en cours, et lever le flag mustChange
      for (const [k, s] of memorySessions) {
        if (k === sess.key || k === token) {
          s.mustChange = false;
          continue;
        }
        memorySessions.delete(k);
      }
      persistRemembered();
      return { ok: true, must_change_password: false };
    },

    async requestPasswordReset({ email, baseUrl }) {
      const acc = loadAccount(adminRoot);
      // Réponse neutre pour ne pas révéler si le courriel existe
      const neutral = {
        ok: true,
        message_fr:
          "Si cette adresse est enregistrée, un lien a été préparé (simulation locale — aucun courriel réel).",
      };
      if (!acc?.email) return neutral;
      if (normalizeEmail(email) !== normalizeEmail(acc.email)) return neutral;

      const raw = newOpaqueToken(32);
      const entry = {
        token_hash: hashToken(raw),
        expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
        used_at: null,
        created_at: new Date().toISOString(),
      };
      acc.reset_tokens = [...(acc.reset_tokens || []).filter((t) => !t.used_at), entry].slice(-5);
      saveAccount(adminRoot, acc);

      const link = `${String(baseUrl || "").replace(/\/$/, "")}/#reset=${raw}`;
      writeLocalMail(adminRoot, {
        to: acc.email,
        subject: "Réinitialisation — inventaire Fourrures Boréales",
        body_text: [
          "Bonjour Lucie,",
          "",
          "Voici un lien pour choisir un nouveau mot de passe (valable 1 heure, une seule fois) :",
          link,
          "",
          "Si vous n’avez pas demandé ceci, ignorez ce message.",
          "",
          "(Message de simulation locale — non envoyé par Internet.)",
        ].join("\n"),
        meta: { kind: "password_reset", expires_at: entry.expires_at },
      });
      return {
        ...neutral,
        // Champ debug local uniquement (jamais en prod publique)
        local_reset_token: process.env.INVENTORY_AUTH_EXPOSE_RESET === "1" ? raw : undefined,
        local_outbox: true,
      };
    },

    async resetPasswordWithToken({ token: resetToken, newPassword, confirmPassword }) {
      const acc = accountOrThrow();
      if (String(newPassword) !== String(confirmPassword)) {
        throw httpErr("Les deux nouveaux mots de passe ne correspondent pas.", 400);
      }
      const check = validatePasswordPlain(newPassword);
      if (!check.ok) throw httpErr(check.error, 400);

      const th = hashToken(resetToken);
      const list = acc.reset_tokens || [];
      const found = list.find((t) => t.token_hash === th);
      if (!found) throw httpErr("Lien invalide ou déjà utilisé.", 400);
      if (found.used_at) throw httpErr("Ce lien a déjà été utilisé.", 400);
      if (new Date(found.expires_at).getTime() <= Date.now()) {
        throw httpErr("Ce lien a expiré. Demandez-en un nouveau.", 400);
      }

      const hashed = await hashPassword(newPassword);
      acc.password_salt = hashed.salt;
      acc.password_hash = hashed.hash;
      acc.password_algo = hashed.algo;
      acc.must_change_password = false;
      acc.temp_password_active = false;
      acc.password_changed_at = new Date().toISOString();
      found.used_at = new Date().toISOString();
      // Invalider les autres jetons
      for (const t of list) {
        if (t !== found && !t.used_at) t.used_at = new Date().toISOString();
      }
      clearFails(acc);
      saveAccount(adminRoot, acc);

      memorySessions.clear();
      saveSessions(adminRoot, []);
      return { ok: true };
    },

    logout(token) {
      if (!token) return;
      const s = memorySessions.get(token);
      memorySessions.delete(token);
      if (s?.tokenHash) memorySessions.delete(`persist:${s.tokenHash}`);
      persistRemembered();
    },

    requireSession(token, { allowMustChange = false } = {}) {
      const s = resolveSession(token);
      if (!s) throw httpErr("Session requise", 401);
      if (s.mustChange && !allowMustChange) {
        throw httpErr("Vous devez d’abord choisir votre nouveau mot de passe.", 403);
      }
      // Sliding expiration (sauf remember déjà long — on prolonge un peu)
      const ttl = s.remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
      s.expiresAt = Date.now() + ttl;
      if (s.remember) persistRemembered();
      return s;
    },

    sessionCookieHeader(token, { remember = false, clear = false } = {}) {
      if (clear) {
        return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
      }
      const maxAge = Math.floor((remember ? REMEMBER_TTL_MS : SESSION_TTL_MS) / 1000);
      // Secure seulement hors localhost (HTTPS public plus tard)
      const secure = process.env.INVENTORY_COOKIE_SECURE === "1" ? "; Secure" : "";
      return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
    },
  };
}

export function parseBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const cookie = req.headers?.cookie || "";
  const cm = String(cookie).match(/(?:^|;\s*)inv_admin_session=([^;]+)/);
  return cm ? decodeURIComponent(cm[1]) : "";
}

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function maskEmail(email) {
  const e = String(email || "");
  const [u, d] = e.split("@");
  if (!d) return "***";
  const vis = u.slice(0, Math.min(2, u.length));
  return `${vis}***@${d}`;
}

export { MIN_PASSWORD_LENGTH };
