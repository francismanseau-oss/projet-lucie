/**
 * Diagnostic navigateur : ouvre le hub #mesure et compte les tuiles produits.
 */
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function startServer(port) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webp": "image/webp",
    ".png": "image/png",
    ".svg": "image/svg+xml",
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
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    /* try sibling */
  }
  const candidates = [
    path.join(root, "node_modules", "playwright"),
    path.join(root, "worker", "node_modules", "playwright"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return import(pathToFileURL(path.join(c, "index.js")).href);
    }
  }
  // npx cache
  try {
    return require("playwright");
  } catch {
    return null;
  }
}

const port = 8768;
const server = await startServer(port);
const pw = await loadPlaywright();
if (!pw) {
  console.log(JSON.stringify({ error: "playwright_unavailable", fallback: "static_checks_only" }));
  server.close();
  process.exit(2);
}

const { chromium } = pw;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => logs.push({ type: "pageerror", text: String(err) }));

await page.goto(`http://127.0.0.1:${port}/creations-personnalisees.html#mesure`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(1500);

const result = await page.evaluate(() => {
  const panel = document.getElementById("cp-panel-mesure");
  const grid = document.getElementById("sm-products");
  const tiles = grid ? grid.querySelectorAll(".sm-product-tile") : [];
  const msg = document.getElementById("sm-msg");
  return {
    hash: location.hash,
    panelHidden: panel?.hidden ?? null,
    panelDisplay: panel ? getComputedStyle(panel).display : null,
    gridChildren: grid?.children.length ?? -1,
    tiles: tiles.length,
    apiPresent: typeof window.BOREALES_SUR_MESURE !== "undefined",
    msgText: msg && !msg.hidden ? msg.textContent : "",
    firstTileText: tiles[0]?.innerText?.slice(0, 80) || "",
    filters: document.getElementById("sm-filters")?.children.length ?? -1,
  };
});

await page.screenshot({
  path: path.join(root, "docs", "_diag-sur-mesure.png"),
  fullPage: true,
});

await browser.close();
server.close();

console.log(JSON.stringify({ result, logs: logs.slice(0, 30) }, null, 2));
