/**
 * Contrôle de sécurité avant publication Pages.
 * Bloque (exit ≠ 0) si secrets / données privées / dossiers techniques dans docs/.
 * N’affiche jamais la valeur des secrets — seulement le type et le fichier.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");

const errors = [];
const warnings = [];

function addErr(msg) {
  errors.push(msg);
}
function addWarn(msg) {
  warnings.push(msg);
}

const FORBIDDEN_NAMES = new Set([
  "worker",
  "inventory",
  "shipping",
  "orders",
  "guides",
  "scripts",
  "seo",
  "node_modules",
  ".dev.vars",
  "wrangler.toml",
  "wrangler.test.toml",
  "admin-orders.json",
  "server.mjs",
]);

const SECRET_PATTERNS = [
  { re: /sk_live_[0-9A-Za-z]{10,}/g, kind: "stripe_live_key" },
  { re: /sk_test_[0-9A-Za-z]{20,}/g, kind: "stripe_test_key" },
  { re: /whsec_[0-9A-Za-z]{16,}/g, kind: "stripe_webhook_secret" },
  { re: /\bre_[0-9A-Za-z]{20,}\b/g, kind: "resend_api_key" },
  { re: /INVENTORY_ADMIN_PASSWORD\s*=\s*["']?[^"'\s]{8,}/gi, kind: "admin_password_assignment" },
];

const PLACEHOLDER_OK = /REMPLACER|simulated|example|fake|CHANGE_ME|YOUR_|^\s*$/i;

function walk(dir, rel = "") {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (FORBIDDEN_NAMES.has(ent.name)) {
      addErr(`Fichier/dossier interdit dans docs/ : ${r}`);
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(full, r);
    } else if (/\.(html|js|mjs|json|txt|md|css|toml|env|xml)$/i.test(ent.name)) {
      scanFile(full, r);
    }
  }
}

function scanFile(full, rel) {
  let text;
  try {
    text = fs.readFileSync(full, "utf8");
  } catch {
    return;
  }
  // Ignore très gros binaires mal détectés
  if (text.length > 2_000_000) return;

  for (const { re, kind } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (!m) continue;
    const suspicious = m.filter((v) => !PLACEHOLDER_OK.test(v));
    if (suspicious.length) {
      addErr(`Secret possible (${kind}) dans docs/${rel} — valeur non affichée`);
    }
  }

  if (/admin-orders|customer_email|shipping_hold:/i.test(rel) && /\.json$/i.test(rel)) {
    addErr(`Données commandes/clients possibles dans docs/${rel}`);
  }
}

// --- contrôles ---
if (!fs.existsSync(docs)) {
  addErr('Dossier docs/ absent — lancer "node scripts/build-pages-site.mjs" d’abord');
} else {
  walk(docs);
}

// Secrets locaux ne doivent pas être trackables (rappel)
const localSecrets = ["worker/.dev.vars", ".dev.vars", "orders/admin-orders.json"];
for (const f of localSecrets) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) {
    // vérifier présence dans .gitignore
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    const base = path.basename(f);
    if (!gi.includes(".dev.vars") && f.includes(".dev.vars")) {
      addErr(".gitignore ne protège pas .dev.vars");
    }
    if (f.includes("admin-orders") && !gi.includes("admin-orders.json")) {
      addErr(".gitignore ne protège pas admin-orders.json");
    }
    addWarn(`Présent en local (OK si gitignoré) : ${f}`);
  }
}

// JS public : pas de process.env secrets / Authorization Bearer hardcodé
const publicJs = ["checkout-config.js", "site.js", "creations-personnalisees.js", "sur-mesure-app.js"];
for (const f of publicJs) {
  const p = path.join(docs, f);
  if (!fs.existsSync(p)) continue;
  const t = fs.readFileSync(p, "utf8");
  if (/sk_test_|sk_live_|whsec_|RESEND_API_KEY\s*=/i.test(t)) {
    addErr(`JS public docs/${f} contient un motif de secret`);
  }
}

const report = {
  ok: errors.length === 0,
  errors,
  warnings,
  docs_exists: fs.existsSync(docs),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("\nPUBLICATION BLOQUÉE — corriger les erreurs ci-dessus.");
  process.exit(1);
}
console.error("\nContrôle OK — docs/ peut être publié via GitHub Pages (/docs) après push manuel autorisé.");
