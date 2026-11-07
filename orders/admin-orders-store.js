/**
 * Store fichier local des commandes admin Lucie.
 * Ne présente jamais de commandes inventées comme « réelles » : source explicite.
 */
import fs from "node:fs";
import path from "node:path";
import {
  assertFulfillmentStatus,
  assertNoInventedShippingFee,
  emptyShipping,
  mergeShippingOnImport,
  normalizeOrder,
} from "./orders-core.js";

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAdminOrdersStore(filePath, opts = {}) {
  const actorDefault = opts.actor || "lucie-local";

  function readAll() {
    if (!fs.existsSync(filePath)) {
      return { version: 1, orders: [] };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { version: raw.version || 1, orders: Array.isArray(raw.orders) ? raw.orders : [] };
  }

  function writeAll(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, filePath);
  }

  function list() {
    return readAll()
      .orders.map(normalizeOrder)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  function get(id) {
    const o = list().find((x) => x.id === id || x.session_id === id);
    return o || null;
  }

  function upsertFromImport(orderInput) {
    const data = readAll();
    const next = normalizeOrder(orderInput);
    if (!next.session_id) {
      const err = new Error("session_id requis");
      err.status = 400;
      throw err;
    }
    const idx = data.orders.findIndex(
      (o) => o.session_id === next.session_id || o.id === next.session_id,
    );
    if (idx >= 0) {
      // Préserve ops Lucie ; rafraîchit paiement / items si import Stripe
      const prev = normalizeOrder(data.orders[idx]);
      data.orders[idx] = {
        ...prev,
        ...next,
        fulfillment_status: prev.fulfillment_status,
        status_history: prev.status_history,
        shipping: mergeShippingOnImport(prev.shipping, next.shipping),
        notes_lucie: prev.notes_lucie,
        archived: prev.archived,
        archived_at: prev.archived_at,
        updated_at: new Date().toISOString(),
      };
    } else {
      if (!next.status_history.length) {
        next.status_history = [
          {
            id: newId("hist"),
            at: new Date().toISOString(),
            actor: "system",
            field: "created",
            before: null,
            after: next.fulfillment_status,
            note: `Import ${next.source_label}`,
          },
        ];
      }
      data.orders.push(next);
    }
    writeAll(data);
    return normalizeOrder(get(next.session_id));
  }

  function updateFulfillment({ id, fulfillment_status, actor, note, confirm }) {
    if (!confirm) {
      const err = new Error("Confirmation requise");
      err.status = 400;
      throw err;
    }
    assertFulfillmentStatus(fulfillment_status);
    const data = readAll();
    const idx = data.orders.findIndex((o) => o.id === id || o.session_id === id);
    if (idx < 0) {
      const err = new Error("Commande introuvable");
      err.status = 404;
      throw err;
    }
    const prev = normalizeOrder(data.orders[idx]);
    const before = prev.fulfillment_status;
    prev.fulfillment_status = fulfillment_status;
    prev.updated_at = new Date().toISOString();
    prev.status_history = [
      {
        id: newId("hist"),
        at: prev.updated_at,
        actor: actor || actorDefault,
        field: "fulfillment_status",
        before,
        after: fulfillment_status,
        note: note || "",
      },
      ...prev.status_history,
    ].slice(0, 200);
    data.orders[idx] = prev;
    writeAll(data);
    return normalizeOrder(prev);
  }

  function updateShipping({ id, shipping, actor, note, confirm }) {
    if (!confirm) {
      const err = new Error("Confirmation requise");
      err.status = 400;
      throw err;
    }
    const data = readAll();
    const idx = data.orders.findIndex((o) => o.id === id || o.session_id === id);
    if (idx < 0) {
      const err = new Error("Commande introuvable");
      err.status = 404;
      throw err;
    }
    const prev = normalizeOrder(data.orders[idx]);
    const merged = { ...emptyShipping(), ...prev.shipping, ...shipping };
    if (shipping?.bus) merged.bus = { ...prev.shipping.bus, ...shipping.bus };
    if (shipping?.package) merged.package = { ...prev.shipping.package, ...shipping.package };
    // Ne jamais effacer le choix client si Lucie change seulement le transporteur utilisé
    if (!merged.client_chosen_method) {
      merged.client_chosen_method =
        prev.shipping?.client_chosen_method ||
        (prev.shipping?.method && prev.shipping.method !== "a_confirmer"
          ? prev.shipping.method
          : null);
    }
    assertNoInventedShippingFee(merged);
    const before = prev.shipping;
    prev.shipping = merged;
    prev.updated_at = new Date().toISOString();
    prev.status_history = [
      {
        id: newId("hist"),
        at: prev.updated_at,
        actor: actor || actorDefault,
        field: "shipping",
        before,
        after: merged,
        note: note || "",
      },
      ...prev.status_history,
    ].slice(0, 200);
    data.orders[idx] = prev;
    writeAll(data);
    return normalizeOrder(prev);
  }

  function findIndex(data, id) {
    return data.orders.findIndex((o) => o.id === id || o.session_id === id);
  }

  function pushHist(prev, actor, field, before, after, note) {
    prev.status_history = [
      {
        id: newId("hist"),
        at: prev.updated_at,
        actor: actor || actorDefault,
        field,
        before,
        after,
        note: note || "",
      },
      ...(prev.status_history || []),
    ].slice(0, 200);
  }

  /** Modifier coordonnées / notes — jamais le paiement Stripe. */
  function updateDetails({ id, patch = {}, actor, note, confirm }) {
    if (!confirm) {
      const err = new Error("Confirmation requise");
      err.status = 400;
      throw err;
    }
    const data = readAll();
    const idx = findIndex(data, id);
    if (idx < 0) {
      const err = new Error("Commande introuvable");
      err.status = 404;
      throw err;
    }
    const prev = normalizeOrder(data.orders[idx]);
    const before = {
      customer_name: prev.customer_name,
      customer_email: prev.customer_email,
      customer_phone: prev.customer_phone,
      shipping_address: prev.shipping_address,
      notes_lucie: prev.notes_lucie,
    };
    if (patch.customer_name !== undefined) {
      prev.customer_name = String(patch.customer_name || "").trim() || null;
    }
    if (patch.customer_email !== undefined) {
      prev.customer_email = String(patch.customer_email || "").trim() || null;
    }
    if (patch.customer_phone !== undefined) {
      prev.customer_phone = String(patch.customer_phone || "").trim() || null;
    }
    if (patch.notes_lucie !== undefined) {
      prev.notes_lucie = String(patch.notes_lucie || "");
    }
    if (patch.shipping_address && typeof patch.shipping_address === "object") {
      const a = patch.shipping_address;
      prev.shipping_address = {
        line1: String(a.line1 || "").trim() || null,
        line2: String(a.line2 || "").trim() || null,
        city: String(a.city || "").trim() || null,
        state: String(a.state || "").trim() || null,
        postal_code: String(a.postal_code || "").trim() || null,
        country: String(a.country || "CA").trim() || "CA",
      };
    }
    prev.updated_at = new Date().toISOString();
    pushHist(prev, actor, "details", before, {
      customer_name: prev.customer_name,
      customer_email: prev.customer_email,
      customer_phone: prev.customer_phone,
      shipping_address: prev.shipping_address,
      notes_lucie: prev.notes_lucie,
    }, note || "Coordonnées / notes mises à jour");
    data.orders[idx] = prev;
    writeAll(data);
    return normalizeOrder(prev);
  }

  /** Archiver (prioritaire) — masque de la liste active, conservée. */
  function setArchived({ id, archived, actor, note, confirm }) {
    if (!confirm) {
      const err = new Error("Confirmation requise");
      err.status = 400;
      throw err;
    }
    const data = readAll();
    const idx = findIndex(data, id);
    if (idx < 0) {
      const err = new Error("Commande introuvable");
      err.status = 404;
      throw err;
    }
    const prev = normalizeOrder(data.orders[idx]);
    const nextArchived = !!archived;
    if (prev.archived === nextArchived) return prev;
    const before = prev.archived;
    prev.archived = nextArchived;
    prev.archived_at = nextArchived ? new Date().toISOString() : null;
    prev.updated_at = new Date().toISOString();
    pushHist(
      prev,
      actor,
      "archived",
      before,
      nextArchived,
      note || (nextArchived ? "Commande archivée" : "Commande désarchivée"),
    );
    data.orders[idx] = prev;
    writeAll(data);
    return normalizeOrder(prev);
  }

  /** Suppression définitive locale — exige confirm (dialogue UI). */
  function deleteOrder({ id, actor, confirm }) {
    if (!confirm) {
      const err = new Error("Confirmation requise");
      err.status = 400;
      throw err;
    }
    const data = readAll();
    const idx = findIndex(data, id);
    if (idx < 0) {
      const err = new Error("Commande introuvable");
      err.status = 404;
      throw err;
    }
    const removed = normalizeOrder(data.orders[idx]);
    data.orders.splice(idx, 1);
    writeAll(data);
    return {
      ok: true,
      deleted_id: removed.session_id || removed.id,
      order_number: removed.order_number,
      actor: actor || actorDefault,
    };
  }

  return {
    filePath,
    list,
    get,
    upsertFromImport,
    updateFulfillment,
    updateShipping,
    updateDetails,
    setArchived,
    deleteOrder,
    readAll,
  };
}
