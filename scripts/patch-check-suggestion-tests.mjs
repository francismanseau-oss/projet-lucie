/** Vérifie que les messages suggestion ne prétendent pas un envoi réel en mode mock / honeypot. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = fs.readFileSync(path.join(root, "contact-suggestion.js"), "utf8");

assert.match(js, /data\.mocked/);
assert.match(js, /courriel non envoyé|email not sent/i);
assert.doesNotMatch(
  js.slice(js.indexOf("honeypot"), js.indexOf("honeypot") + 500),
  /a été envoyée à Lucie/,
);
console.log("OK suggestion messaging honesty");
