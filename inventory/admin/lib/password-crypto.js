/**
 * Hachage scrypt — jamais de mot de passe en clair.
 */
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordPlain(plain) {
  const p = String(plain || "");
  if (p.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Le mot de passe doit avoir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (/\s/.test(p)) {
    return { ok: false, error: "Le mot de passe ne doit pas contenir d’espaces." };
  }
  return { ok: true };
}

export async function hashPassword(plain) {
  const check = validatePasswordPlain(plain);
  if (!check.ok) throw Object.assign(new Error(check.error), { status: 400 });
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(plain), salt, 64);
  return {
    algo: "scrypt",
    salt: salt.toString("hex"),
    hash: Buffer.from(derived).toString("hex"),
  };
}

export async function verifyPassword(plain, record) {
  if (!record?.salt || !record?.hash) return false;
  const salt = Buffer.from(record.salt, "hex");
  const expected = Buffer.from(record.hash, "hex");
  const derived = await scrypt(String(plain || ""), salt, expected.length);
  return crypto.timingSafeEqual(Buffer.from(derived), expected);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function newOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
