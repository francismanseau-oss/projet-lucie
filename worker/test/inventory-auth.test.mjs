/**
 * Auth Lucie — temporaire → changement forcé, oubli local, sessions.
 * Aucun courriel réel. Aucun secret en clair dans les fichiers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "../../inventory/admin/lib/auth.js";
import { hashPassword } from "../../inventory/admin/lib/password-crypto.js";
import { saveAccount, loadAccount, outboxDir } from "../../inventory/admin/lib/account-store.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function tmpAdmin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lfb-auth-"));
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  return dir;
}

async function seedTemp(adminRoot, { email = "lucie@example.test", password = "TempPass99" } = {}) {
  const hashed = await hashPassword(password);
  saveAccount(adminRoot, {
    version: 1,
    email,
    password_algo: hashed.algo,
    password_salt: hashed.salt,
    password_hash: hashed.hash,
    must_change_password: true,
    temp_password_active: true,
    failed_attempts: 0,
    locked_until: null,
    reset_tokens: [],
  });
  return { email, password };
}

test("compte non configuré → login 503", async () => {
  const root = tmpAdmin();
  const auth = createAuth({ adminRoot: root });
  assert.equal(auth.isConfigured(), false);
  await assert.rejects(() => auth.login("anything"), /non configuré|Compte/i);
});

test("login temporaire → must_change ; inventaire bloqué ; changement invalide temporaire", async () => {
  const root = tmpAdmin();
  const { password } = await seedTemp(root);
  const auth = createAuth({ adminRoot: root });

  const session = await auth.login(password, { remember: true });
  assert.equal(session.must_change_password, true);
  // remember ignoré tant que must_change
  assert.equal(session.remember, false);

  assert.throws(() => auth.requireSession(session.token), /nouveau mot de passe/i);
  auth.requireSession(session.token, { allowMustChange: true });

  await auth.changePassword({
    token: session.token,
    currentPassword: password,
    newPassword: "MonMotDePasseLucie1",
    confirmPassword: "MonMotDePasseLucie1",
  });

  const acc = loadAccount(root);
  assert.equal(acc.must_change_password, false);
  assert.equal(acc.temp_password_active, false);
  assert.ok(acc.password_hash);
  assert.doesNotMatch(JSON.stringify(acc), /TempPass99|MonMotDePasseLucie1/);

  // temporaire mort
  await assert.rejects(() => auth.login(password), /incorrect/i);

  const s2 = await auth.login("MonMotDePasseLucie1", { remember: true });
  assert.equal(s2.must_change_password, false);
  assert.equal(s2.remember, true);
  auth.requireSession(s2.token);
});

test("anti-bruteforce après 5 échecs", async () => {
  const root = tmpAdmin();
  await seedTemp(root, { password: "TempPass99" });
  const auth = createAuth({ adminRoot: root });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(() => auth.login("wrong-password"), /incorrect/i);
  }
  await assert.rejects(() => auth.login("TempPass99"), /Trop d.essais|minute/i);
});

test("oubli → outbox local ; token one-shot ; réutilisation refusée", async () => {
  const root = tmpAdmin();
  await seedTemp(root, { email: "lucie@example.test", password: "TempPass99" });
  process.env.INVENTORY_AUTH_EXPOSE_RESET = "1";
  const auth = createAuth({ adminRoot: root });
  // d'abord passer au mdp perso
  const s = await auth.login("TempPass99");
  await auth.changePassword({
    token: s.token,
    currentPassword: "TempPass99",
    newPassword: "PersoLucie88",
    confirmPassword: "PersoLucie88",
  });

  const forgot = await auth.requestPasswordReset({
    email: "lucie@example.test",
    baseUrl: "http://127.0.0.1:8791",
  });
  assert.equal(forgot.ok, true);
  assert.ok(forgot.local_reset_token);
  const mails = fs.readdirSync(outboxDir(root)).filter((f) => f.endsWith(".json"));
  assert.ok(mails.length >= 1);
  const mail = JSON.parse(fs.readFileSync(path.join(outboxDir(root), mails[0]), "utf8"));
  assert.equal(mail.sent, false);
  assert.match(mail.note_fr, /aucun courriel réel/i);

  await auth.resetPasswordWithToken({
    token: forgot.local_reset_token,
    newPassword: "NouveauLucie77",
    confirmPassword: "NouveauLucie77",
  });
  await assert.rejects(
    () =>
      auth.resetPasswordWithToken({
        token: forgot.local_reset_token,
        newPassword: "AutreMotDePasse1",
        confirmPassword: "AutreMotDePasse1",
      }),
    (err) => /utilis|invalide/i.test(err.message),
  );

  const s3 = await auth.login("NouveauLucie77");
  assert.equal(s3.must_change_password, false);
  delete process.env.INVENTORY_AUTH_EXPOSE_RESET;
});

test("sans obligation, le même mot de passe sert plusieurs fois et le hash ne change pas", async () => {
  const root = tmpAdmin();
  const hashed = await hashPassword("TempPass99");
  saveAccount(root, {
    version: 1,
    email: "lucie@example.test",
    password_algo: hashed.algo,
    password_salt: hashed.salt,
    password_hash: hashed.hash,
    must_change_password: false,
    temp_password_active: true,
    failed_attempts: 0,
    locked_until: null,
    reset_tokens: [],
  });
  const auth = createAuth({ adminRoot: root });
  const a = await auth.login("TempPass99", { remember: true });
  assert.equal(a.must_change_password, false);
  assert.equal(a.remember, true);
  auth.requireSession(a.token);
  auth.logout(a.token);
  const b = await auth.login("TempPass99");
  assert.equal(b.must_change_password, false);
  auth.requireSession(b.token);
  const acc = loadAccount(root);
  assert.equal(acc.password_hash, hashed.hash);
  assert.equal(acc.password_salt, hashed.salt);
});

test("cookie header HttpOnly SameSite — pas Secure en local", () => {
  const root = tmpAdmin();
  const auth = createAuth({ adminRoot: root });
  const h = auth.sessionCookieHeader("abc123", { remember: false });
  assert.match(h, /HttpOnly/);
  assert.match(h, /SameSite=Strict/);
  assert.doesNotMatch(h, /Secure/);
  const clear = auth.sessionCookieHeader("", { clear: true });
  assert.match(clear, /Max-Age=0/);
});

test("UI login contient Rester connecté et Mot de passe oublié", () => {
  const adminHtml = fs.readFileSync(
    path.join(projectRoot, "inventory/admin/public/index.html"),
    "utf8",
  );
  assert.match(adminHtml, /Rester connecté/);
  assert.match(adminHtml, /Mot de passe oublié/);
  assert.match(adminHtml, /Changer le mot de passe/);
  assert.match(adminHtml, /autocomplete="current-password"/);
  const adminJs = fs.readFileSync(
    path.join(projectRoot, "inventory/admin/public/admin.js"),
    "utf8",
  );
  assert.match(adminJs, /Choisissez votre mot de passe/);
  assert.match(adminJs, /btn-open-change/);
  const bat = fs.readFileSync(
    path.join(projectRoot, "inventory/admin/demarrer-inventaire.bat"),
    "utf8",
  );
  assert.match(bat, /lucie-account\.json/);
  const ps1 = fs.readFileSync(
    path.join(projectRoot, "inventory/admin/scripts/creer-raccourcis.ps1"),
    "utf8",
  );
  assert.match(ps1, /Mode LOCAL/);
  assert.match(ps1, /-Public/);
  assert.match(ps1, /REFUS/);
});
