/**
 * Tests locaux — admin inventaire (seuil min, ajouts, corrections, historique).
 * Ne touche pas inventory/inventory.json réel ni Stripe.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MIN_STOCK_TARGET,
  applyAddFabricated,
  applyAdjustQty,
  previewAddToStock,
  isBelowMinStock,
  isOutOfStock,
  summarizeAlerts,
  validateQtyOnHand,
} from "../src/inventory-admin-core.js";
import { createAdminInventoryStore } from "../../inventory/admin/lib/admin-store.js";
import { createAuth } from "../../inventory/admin/lib/auth.js";
import { loadPersisted, savePersisted, dataFile } from "../../inventory/admin/lib/persist.js";
import {
  auditActionLabelFr,
  categoryLabelFr,
  filterItems,
  qtyDisplayLabel,
  stockStatusLabelFr,
} from "../../inventory/admin/lib/ui-helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demoPath = path.join(root, "inventory/admin/demo/demo-inventory.json");
const realPath = path.join(root, "inventory/inventory.json");
const provisionalPath = path.join(root, "inventory/provisional-inventory.json");
const adminRoot = path.join(root, "inventory/admin");

test("DEFAULT_MIN_STOCK_TARGET is 3 (objectif, pas qty)", () => {
  assert.equal(DEFAULT_MIN_STOCK_TARGET, 3);
});

test("null qty never triggers low-stock alert", () => {
  assert.equal(isBelowMinStock({ qty_on_hand: null, min_stock_target: 3 }), false);
});

test("qty under min triggers alert; qty at/above does not", () => {
  assert.equal(isBelowMinStock({ qty_on_hand: 2, min_stock_target: 3 }), true);
  assert.equal(isBelowMinStock({ qty_on_hand: 0, min_stock_target: 3 }), true);
  assert.equal(isBelowMinStock({ qty_on_hand: 3, min_stock_target: 3 }), false);
  assert.equal(isBelowMinStock({ qty_on_hand: 5, min_stock_target: 3 }), false);
});

test("validateQtyOnHand and applyAddFabricated", () => {
  assert.deepEqual(validateQtyOnHand(""), { ok: true, qty_on_hand: null });
  assert.equal(validateQtyOnHand(-1).ok, false);
  assert.deepEqual(applyAddFabricated(null, 2), {
    ok: true,
    qty_on_hand: 2,
    added: 2,
    previous: 0,
  });
  assert.deepEqual(applyAddFabricated(5, 3), {
    ok: true,
    qty_on_hand: 8,
    added: 3,
    previous: 5,
  });
  assert.equal(applyAddFabricated(1, 0).ok, false);
});

test("applyAdjustQty +/− and out of stock", () => {
  assert.deepEqual(applyAdjustQty(3, 1), { ok: true, qty_on_hand: 4, delta: 1 });
  assert.deepEqual(applyAdjustQty(3, -1), { ok: true, qty_on_hand: 2, delta: -1 });
  assert.equal(applyAdjustQty(0, -1).ok, false);
  assert.equal(isOutOfStock({ qty_on_hand: 0 }), true);
  assert.equal(isOutOfStock({ qty_on_hand: 2 }), false);
  assert.equal(stockStatusLabelFr({ qty_on_hand: 0 }), "Rupture de stock");
});

test("previewAddToStock 3+22=25 ; add does not replace", () => {
  assert.deepEqual(previewAddToStock(3, 22), {
    ok: true,
    current: 3,
    added: 22,
    new_total: 25,
  });
  assert.deepEqual(applyAddFabricated(3, 22), {
    ok: true,
    qty_on_hand: 25,
    added: 22,
    previous: 3,
  });
  assert.equal(previewAddToStock(3, 0).ok, false);
  assert.equal(previewAddToStock(3, -5).ok, false);
});

test("provisional inventory is 66×3=198 and not live sale", () => {
  const prov = JSON.parse(fs.readFileSync(provisionalPath, "utf8"));
  assert.equal(prov.items.length, 66);
  assert.equal(prov.totals.units_provisional, 198);
  assert.ok(prov.items.every((i) => i.qty_physical_provisional === 3));
  assert.equal(prov.data_mode, "provisional");
  assert.match(String(prov.warning_fr || ""), /PROVISOIRE|provisoire/i);
});

test("demo file is marked demo and does not overwrite real null policy", () => {
  assert.ok(fs.existsSync(demoPath), "generate demo first");
  const demo = JSON.parse(fs.readFileSync(demoPath, "utf8"));
  const real = JSON.parse(fs.readFileSync(realPath, "utf8"));
  assert.equal(demo.data_mode, "demo");
  assert.equal(demo.items.length, 66);
  assert.equal(real.items.length, 66);
  assert.ok(real.items.every((i) => i.qty_on_hand === null), "real qty must stay null");
  assert.ok(
    demo.items.some((i) => i.qty_on_hand != null),
    "demo should include some fictional qty for tests",
  );
});

test("admin store: set qty, add fabricated, min stock, audit, alerts", () => {
  const demo = JSON.parse(fs.readFileSync(demoPath, "utf8"));
  const store = createAdminInventoryStore(demo.items, { dataMode: "demo" });
  assert.equal(store.list().length, 66);

  const beforeSummary = store.summarize();
  assert.ok(beforeSummary.low_stock_count >= 1);

  assert.throws(() => store.setQty({ productId: "mitaines-m-renard", qty: 4, confirm: false }));

  const set = store.setQty({
    productId: "mitaines-m-renard",
    qty: 4,
    confirm: true,
    note: "correction test",
  });
  assert.equal(set.qty_on_hand, 4);
  assert.equal(set.below_min, false);

  const added = store.addFabricated({
    productId: "chapeau-fille-8-10-renard",
    delta: 3,
    confirm: true,
  });
  assert.equal(added.qty_on_hand, 3);

  const bulk = store.addFabricated({
    productId: "mitaines-m-renard",
    delta: 22,
    confirm: true,
    expectedQty: 4,
  });
  assert.equal(bulk.qty_on_hand, 26); // 4 + 22

  assert.throws(
    () =>
      store.addFabricated({
        productId: "mitaines-m-renard",
        delta: 1,
        confirm: true,
        expectedQty: 4,
      }),
    /changé entre-temps|Rechargez/i,
  );

  const corrected = store.setQty({
    productId: "mitaines-m-renard",
    qty: 22,
    confirm: true,
    expectedQty: 26,
  });
  assert.equal(corrected.qty_on_hand, 22); // FIXE à 22, pas +22

  const min = store.setMinStockTarget({
    productId: "mitaines-dame-m-renard",
    minStockTarget: 6,
    confirm: true,
  });
  assert.equal(min.min_stock_target, 6);
  assert.equal(min.below_min, true); // demo qty was 5

  const adj = store.adjustQty({
    productId: "mitaines-m-renard",
    delta: -1,
    confirm: true,
    expectedQty: 22,
  });
  assert.equal(adj.qty_on_hand, 21);

  const audit = store.listAudit({ limit: 15 });
  assert.ok(audit.length >= 5);
  assert.equal(audit[0].data_mode, "demo");
  assert.ok(audit.some((a) => a.action === "correct_total"));
  assert.ok(audit.some((a) => a.action === "add_stock"));
  assert.ok(audit.some((a) => a.action === "set_min_stock"));
  assert.ok(audit.some((a) => a.action === "adjust_minus"));
  const addEntry = audit.find((a) => a.action === "add_stock" && a.after?.added === 22);
  assert.ok(addEntry);
  assert.equal(addEntry.before.qty_on_hand, 4);
  assert.equal(addEntry.after.new_total, 26);

  const summary = summarizeAlerts(store.list());
  assert.equal(summary.total, 66);
  assert.ok(summary.unknown_qty_count >= 60);
  assert.ok("out_of_stock_count" in summary);

  const snap = store.exportSnapshot();
  assert.equal(snap.items.length, 66);
  assert.ok(snap.audit.length >= 4);
});

test("persist privée locale round-trip (fichier temporaire)", () => {
  const tmpDir = path.join(adminRoot, "data");
  const target = dataFile(adminRoot);
  const backup = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  try {
    const store = createAdminInventoryStore(
      [
        {
          product_id: "test-persist-a",
          product_number: 999,
          name_fr: "Test persist",
          qty_on_hand: 3,
          min_stock_target: 3,
        },
      ],
      { dataMode: "provisional" },
    );
    store.adjustQty({ productId: "test-persist-a", delta: 1, confirm: true });
    savePersisted(adminRoot, store.exportSnapshot(), {
      data_mode: "provisional",
      lucie_validated_for_sale: false,
    });
    const loaded = loadPersisted(adminRoot);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].qty_on_hand, 4);
    assert.ok(loaded.audit.length >= 1);
    assert.equal(loaded.lucie_validated_for_sale, false);
  } finally {
    if (backup != null) fs.writeFileSync(target, backup, "utf8");
    else if (fs.existsSync(target)) fs.unlinkSync(target);
    void tmpDir;
  }
});

test("auth without account file is not configured", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lfb-admin-"));
  fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
  const auth = createAuth({ adminRoot: tmp });
  assert.equal(auth.isConfigured(), false);
});

test("qtyDisplayLabel shows À confirmer for null", () => {
  assert.equal(qtyDisplayLabel(null), "À confirmer");
  assert.equal(qtyDisplayLabel(0), "0");
  assert.equal(qtyDisplayLabel(5), "5");
});

test("filter by name, category and alerts only", () => {
  const sample = [
    {
      product_id: "a",
      name_fr: "Mitaines dame renard",
      category: "mitaines",
      below_min: true,
    },
    {
      product_id: "b",
      name_fr: "Chapeau coyote",
      category: "chapeaux",
      below_min: false,
    },
    {
      product_id: "c",
      name_fr: "Mitaines enfant",
      category: "mitaines",
      below_min: false,
    },
  ];
  assert.equal(filterItems(sample, { search: "renard" }).length, 1);
  assert.equal(filterItems(sample, { category: "mitaines" }).length, 2);
  assert.equal(filterItems(sample, { onlyAlerts: true }).length, 1);
  assert.equal(filterItems(sample, { search: "mitaines", category: "chapeaux" }).length, 0);
  assert.equal(categoryLabelFr("mitaines"), "Mitaines");
  assert.equal(auditActionLabelFr("add_stock"), "Exemplaires ajoutés");
  assert.equal(auditActionLabelFr("correct_total"), "Stock total corrigé");
});

test("demo items include images; UI ajout + correction distincts", () => {
  const demo = JSON.parse(fs.readFileSync(demoPath, "utf8"));
  assert.ok(demo.items.every((i) => typeof i.image === "string" && i.image.includes("assets/")));
  const html = fs.readFileSync(path.join(root, "inventory/admin/public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "inventory/admin/public/admin.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "inventory/admin/public/admin.css"), "utf8");
  const server = fs.readFileSync(path.join(root, "inventory/admin/server.mjs"), "utf8");
  assert.match(js, /data-act="plus"/);
  assert.match(js, /data-act="minus"/);
  assert.match(js, /data-act="add-stock"/);
  assert.match(js, /Quantité à ajouter|add-input/);
  assert.match(js, /Ajouter au stock/);
  assert.match(js, /Corriger le stock total/);
  assert.match(js, /Nouveau stock/);
  assert.match(js, /busyIds/);
  assert.match(js, /expected_qty/);
  assert.match(html, /Corriger le stock total/);
  assert.match(html, /id="category"/);
  assert.match(html, /Chercher par nom/);
  assert.match(html, /id="toast"/);
  assert.doesNotMatch(html + js, /\bSKU\b|\bD1\b|\bStripe\b/);
  assert.match(css, /btn-add-stock/);
  assert.match(css, /min-height:\s*var\(--tap\)/);
  assert.match(server, /provisional/);
  assert.match(server, /persistNow/);
});

test("no inventory admin password committed in repo files", () => {
  const files = [
    path.join(root, "inventory/admin/server.mjs"),
    path.join(root, "inventory/admin/lib/auth.js"),
    path.join(root, "inventory/admin/public/admin.js"),
    path.join(root, "inventory/admin/README.md"),
  ];
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(t, /INVENTORY_ADMIN_PASSWORD\s*=\s*["'][^"']{8,}["']/);
    assert.doesNotMatch(t, /password:\s*["'](?!short|test-pass)[^"']{8,}["']/i);
  }
});
