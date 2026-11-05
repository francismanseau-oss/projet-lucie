/**
 * Génère inventory/admin/demo/demo-inventory.json
 * Données clairement marquées DEMO — ne remplace jamais inventory/inventory.json.
 *
 * - La majorité des qty restent null (comme le réel).
 * - Quelques lignes ont des qty démo pour tester alertes / corrections.
 * - min_stock_target = 3 (objectif provisoire, PAS une quantité disponible).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIN_STOCK_TARGET } from "../../../worker/src/inventory-admin-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));

/** Quantités démo uniquement — IDs stables pour les tests. */
const DEMO_QTY = {
  "mitaines-dame-m-renard": 5, // au-dessus du seuil 3 — pas d'alerte
  "mitaines-m-renard": 2, // sous le seuil → alerte
  "mitaines-m-l-renard": 1, // sous le seuil → alerte
  "chapeau-fille-8-10-renard": 0, // sous le seuil → alerte
};

const items = catalog.products.map((p) => {
  const hasDemo = Object.prototype.hasOwnProperty.call(DEMO_QTY, p.id);
  return {
    product_id: p.id,
    product_number: p.product_number ?? null,
    name_fr: p.name_fr,
    category: p.category,
    image: p.image || "",
    fulfillment_type: "pending_lucie",
    qty_on_hand: hasDemo ? DEMO_QTY[p.id] : null,
    provisional_qty_on_hand: 3,
    qty_reserved: 0,
    qty_sold: 0,
    min_stock_target: DEFAULT_MIN_STOCK_TARGET,
    lucie_confirmed: false,
    notes_lucie: hasDemo ? "DEMO — quantité fictive pour tests locaux" : "",
    updated_at: hasDemo ? new Date().toISOString() : null,
  };
});

const outDir = path.join(root, "inventory/admin/demo");
fs.mkdirSync(outDir, { recursive: true });

const payload = {
  version: 1,
  data_mode: "demo",
  warning_fr:
    "DONNÉES DE DÉMONSTRATION UNIQUEMENT. Ne pas utiliser comme inventaire réel. Ne pas copier qty_on_hand vers inventory/inventory.json sans confirmation Lucie.",
  policy: {
    no_fictional_qty_in_real_file: true,
    min_stock_target_is_not_qty_on_hand: true,
    default_min_stock_target: DEFAULT_MIN_STOCK_TARGET,
    qty_on_hand_null_means: "Quantité réelle inconnue",
  },
  items,
};

const outPath = path.join(outDir, "demo-inventory.json");
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

const known = items.filter((i) => i.qty_on_hand != null).length;
const low = items.filter(
  (i) => i.qty_on_hand != null && i.qty_on_hand < i.min_stock_target,
).length;

console.log(
  JSON.stringify({
    path: outPath,
    items: items.length,
    demo_qty_set: known,
    demo_low_alerts: low,
    null_qty: items.length - known,
    ok: items.length === 66,
  }),
);
