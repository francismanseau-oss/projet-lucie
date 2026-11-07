/**
 * Registre clients local — n° client à partir de 1000, +1 par nouveau courriel.
 * Pas de fusion par nom seul.
 */
import fs from "node:fs";
import path from "node:path";

const START_NUMBER = 1000;

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function emptyDoc() {
  return {
    version: 1,
    next_client_number: START_NUMBER,
    clients: {},
  };
}

export function createClientsRegistry(filePath) {
  function read() {
    if (!fs.existsSync(filePath)) return emptyDoc();
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        version: raw.version || 1,
        next_client_number: Math.max(
          START_NUMBER,
          Math.floor(Number(raw.next_client_number) || START_NUMBER),
        ),
        clients: raw.clients && typeof raw.clients === "object" ? raw.clients : {},
      };
    } catch {
      return emptyDoc();
    }
  }

  function write(doc) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, filePath);
  }

  /**
   * Attribue ou récupère le n° client pour un courriel.
   * @returns {{ client_number: number, created: boolean } | null}
   */
  function ensureClient({ email, name, phone } = {}) {
    const key = normalizeEmail(email);
    if (!key) return null;

    const doc = read();
    const existing = doc.clients[key];
    if (existing && existing.client_number != null) {
      const num = Math.floor(Number(existing.client_number));
      let dirty = false;
      if (name && name !== existing.name) {
        existing.name = name;
        dirty = true;
      }
      if (phone && phone !== existing.phone) {
        existing.phone = phone;
        dirty = true;
      }
      existing.updated_at = new Date().toISOString();
      if (dirty) write(doc);
      return { client_number: num, created: false, email: existing.email || email };
    }

    const client_number = doc.next_client_number;
    doc.clients[key] = {
      client_number,
      email: String(email).trim(),
      name: name || null,
      phone: phone || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    doc.next_client_number = client_number + 1;
    write(doc);
    return { client_number, created: true, email: String(email).trim() };
  }

  function getByEmail(email) {
    const key = normalizeEmail(email);
    if (!key) return null;
    const row = read().clients[key];
    return row ? { ...row, key } : null;
  }

  /** Pour chaque commande avec courriel : assure un n° et l’attache. */
  function enrichOrders(orders) {
    return (orders || []).map((o) => {
      const email = o.customer_email;
      if (!email) return { ...o, client_number: o.client_number ?? null };
      // N° client dès qu’il y a un courriel (commandes admin / import / fixture)
      const ensured = ensureClient({
        email,
        name: o.customer_name,
        phone: o.customer_phone,
      });
      return {
        ...o,
        client_number: ensured?.client_number ?? o.client_number ?? null,
      };
    });
  }

  return {
    filePath,
    read,
    ensureClient,
    getByEmail,
    enrichOrders,
    startNumber: START_NUMBER,
  };
}
