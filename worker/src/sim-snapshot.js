/**
 * Copie isolée pour les essais locaux.
 * Lecture seule du fichier de tailles. Aucune écriture vers
 * lucie-inventory.json ni inventory/inventory.json.
 * La confirmation « lucie_confirmed » existe seulement dans cette copie mémoire :
 * elle ne change pas le fichier officiel, qui reste en attente.
 */

import { FULFILLMENT } from "./inventory-core.js";
import { inventoryStockId } from "./product-sizes-core.js";

export function rowsFromProductSizes(doc) {
  const rows = [];
  const products = doc && doc.products ? doc.products : {};
  for (const [id, entry] of Object.entries(products)) {
    const sizes = Array.isArray(entry.sizes) ? entry.sizes : [];
    const push = (sizeRow) => {
      const qty =
        sizeRow && sizeRow.qty_on_hand != null ? Math.floor(Number(sizeRow.qty_on_hand)) : null;
      const finite = Number.isFinite(qty) ? qty : null;
      rows.push({
        product_id: inventoryStockId(id, sizeRow && sizeRow.code, entry),
        catalog_id: id,
        size_code: sizeRow ? sizeRow.code : null,
        name_fr: id,
        category: entry.category || "",
        fulfillment_type: finite == null ? FULFILLMENT.MTO : FULFILLMENT.UNIQUE,
        qty_on_hand: finite,
        qty_reserved: 0,
        lucie_confirmed: true,
      });
    };
    if (sizes.length <= 1) push(sizes[0] || null);
    else sizes.forEach(push);
  }
  return rows;
}

export function availabilityFromStore(store, rows) {
  const products = {};
  for (const meta of rows) {
    const inv = store.getInventory(meta.product_id);
    const bucket = products[meta.catalog_id] || (products[meta.catalog_id] = { sizes: [] });
    bucket.sizes.push({
      code: meta.size_code,
      qty_on_hand: inv ? inv.qty_on_hand : null,
      qty_reserved: inv ? inv.qty_reserved || 0 : 0,
      qty_available: inv ? inv.qty_available : null,
    });
  }
  return {
    source: "sim-memory",
    durable: false,
    production_reservations: false,
    writes_real_inventory: false,
    limit_fr:
      "Copie en mémoire seulement. Un redémarrage oublie les réservations. Ce n'est pas un stock de production.",
    products,
  };
}
