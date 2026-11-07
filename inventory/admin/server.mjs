/**
 * Serveur LOCAL uniquement — admin inventaire Lucie.
 * Usage :
 *   set INVENTORY_ADMIN_PASSWORD=********
 *   set INVENTORY_ADMIN_DATA=provisional
 *   node inventory/admin/server.mjs
 *
 * Bind 127.0.0.1 seulement. Aucun deploy. Jamais servi par GitHub Pages.
 * Persistance privée : inventory/admin/data/lucie-inventory.json (gitignoré).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdminInventoryStore } from "./lib/admin-store.js";
import { createAuth, parseBearer } from "./lib/auth.js";
import { listCategories } from "./lib/ui-helpers.js";
import { loadPersisted, savePersisted, ensureDataDir } from "./lib/persist.js";
import { loadAccount } from "./lib/account-store.js";
import { createAdminOrdersStore } from "../../orders/admin-orders-store.js";
import {
  filterOrders,
  summarizeOrders,
  sortOrders,
  withOrderLateness,
  FULFILLMENT_STATUSES,
  SHIPPING_FEE_STATUSES,
  SHIPPING_METHODS,
} from "../../orders/orders-core.js";
import { importPaidOrdersFromStripeTest } from "../../orders/stripe-test-import.js";
import { createClientsRegistry } from "../../orders/clients-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const HOST = process.env.INVENTORY_ADMIN_HOST || "127.0.0.1";
const PORT = Number(process.env.INVENTORY_ADMIN_PORT || 8791);
const DATA_MODE = process.env.INVENTORY_ADMIN_DATA || "provisional"; // provisional | demo | real-seed

const publicDir = path.join(__dirname, "public");
const assetsDir = path.join(root, "assets");
ensureDataDir(__dirname);
const ordersStore = createAdminOrdersStore(path.join(root, "orders/admin-orders.json"));
const clientsRegistry = createClientsRegistry(path.join(root, "orders/clients-registry.json"));
const shippingConfig = JSON.parse(
  fs.readFileSync(path.join(root, "shipping/shipping-config.json"), "utf8"),
);

function audienceFilePath() {
  return path.join(root, "catalog/audience.json");
}

function loadAudienceMap() {
  try {
    const doc = JSON.parse(fs.readFileSync(audienceFilePath(), "utf8"));
    const map = new Map();
    for (const [id, row] of Object.entries(doc.products || {})) {
      if (row && row.audience) map.set(id, row.audience);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeAudienceFile(productId, audience, extra = {}) {
  const fp = audienceFilePath();
  const doc = JSON.parse(fs.readFileSync(fp, "utf8"));
  if (!doc.products) doc.products = {};
  const prev = doc.products[productId] || {};
  doc.products[productId] = {
    audience,
    source: "lucie",
    product_number: extra.product_number ?? prev.product_number ?? null,
    name_fr: extra.name_fr || prev.name_fr || "",
  };
  doc.uncertain = (doc.uncertain || []).filter((row) => row.id !== productId);
  const text = JSON.stringify(doc, null, 2) + "\n";
  fs.writeFileSync(fp, text, "utf8");
  const docsCopy = path.join(root, "docs/catalog/audience.json");
  if (fs.existsSync(path.dirname(docsCopy))) fs.writeFileSync(docsCopy, text, "utf8");
}

function catalogImageMap() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));
  const map = new Map();
  for (const p of catalog.products || []) {
    map.set(p.id, { image: p.image || "", category: p.category || "", name_fr: p.name_fr });
  }
  return map;
}

function enrichItems(items) {
  const map = catalogImageMap();
  const audiences = loadAudienceMap();
  return (items || []).map((i) => {
    const cat = map.get(i.product_id) || {};
    return {
      ...i,
      image: i.image || cat.image || "",
      category: i.category || cat.category || "",
      name_fr: i.name_fr || cat.name_fr || i.product_id,
      // catalog/audience.json prime (ex. cache-oreilles → tous) ; inventaire en secours
      audience: audiences.get(i.product_id) || i.audience || null,
      min_stock_target: i.min_stock_target ?? 3,
    };
  });
}

function loadSeed() {
  const persisted = loadPersisted(__dirname);
  if (persisted?.items?.length) {
    return {
      items: enrichItems(persisted.items),
      audit: persisted.audit || [],
      meta: {
        data_mode: persisted.data_mode || DATA_MODE,
        lucie_validated_for_sale: !!persisted.lucie_validated_for_sale,
        warning_fr:
          persisted.warning_fr ||
          (persisted.lucie_validated_for_sale
            ? "Inventaire local enregistré. La vente en ligne reste désactivée tant que Francis n’active pas AVAILABILITY_CONFIGURED."
            : "Quantités PROVISOIRES (fichier privé local). Pas encore validées pour la vente en ligne."),
      },
    };
  }

  if (DATA_MODE === "provisional") {
    const prov = JSON.parse(
      fs.readFileSync(path.join(root, "inventory/provisional-inventory.json"), "utf8"),
    );
    const items = (prov.items || []).map((i) => ({
      product_id: i.product_id,
      product_number: i.product_number,
      name_fr: i.name_fr,
      category: i.category,
      qty_on_hand: i.qty_physical_provisional ?? 3,
      provisional_qty_on_hand: i.qty_physical_provisional ?? 3,
      qty_reserved: i.qty_reserved || 0,
      qty_sold: i.qty_sold || 0,
      min_stock_target: i.min_stock_target ?? 3,
      lucie_confirmed: false,
      notes_lucie: "",
    }));
    return {
      items: enrichItems(items),
      audit: [],
      meta: {
        data_mode: "provisional",
        lucie_validated_for_sale: false,
        warning_fr:
          "INVENTAIRE PROVISOIRE — 3 exemplaires par produit (198 au total). Ce ne sont PAS des quantités physiquement vérifiées par Lucie. Modifiez ici ; la vente en ligne reste fermée jusqu’à validation explicite.",
      },
    };
  }

  if (DATA_MODE === "real-seed") {
    const real = JSON.parse(
      fs.readFileSync(path.join(root, "inventory/inventory.json"), "utf8"),
    );
    return {
      items: enrichItems(real.items || []),
      audit: [],
      meta: {
        data_mode: "real-seed",
        lucie_validated_for_sale: false,
        warning_fr:
          "Inventaire réel (quantités souvent « À confirmer »). Enregistrement dans le fichier privé local seulement.",
      },
    };
  }
  const demoPath = path.join(__dirname, "demo/demo-inventory.json");
  if (!fs.existsSync(demoPath)) {
    throw new Error("demo-inventory.json manquant — lancer scripts/generate-demo-inventory.mjs");
  }
  const demo = JSON.parse(fs.readFileSync(demoPath, "utf8"));
  return {
    items: enrichItems(demo.items || []),
    audit: [],
    meta: {
      data_mode: "demo",
      lucie_validated_for_sale: false,
      warning_fr:
        demo.warning_fr ||
        "Démonstration seulement — ce ne sont pas les vraies quantités de Lucie.",
    },
  };
}

const seed = loadSeed();
const store = createAdminInventoryStore(seed.items, { dataMode: seed.meta.data_mode });
if (seed.audit?.length) store.importAudit(seed.audit);
const auth = createAuth({ adminRoot: __dirname });
let lucieValidatedForSale = !!seed.meta.lucie_validated_for_sale;

function syncProductSizesFromInventory(items) {
  const sizesPath = path.join(root, "catalog/product-sizes.json");
  let doc = {
    version: 1,
    provisional: true,
    default_qty_per_size: 3,
    note_fr:
      "Tailles / stocks synchronisés depuis l’inventaire Lucie local. Provisoire jusqu’à validation vente.",
    note_en: "Sizes / stock synced from Lucie’s local inventory. Provisional until sale validation.",
    products: {},
  };
  if (fs.existsSync(sizesPath)) {
    try {
      doc = { ...doc, ...JSON.parse(fs.readFileSync(sizesPath, "utf8")) };
      doc.products = doc.products || {};
    } catch {
      /* keep defaults */
    }
  }
  for (const it of items || []) {
    const sizes = Array.isArray(it.sizes) && it.sizes.length
      ? it.sizes.map((s) => ({
          code: s.code,
          label_fr: s.label_fr || s.code,
          label_en: s.label_en || s.label_fr || s.code,
          group: s.group || undefined,
          qty_on_hand: s.qty_on_hand == null ? 0 : Math.floor(Number(s.qty_on_hand)) || 0,
        }))
      : [
          {
            code: "unique",
            label_fr: "Format unique",
            label_en: "One size",
            qty_on_hand: it.qty_on_hand == null ? 0 : Math.floor(Number(it.qty_on_hand)) || 0,
          },
        ];
    const prev = doc.products[it.product_id] || {};
    doc.products[it.product_id] = {
      product_number: it.product_number ?? prev.product_number ?? null,
      category: it.category || prev.category || "",
      selector: !!(it.size_selector || sizes.length > 1),
      size_groups: it.size_groups || prev.size_groups || undefined,
      sizes,
    };
  }
  fs.writeFileSync(sizesPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
  const workerCopy = path.join(root, "worker/src/product-sizes.json");
  fs.writeFileSync(workerCopy, JSON.stringify(doc, null, 2) + "\n", "utf8");
  const docsCopy = path.join(root, "docs/catalog/product-sizes.json");
  try {
    fs.mkdirSync(path.dirname(docsCopy), { recursive: true });
    fs.writeFileSync(docsCopy, JSON.stringify(doc, null, 2) + "\n", "utf8");
  } catch {
    /* docs optional */
  }
}

function persistNow() {
  const snap = store.exportSnapshot();
  savePersisted(__dirname, snap, {
    data_mode: store.dataMode,
    lucie_validated_for_sale: lucieValidatedForSale,
    warning_fr: seed.meta.warning_fr,
    sales_online_enabled: false,
    note_fr:
      "Fichier privé local. Ne jamais publier sur GitHub Pages. Vente en ligne = Worker + AVAILABILITY_CONFIGURED seulement après validation Lucie.",
  });
  try {
    syncProductSizesFromInventory(snap.items || []);
  } catch (err) {
    console.error("sync product-sizes:", err.message);
  }
}

// Première ouverture provisoire → créer le fichier privé tout de suite
if (!loadPersisted(__dirname)?.items?.length && DATA_MODE === "provisional") {
  persistNow();
}

function sendJson(res, status, body, extraHeaders = {}) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(raw);
}

function setCookieHeader(cookieLine) {
  return cookieLine ? { "Set-Cookie": cookieLine } : {};
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("JSON invalide"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function contentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function safeFileUnder(baseDir, urlPath) {
  const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "");
  const filePath = path.join(baseDir, rel);
  if (!filePath.startsWith(baseDir)) return null;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return null;
  return filePath;
}

function serveFile(res, filePath) {
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, urlPath) {
  if (urlPath.startsWith("/assets/")) {
    const filePath = safeFileUnder(assetsDir, urlPath.slice("/assets/".length));
    if (!filePath) {
      sendJson(res, 404, { error: "Photo introuvable" });
      return;
    }
    serveFile(res, filePath);
    return;
  }
  if (urlPath.startsWith("/lib/")) {
    const libDir = path.join(__dirname, "lib");
    const filePath = safeFileUnder(libDir, urlPath.slice("/lib/".length));
    if (!filePath) {
      sendJson(res, 404, { error: "Introuvable" });
      return;
    }
    serveFile(res, filePath);
    return;
  }
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = safeFileUnder(publicDir, rel);
  if (!filePath) {
    sendJson(res, 404, { error: "Introuvable" });
    return;
  }
  serveFile(res, filePath);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    const items = store.list();
    const units = items.reduce(
      (a, i) => a + (i.qty_on_hand == null ? 0 : Math.max(0, Math.floor(Number(i.qty_on_hand)) || 0)),
      0,
    );
    const st = auth.status();
    return sendJson(res, 200, {
      ok: true,
      local_only: true,
      data_mode: store.dataMode,
      auth_configured: st.configured,
      must_change_password: st.must_change_password,
      sales_enabled: false,
      lucie_validated_for_sale: lucieValidatedForSale,
      availability: "contact",
      products: items.length,
      units_on_hand: units,
      orders_count: ordersStore.list().length,
      shipping_configured: false,
      stripe_mode: "TEST_ONLY",
      shipping_methods_enabled: Object.fromEntries(
        Object.entries(shippingConfig.methods || {}).map(([k, v]) => [k, !!v.enabled]),
      ),
      persist_file: "inventory/admin/data/lucie-inventory.json",
    });
  }

  if (pathname === "/api/auth/status" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, ...auth.status() });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const session = await auth.login(body.password || "", {
      remember: !!body.remember,
    });
    const cookie = auth.sessionCookieHeader(session.token, {
      remember: session.remember,
    });
    return sendJson(
      res,
      200,
      {
        ok: true,
        token: session.token,
        expires_in_sec: session.expires_in_sec,
        must_change_password: session.must_change_password,
        remember: session.remember,
        data_mode: store.dataMode,
        warning_fr: seed.meta.warning_fr,
      },
      setCookieHeader(cookie),
    );
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    auth.logout(parseBearer(req));
    return sendJson(res, 200, { ok: true }, setCookieHeader(auth.sessionCookieHeader("", { clear: true })));
  }

  if (pathname === "/api/password/forgot" && req.method === "POST") {
    const body = await readBody(req);
    const baseUrl = `http://${HOST}:${PORT}`;
    const result = await auth.requestPasswordReset({
      email: body.email || "",
      baseUrl,
    });
    return sendJson(res, 200, result);
  }

  if (pathname === "/api/password/reset" && req.method === "POST") {
    const body = await readBody(req);
    await auth.resetPasswordWithToken({
      token: body.token || "",
      newPassword: body.new_password || "",
      confirmPassword: body.confirm_password || "",
    });
    return sendJson(res, 200, {
      ok: true,
      message_fr: "Mot de passe mis à jour. Vous pouvez vous connecter.",
    });
  }

  const token = parseBearer(req);

  if (pathname === "/api/password/change" && req.method === "POST") {
    auth.requireSession(token, { allowMustChange: true });
    const body = await readBody(req);
    await auth.changePassword({
      token,
      currentPassword: body.current_password || "",
      newPassword: body.new_password || "",
      confirmPassword: body.confirm_password || "",
    });
    return sendJson(res, 200, {
      ok: true,
      must_change_password: false,
      message_fr: "Mot de passe enregistré. L’ancien temporaire ne fonctionne plus.",
    });
  }

  auth.requireSession(token);

  if (pathname === "/api/inventory" && req.method === "GET") {
    const items = store.list();
    const units = items.reduce(
      (a, i) => a + (i.qty_on_hand == null ? 0 : Math.max(0, Math.floor(Number(i.qty_on_hand)) || 0)),
      0,
    );
    return sendJson(res, 200, {
      data_mode: store.dataMode,
      warning_fr: seed.meta.warning_fr,
      lucie_validated_for_sale: lucieValidatedForSale,
      sales_online_enabled: false,
      units_on_hand: units,
      summary: store.summarize(),
      default_min_stock_target: store.defaultMinStockTarget,
      categories: listCategories(items),
      items,
      note_fr:
        "Les changements sont enregistrés sur ce PC seulement. La boutique en ligne n’utilise pas encore ces quantités.",
    });
  }

  if (pathname === "/api/audit" && req.method === "GET") {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    return sendJson(res, 200, {
      entries: store.listAudit({
        productId: u.searchParams.get("product_id") || null,
        limit: Number(u.searchParams.get("limit") || 50),
      }),
    });
  }

  const mSet = pathname.match(/^\/api\/inventory\/([^/]+)\/qty$/);
  if (mSet && req.method === "POST") {
    const body = await readBody(req);
    const row = store.setQty({
      productId: decodeURIComponent(mSet[1]),
      qty: body.qty,
      confirm: !!body.confirm,
      note: body.note || "Correction inventaire physique",
      actor: "lucie-local",
      expectedQty: body.expected_qty,
    });
    persistNow();
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      message_fr:
        row.qty_on_hand === 0
          ? "Stock total corrigé : rupture de stock (0)."
          : `Stock total corrigé : ${row.qty_on_hand} exemplaire(s).`,
      item: row,
      summary: store.summarize(),
    });
  }

  const mAdj = pathname.match(/^\/api\/inventory\/([^/]+)\/adjust$/);
  if (mAdj && req.method === "POST") {
    const body = await readBody(req);
    const row = store.adjustQty({
      productId: decodeURIComponent(mAdj[1]),
      delta: body.delta ?? 1,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
      expectedQty: body.expected_qty,
      sizeCode: body.size_code || body.size || null,
    });
    persistNow();
    const sign = (body.delta ?? 1) > 0 ? "+" : "−";
    const sizeNote = body.size_code || body.size ? ` [${body.size_code || body.size}]` : "";
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      message_fr:
        row.qty_on_hand === 0
          ? `Enregistré (${sign}1)${sizeNote} : rupture de stock (0).`
          : `Enregistré (${sign}1)${sizeNote} : ${row.qty_on_hand} exemplaire(s) au total.`,
      item: row,
      summary: store.summarize(),
    });
  }

  const mAud = pathname.match(/^\/api\/inventory\/([^/]+)\/audience$/);
  if (mAud && req.method === "POST") {
    const body = await readBody(req);
    const productId = decodeURIComponent(mAud[1]);
    const row = store.setAudience({
      productId,
      audience: body.audience,
      actor: "lucie-local",
    });
    persistNow();
    writeAudienceFile(productId, row.audience, row);
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      local_only: true,
      message_fr: "Clientèle enregistrée sur ce PC. La boutique locale la relit au prochain affichage. Rien n’est publié en ligne.",
      item: row,
    });
  }

  const mSize = pathname.match(/^\/api\/inventory\/([^/]+)\/sizes$/);
  if (mSize && req.method === "POST") {
    const body = await readBody(req);
    const row = store.upsertSize({
      productId: decodeURIComponent(mSize[1]),
      code: body.code,
      label_fr: body.label_fr,
      label_en: body.label_en,
      qty_on_hand: body.qty_on_hand,
      selector: body.selector,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    persistNow();
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      message_fr: `Taille « ${body.code} » enregistrée.`,
      item: row,
      summary: store.summarize(),
    });
  }

  const mSizeDel = pathname.match(/^\/api\/inventory\/([^/]+)\/sizes\/([^/]+)$/);
  if (mSizeDel && req.method === "DELETE") {
    const body = await readBody(req).catch(() => ({}));
    const row = store.removeSize({
      productId: decodeURIComponent(mSizeDel[1]),
      code: decodeURIComponent(mSizeDel[2]),
      confirm: body.confirm !== false,
      note: body.note || "",
      actor: "lucie-local",
    });
    persistNow();
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      message_fr: `Taille retirée.`,
      item: row,
      summary: store.summarize(),
    });
  }

  const mAdd = pathname.match(/^\/api\/inventory\/([^/]+)\/add$/);
  if (mAdd && req.method === "POST") {
    const body = await readBody(req);
    const before =
      body.expected_qty == null || body.expected_qty === ""
        ? null
        : Math.floor(Number(body.expected_qty));
    const row = store.addFabricated({
      productId: decodeURIComponent(mAdd[1]),
      delta: body.delta ?? 1,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
      expectedQty: body.expected_qty,
    });
    persistNow();
    const added = Math.floor(Number(body.delta ?? 1));
    const prev = before == null || !Number.isFinite(before) ? "—" : String(before);
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      message_fr: `Ajouté +${added} : ${prev} → ${row.qty_on_hand} exemplaire(s).`,
      item: row,
      summary: store.summarize(),
    });
  }

  const mMin = pathname.match(/^\/api\/inventory\/([^/]+)\/min-stock$/);
  if (mMin && req.method === "POST") {
    const body = await readBody(req);
    const row = store.setMinStockTarget({
      productId: decodeURIComponent(mMin[1]),
      minStockTarget: body.min_stock_target,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    persistNow();
    return sendJson(res, 200, { ok: true, saved: true, item: row, summary: store.summarize() });
  }

  // ── Commandes Lucie ─────────────────────────────────────────────
  if (pathname === "/api/orders/meta" && req.method === "GET") {
    return sendJson(res, 200, {
      fulfillment_statuses: FULFILLMENT_STATUSES,
      shipping_fee_statuses: SHIPPING_FEE_STATUSES,
      shipping_methods: SHIPPING_METHODS,
      shipping_config_policy: shippingConfig.policy,
      shipping_methods_enabled: Object.fromEntries(
        Object.entries(shippingConfig.methods || {}).map(([k, v]) => [k, !!v.enabled]),
      ),
      stripe_mode: "TEST_ONLY",
      stripe_live: false,
    });
  }

  if (pathname === "/api/orders" && req.method === "GET") {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    const all = clientsRegistry.enrichOrders(ordersStore.list());
    const filtered = filterOrders(all, {
      filter: u.searchParams.get("filter") || "toutes",
      search: u.searchParams.get("q") || "",
    });
    const sort = u.searchParams.get("sort") === "newest" ? "newest" : "oldest";
    const now = new Date();
    const orders = sortOrders(
      filtered.map((o) => withOrderLateness(o, now)),
      sort,
    );
    return sendJson(res, 200, {
      total: all.length,
      count: orders.length,
      summary: summarizeOrders(all),
      sort,
      orders,
      stripe_mode: "TEST_ONLY",
      stripe_live: false,
      note_fr:
        "Les commandes « Jeu d’essai » ne sont pas des ventes réelles. Stripe TEST = paiements fictifs.",
    });
  }

  if (pathname === "/api/orders/import-stripe-test" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.confirm) {
      return sendJson(res, 400, { error: "Confirmation requise" });
    }
    const result = await importPaidOrdersFromStripeTest({
      devVarsPath: path.join(root, "worker/.dev.vars"),
      limit: Number(body.limit || 15),
    });
    const saved = [];
    for (const o of result.orders) {
      const row = ordersStore.upsertFromImport(o);
      saved.push(clientsRegistry.enrichOrders([row])[0]);
    }
    return sendJson(res, 200, {
      ok: true,
      imported_count: saved.length,
      skipped: result.skipped,
      orders: saved,
    });
  }

  const mOrd = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (mOrd && req.method === "GET") {
    const ord = ordersStore.get(decodeURIComponent(mOrd[1]));
    if (!ord) return sendJson(res, 404, { error: "Commande introuvable" });
    const enriched = clientsRegistry.enrichOrders([ord])[0];
    return sendJson(res, 200, { order: withOrderLateness(enriched) });
  }

  const mFul = pathname.match(/^\/api\/orders\/([^/]+)\/fulfillment$/);
  if (mFul && req.method === "POST") {
    const body = await readBody(req);
    const ord = ordersStore.updateFulfillment({
      id: decodeURIComponent(mFul[1]),
      fulfillment_status: body.fulfillment_status,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    return sendJson(res, 200, { ok: true, order: ord });
  }

  const mShip = pathname.match(/^\/api\/orders\/([^/]+)\/shipping$/);
  if (mShip && req.method === "POST") {
    const body = await readBody(req);
    const ord = ordersStore.updateShipping({
      id: decodeURIComponent(mShip[1]),
      shipping: body.shipping || {},
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    return sendJson(res, 200, { ok: true, order: ord });
  }

  const mDetails = pathname.match(/^\/api\/orders\/([^/]+)\/details$/);
  if (mDetails && req.method === "POST") {
    const body = await readBody(req);
    const ord = ordersStore.updateDetails({
      id: decodeURIComponent(mDetails[1]),
      patch: body.patch || body,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    return sendJson(res, 200, { ok: true, order: clientsRegistry.enrichOrders([ord])[0] });
  }

  const mArch = pathname.match(/^\/api\/orders\/([^/]+)\/archive$/);
  if (mArch && req.method === "POST") {
    const body = await readBody(req);
    const ord = ordersStore.setArchived({
      id: decodeURIComponent(mArch[1]),
      archived: body.archived !== false,
      confirm: !!body.confirm,
      note: body.note || "",
      actor: "lucie-local",
    });
    return sendJson(res, 200, { ok: true, order: clientsRegistry.enrichOrders([ord])[0] });
  }

  const mDel = pathname.match(/^\/api\/orders\/([^/]+)\/delete$/);
  if (mDel && req.method === "POST") {
    const body = await readBody(req);
    const result = ordersStore.deleteOrder({
      id: decodeURIComponent(mDel[1]),
      confirm: !!body.confirm,
      actor: "lucie-local",
    });
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: "Page introuvable" });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (u.pathname.startsWith("/api/")) {
      await handleApi(req, res, u.pathname);
      return;
    }
    serveStatic(req, res, u.pathname);
  } catch (err) {
    const status = err.status || 500;
    sendJson(res, status, { error: err.message || "Erreur" });
  }
});

if (!auth.isConfigured()) {
  console.error(
    "[inventaire-admin] Compte Lucie non configuré. Lancez d’abord :",
  );
  console.error(
    "  node inventory/admin/scripts/configurer-mot-de-passe-temporaire.mjs",
  );
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  const acc = loadAccount(__dirname);
  console.log(
    JSON.stringify({
      listening: `http://${HOST}:${PORT}/`,
      data_mode: store.dataMode,
      items: store.list().length,
      sales_enabled: false,
      must_change_password: !!acc?.must_change_password,
      stripe_mode: "TEST_ONLY",
      note: "Local only — pas de deploy, pas de courriel réel",
    }),
  );
});
