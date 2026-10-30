/**
 * Génère inventory.json + INVENTAIRE-LUCIE.csv depuis catalog/products.json.
 * qty_on_hand = null partout — aucun stock fictif.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));

const rows = catalog.products.map((p) => ({
  product_id: p.id,
  name_fr: p.name_fr,
  category: p.category,
  fulfillment_type: "pending_lucie",
  qty_on_hand: null,
  qty_reserved: 0,
  lucie_confirmed: false,
  notes_lucie: "",
  updated_at: null,
}));

const inv = {
  version: 1,
  currency_note: "Ne pas modifier les prix produits ici — voir catalog/products.json",
  policy: {
    no_fictional_qty: true,
    qty_on_hand_null_means: "Lucie n'a pas encore saisi la quantité",
    fulfillment_types: {
      pending_lucie: "En attente de classification Lucie — non vendable en production",
      unique_stock: "Pièce(s) unique(s) ou stock limité — réservation atomique requise",
      made_to_order: "Fabriqué sur commande — pas de décrément stock; délai à confirmer par Lucie",
    },
  },
  items: rows,
};

const dir = path.join(root, "inventory");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "inventory.json"), JSON.stringify(inv, null, 2) + "\n");

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const header = "product_id,name_fr,category,fulfillment_type,qty_on_hand,notes_lucie,lucie_confirmed";
const lines = [
  header,
  ...rows.map((r) =>
    [
      r.product_id,
      csvEscape(r.name_fr),
      r.category,
      "pending_lucie",
      "", // qty vide — Lucie remplit
      "",
      "false",
    ].join(","),
  ),
];
fs.writeFileSync(path.join(dir, "INVENTAIRE-LUCIE.csv"), lines.join("\n") + "\n", "utf8");

console.log(
  JSON.stringify({
    items: rows.length,
    null_qty: rows.filter((i) => i.qty_on_hand === null).length,
    ok: rows.length === 66,
  }),
);
