/**
 * Persistance privée locale — hors GitHub Pages.
 * Fichier gitignoré : inventory/admin/data/lucie-inventory.json
 */
import fs from "node:fs";
import path from "node:path";

export function dataDir(adminRoot) {
  return path.join(adminRoot, "data");
}

export function dataFile(adminRoot) {
  return path.join(dataDir(adminRoot), "lucie-inventory.json");
}

export function ensureDataDir(adminRoot) {
  const d = dataDir(adminRoot);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  const gitkeep = path.join(d, ".gitkeep");
  if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, "");
  return d;
}

export function loadPersisted(adminRoot) {
  const fp = dataFile(adminRoot);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

export function savePersisted(adminRoot, snapshot, meta = {}) {
  ensureDataDir(adminRoot);
  const fp = dataFile(adminRoot);
  const payload = {
    version: 1,
    ...meta,
    ...snapshot,
    saved_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
  return fp;
}
