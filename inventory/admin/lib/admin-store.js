/**
 * Store inventaire admin (mémoire) + historique.
 * Destiné au serveur local / tests — pas au checkout public.
 */

import {
  DEFAULT_MIN_STOCK_TARGET,
  applyAddFabricated,
  applyAdjustQty,
  isBelowMinStock,
  isOutOfStock,
  normalizeMinStockTarget,
  summarizeAlerts,
  validateQtyOnHand,
} from "../../../worker/src/inventory-admin-core.js";
import { normalizeSizeCode, sumSizeQty } from "../../../worker/src/product-sizes-core.js";

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Anti-concurrence : le stock affiché doit encore être celui du serveur. */
function assertExpectedQty(row, expectedQty) {
  if (expectedQty === undefined || expectedQty === null || expectedQty === "") return;
  const expected =
    expectedQty === "null" || expectedQty === "—" ? null : Math.floor(Number(expectedQty));
  const current = row.qty_on_hand == null ? null : Math.floor(Number(row.qty_on_hand));
  if (expected !== current) {
    const err = new Error(
      "Le stock a changé entre-temps. Rechargez la page, puis recommencez.",
    );
    err.status = 409;
    throw err;
  }
}

function cloneSizes(sizes) {
  if (!Array.isArray(sizes)) return null;
  return sizes.map((s) => ({
    code: normalizeSizeCode(s.code),
    label_fr: s.label_fr || s.code,
    label_en: s.label_en || s.label_fr || s.code,
    qty_on_hand:
      s.qty_on_hand == null || s.qty_on_hand === ""
        ? null
        : Math.floor(Number(s.qty_on_hand)),
  }));
}

function syncParentQtyFromSizes(row) {
  if (!Array.isArray(row.sizes) || !row.sizes.length) return;
  const sum = sumSizeQty(row.sizes);
  if (sum != null) row.qty_on_hand = sum;
  row.out_of_stock = isOutOfStock({ qty_on_hand: row.qty_on_hand });
  row.below_min = isBelowMinStock({
    qty_on_hand: row.qty_on_hand,
    min_stock_target: row.min_stock_target,
  });
}

function cloneRow(row) {
  const min = normalizeMinStockTarget(row.min_stock_target);
  const sizes = cloneSizes(row.sizes);
  let qty = row.qty_on_hand === undefined ? null : row.qty_on_hand;
  if (sizes && sizes.length) {
    const sum = sumSizeQty(sizes);
    if (sum != null) qty = sum;
  }
  return {
    product_id: row.product_id,
    product_number: row.product_number ?? null,
    name_fr: row.name_fr || row.product_id,
    category: row.category || "",
    audience: row.audience || null,
    image: row.image || "",
    fulfillment_type: row.fulfillment_type || "pending_lucie",
    qty_on_hand: qty,
    provisional_qty_on_hand:
      row.provisional_qty_on_hand === undefined ? 3 : row.provisional_qty_on_hand,
    qty_reserved: row.qty_reserved || 0,
    qty_sold: row.qty_sold || 0,
    min_stock_target: min,
    lucie_confirmed: !!row.lucie_confirmed,
    notes_lucie: row.notes_lucie || "",
    updated_at: row.updated_at || null,
    sizes,
    size_selector: !!(row.size_selector || (sizes && sizes.length > 1)),
    below_min: isBelowMinStock({ qty_on_hand: qty, min_stock_target: min }),
    out_of_stock: isOutOfStock({ qty_on_hand: qty }),
  };
}

export function createAdminInventoryStore(seedItems = [], opts = {}) {
  const inventory = new Map();
  const audit = [];
  const dataMode = opts.dataMode || "demo"; // "demo" | "real-readonly-seed"
  const actorDefault = opts.actor || "lucie-local";

  for (const row of seedItems) {
    const r = cloneRow(row);
    inventory.set(r.product_id, r);
  }

  function pushAudit(entry) {
    audit.unshift({
      id: newId("aud"),
      at: new Date().toISOString(),
      actor: entry.actor || actorDefault,
      product_id: entry.product_id,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      note: entry.note || "",
      data_mode: dataMode,
    });
    if (audit.length > 500) audit.length = 500;
  }

  function get(productId) {
    const row = inventory.get(productId);
    return row ? cloneRow(row) : null;
  }

  function list() {
    return [...inventory.values()]
      .map(cloneRow)
      .sort((a, b) => a.name_fr.localeCompare(b.name_fr, "fr"));
  }

  function requireRow(productId) {
    const row = inventory.get(productId);
    if (!row) {
      const err = new Error(`Produit inconnu: ${productId}`);
      err.status = 404;
      throw err;
    }
    return row;
  }

  return {
    kind: "admin-memory",
    dataMode,
    defaultMinStockTarget: DEFAULT_MIN_STOCK_TARGET,

    list,
    get,
    summarize() {
      return summarizeAlerts(list());
    },
    listAudit({ productId = null, limit = 50 } = {}) {
      let rows = audit;
      if (productId) rows = rows.filter((a) => a.product_id === productId);
      return rows.slice(0, Math.min(200, Math.max(1, limit)));
    },

    /**
     * Corriger le stock total (inventaire physique) — FIXE la quantité, ne l’ajoute pas.
     * expectedQty : anti-concurrence (refus si le stock a changé entre-temps).
     */
    setQty({ productId, qty, actor, note, confirm, expectedQty }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant de corriger le stock");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      assertExpectedQty(row, expectedQty);
      const parsed = validateQtyOnHand(qty);
      if (!parsed.ok) {
        const err = new Error(parsed.error);
        err.status = 400;
        throw err;
      }
      if (parsed.qty_on_hand == null) {
        const err = new Error("Indiquez un total entier (0 ou plus) pour corriger le stock");
        err.status = 400;
        throw err;
      }
      const beforeQty = row.qty_on_hand;
      const before = { qty_on_hand: beforeQty };
      row.qty_on_hand = parsed.qty_on_hand;
      row.updated_at = new Date().toISOString();
      const corrected =
        beforeQty == null ? parsed.qty_on_hand : parsed.qty_on_hand - Math.floor(Number(beforeQty));
      pushAudit({
        actor,
        product_id: productId,
        action: "correct_total",
        before,
        after: {
          qty_on_hand: row.qty_on_hand,
          corrected_by: corrected,
          new_total: row.qty_on_hand,
        },
        note: note || `Correction inventaire → ${row.qty_on_hand}`,
      });
      return cloneRow(row);
    },

    /** Ajouter N exemplaires au stock existant (n’écrase pas le total). */
    addFabricated({ productId, delta, actor, note, confirm, expectedQty }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant d'ajouter des unités");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      assertExpectedQty(row, expectedQty);
      const next = applyAddFabricated(row.qty_on_hand, delta);
      if (!next.ok) {
        const err = new Error(next.error);
        err.status = 400;
        throw err;
      }
      const before = { qty_on_hand: row.qty_on_hand };
      row.qty_on_hand = next.qty_on_hand;
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: "add_stock",
        before,
        after: {
          qty_on_hand: row.qty_on_hand,
          added: next.added,
          new_total: row.qty_on_hand,
        },
        note: note || `+${next.added}`,
      });
      return cloneRow(row);
    },

    /** Boutons + / − Lucie (delta entier, peut être négatif). */
    adjustQty({ productId, delta, actor, note, confirm, expectedQty, sizeCode }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant d'ajuster la quantité");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      const code = normalizeSizeCode(sizeCode);
      if (Array.isArray(row.sizes) && row.sizes.length > 1 && !code) {
        const err = new Error("Indiquez la taille à ajuster");
        err.status = 400;
        throw err;
      }
      if (code && Array.isArray(row.sizes) && row.sizes.length) {
        const size = row.sizes.find((s) => normalizeSizeCode(s.code) === code);
        if (!size) {
          const err = new Error(`Taille inconnue: ${code}`);
          err.status = 404;
          throw err;
        }
        if (expectedQty !== undefined && expectedQty !== null && expectedQty !== "") {
          const expected = Math.floor(Number(expectedQty));
          const current = size.qty_on_hand == null ? null : Math.floor(Number(size.qty_on_hand));
          if (expected !== current) {
            const err = new Error(
              "Le stock a changé entre-temps. Rechargez la page, puis recommencez.",
            );
            err.status = 409;
            throw err;
          }
        }
        const next = applyAdjustQty(size.qty_on_hand, delta);
        if (!next.ok) {
          const err = new Error(next.error);
          err.status = 400;
          throw err;
        }
        const before = { size: code, qty_on_hand: size.qty_on_hand, parent_qty: row.qty_on_hand };
        size.qty_on_hand = next.qty_on_hand;
        syncParentQtyFromSizes(row);
        row.updated_at = new Date().toISOString();
        pushAudit({
          actor,
          product_id: productId,
          action: next.delta > 0 ? "adjust_plus_size" : "adjust_minus_size",
          before,
          after: {
            size: code,
            qty_on_hand: size.qty_on_hand,
            parent_qty: row.qty_on_hand,
            added: next.delta,
          },
          note: note || `${code} ${next.delta > 0 ? "+" : ""}${next.delta}`,
        });
        return cloneRow(row);
      }
      assertExpectedQty(row, expectedQty);
      const next = applyAdjustQty(row.qty_on_hand, delta);
      if (!next.ok) {
        const err = new Error(next.error);
        err.status = 400;
        throw err;
      }
      const before = { qty_on_hand: row.qty_on_hand };
      row.qty_on_hand = next.qty_on_hand;
      if (Array.isArray(row.sizes) && row.sizes.length === 1) {
        row.sizes[0].qty_on_hand = row.qty_on_hand;
      }
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: next.delta > 0 ? "adjust_plus" : "adjust_minus",
        before,
        after: {
          qty_on_hand: row.qty_on_hand,
          added: next.delta,
          new_total: row.qty_on_hand,
        },
        note: note || (next.delta > 0 ? `+${next.delta}` : `${next.delta}`),
      });
      return cloneRow(row);
    },

    /** Ajouter / modifier une taille offerte (Lucie). */
    upsertSize({ productId, code, label_fr, label_en, qty_on_hand, selector, actor, note, confirm }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant de modifier les tailles");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      const sizeCode = normalizeSizeCode(code);
      if (!sizeCode) {
        const err = new Error("Code taille requis");
        err.status = 400;
        throw err;
      }
      if (!Array.isArray(row.sizes)) row.sizes = [];
      let size = row.sizes.find((s) => normalizeSizeCode(s.code) === sizeCode);
      const before = cloneSizes(row.sizes);
      if (!size) {
        size = {
          code: sizeCode,
          label_fr: label_fr || sizeCode,
          label_en: label_en || label_fr || sizeCode,
          qty_on_hand: 0,
        };
        row.sizes.push(size);
      } else {
        if (label_fr) size.label_fr = label_fr;
        if (label_en) size.label_en = label_en;
      }
      if (qty_on_hand !== undefined) {
        const parsed = validateQtyOnHand(qty_on_hand);
        if (!parsed.ok) {
          const err = new Error(parsed.error);
          err.status = 400;
          throw err;
        }
        size.qty_on_hand = parsed.qty_on_hand ?? 0;
      }
      if (selector != null) row.size_selector = !!selector;
      else row.size_selector = row.sizes.length > 1;
      syncParentQtyFromSizes(row);
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: "upsert_size",
        before: { sizes: before },
        after: { sizes: cloneSizes(row.sizes), size_selector: row.size_selector },
        note: note || `Taille ${sizeCode}`,
      });
      return cloneRow(row);
    },

    removeSize({ productId, code, actor, note, confirm }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant de retirer une taille");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      const sizeCode = normalizeSizeCode(code);
      if (!Array.isArray(row.sizes) || row.sizes.length <= 1) {
        const err = new Error("Conservez au moins un format");
        err.status = 400;
        throw err;
      }
      const before = cloneSizes(row.sizes);
      row.sizes = row.sizes.filter((s) => normalizeSizeCode(s.code) !== sizeCode);
      if (row.sizes.length <= 1) row.size_selector = false;
      syncParentQtyFromSizes(row);
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: "remove_size",
        before: { sizes: before },
        after: { sizes: cloneSizes(row.sizes), size_selector: row.size_selector },
        note: note || `Retrait ${sizeCode}`,
      });
      return cloneRow(row);
    },

    setAudience({ productId, audience, actor }) {
      const allowed = new Set(["femmes", "hommes", "enfants", "unisexe"]);
      const next = String(audience || "").trim().toLowerCase();
      if (!allowed.has(next)) {
        const err = new Error("Clientèle inconnue");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      const before = row.audience || null;
      if (before === next) return cloneRow(row);
      row.audience = next;
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: "set_audience",
        before: { audience: before },
        after: { audience: next },
        note: `Clientèle : ${next}`,
      });
      return cloneRow(row);
    },

    /** Export pour persistance privée locale. */
    exportSnapshot() {
      return {
        items: list(),
        audit: audit.slice(0, 500),
        data_mode: dataMode,
        exported_at: new Date().toISOString(),
      };
    },

    importAudit(entries = []) {
      for (const e of entries.slice().reverse()) {
        audit.unshift({
          id: e.id || newId("aud"),
          at: e.at || new Date().toISOString(),
          actor: e.actor || actorDefault,
          product_id: e.product_id,
          action: e.action,
          before: e.before ?? null,
          after: e.after ?? null,
          note: e.note || "",
          data_mode: e.data_mode || dataMode,
        });
      }
      if (audit.length > 500) audit.length = 500;
    },

    setMinStockTarget({ productId, minStockTarget, actor, note, confirm }) {
      if (!confirm) {
        const err = new Error("Confirmation requise avant de modifier l'objectif minimum");
        err.status = 400;
        throw err;
      }
      const row = requireRow(productId);
      const parsed = Math.floor(Number(minStockTarget));
      if (!Number.isFinite(parsed) || parsed < 0) {
        const err = new Error("Objectif minimum invalide (entier ≥ 0)");
        err.status = 400;
        throw err;
      }
      const before = { min_stock_target: row.min_stock_target };
      row.min_stock_target = parsed;
      row.updated_at = new Date().toISOString();
      pushAudit({
        actor,
        product_id: productId,
        action: "set_min_stock",
        before,
        after: { min_stock_target: row.min_stock_target },
        note,
      });
      return cloneRow(row);
    },
  };
}
