/**
 * Mesure approximative du chargement initial boutique (cold).
 * Utilise Playwright si dispo, sinon estimation statique des assets 1er écran.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileSize(rel) {
  const p = path.join(root, rel.replace(/^\//, ""));
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
}

function staticEstimate() {
  const html = fs.readFileSync(path.join(root, "boutique.html"), "utf8");
  const eagerWebp = [...html.matchAll(/loading="eager"[\s\S]*?srcset="(assets\/produits\/webp\/[^"]+)"/g)];
  // picture order is source then img — fix regex: source before img with eager on img
  const pictures = [...html.matchAll(/<picture><source type="image\/webp" srcset="([^"]+)"><img[^>]*loading="([^"]+)"[^>]*>/g)];
  const priority = pictures.filter((m) => m[2] === "eager").map((m) => m[1]);
  const css = fileSize("style.css");
  const site = fileSize("site.js");
  const page = fileSize("boutique.html");
  const logo = fileSize("assets/logo-fourrures-boreales.webp") || fileSize("assets/logo-fourrures-boreales.png");
  let imgBytes = 0;
  for (const w of priority) imgBytes += fileSize(w);
  return {
    method: "static_estimate_first_paint_candidates",
    eager_images: priority.length,
    eager_webp_paths: priority,
    bytes: {
      html: page,
      css,
      site_js: site,
      logo,
      eager_product_webp: imgBytes,
      total_critical_approx: page + css + site + logo + imgBytes,
    },
    note: "Les 64 images lazy ne sont pas comptées dans le total critique (hors écran).",
  };
}

async function tryPlaywright(port) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }
  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const results = {};
  for (const [label, viewport] of [
    ["mobile_390", { width: 390, height: 844 }],
    ["desktop_1440", { width: 1440, height: 900 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const urls = new Map();
    page.on("response", async (res) => {
      try {
        const u = res.url();
        if (!u.includes("127.0.0.1") && !u.includes("localhost")) return;
        const req = res.request();
        if (req.resourceType() === "image" || u.includes(".webp") || u.includes(".png") || u.includes(".css") || u.includes(".js") || u.endsWith("boutique.html") || u.endsWith("/")) {
          const buf = await res.body().catch(() => null);
          urls.set(u, { status: res.status(), bytes: buf ? buf.length : 0, type: req.resourceType() });
        }
      } catch {
        /* ignore */
      }
    });
    await page.goto(`http://127.0.0.1:${port}/boutique.html`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    const imgReqs = [...urls.entries()].filter(([u, i]) => i.type === "image" || /\.(webp|png)(\?|$)/i.test(u));
    const productImgs = imgReqs.filter(([u]) => u.includes("/produits/"));
    results[label] = {
      viewport,
      total_requests_tracked: urls.size,
      product_image_requests: productImgs.length,
      product_image_bytes: productImgs.reduce((s, [, i]) => s + i.bytes, 0),
      all_tracked_bytes: [...urls.values()].reduce((s, i) => s + i.bytes, 0),
    };
    // warm cache second load
    const urls2 = new Map();
    page.removeAllListeners("response");
    page.on("response", async (res) => {
      try {
        const u = res.url();
        const fromCache = res.fromCache?.() || false;
        const buf = await res.body().catch(() => null);
        urls2.set(u, { bytes: buf ? buf.length : 0, fromCache, status: res.status() });
      } catch {
        /* */
      }
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    results[label].warm = {
      tracked: urls2.size,
      note: "reload same session — navigateur peut servir depuis cache disque/mémoire",
    };
    await context.close();
  }
  await browser.close();
  return results;
}

function startStaticServer(port) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webp": "image/webp",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(root, urlPath.replace(/^\//, ""));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const estimate = staticEstimate();
const port = 8767;
const server = await startStaticServer(port);
let live = null;
try {
  live = await tryPlaywright(port);
} catch (e) {
  live = { error: String(e) };
}
server.close();

const out = {
  visible_strategy: {
    mobile_390: "grille 2 col — ~2 cartes 1re rangée au-dessus de la ligne de flottaison typique (sous bannière)",
    desktop_1440: "grille 4 col — 1re rangée 4 cartes, mais high limité à 2 (LCP) ; les 2 autres lazy près du viewport se chargent vite",
    filter: "cards[hidden]=true — images lazy des cartes masquées ne devraient pas partir (hors viewport)",
  },
  static: estimate,
  playwright: live,
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(root, "docs", "_measure-boutique-load.json"), JSON.stringify(out, null, 2));
