/**
 * Serveur de simulation locale. Écoute seulement 127.0.0.1.
 * Mémoire vive : les réservations disparaissent au redémarrage.
 * Ne lit que catalog/product-sizes.json. N'écrit aucun inventaire.
 * N'active pas AVAILABILITY_CONFIGURED dans wrangler. N'appelle pas Stripe.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { availabilityFromStore, rowsFromProductSizes } from "./src/sim-snapshot.js";
import { expireReservations, releaseReservation, reserveStock } from "./src/inventory.js";
import { createMemoryTxStore } from "./src/store/memory-tx.js";

const port = Number(process.env.SIM_PORT || 8792);
const bind = process.env.SIM_BIND || "127.0.0.1";
const sizesPath = new URL("../catalog/product-sizes.json", import.meta.url);
const sizes = JSON.parse(readFileSync(sizesPath, "utf8"));
const rows = rowsFromProductSizes(sizes);
const store = createMemoryTxStore(rows);

function allowOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return "";
}

function send(req, res, status, body) {
  const payload = JSON.stringify(body);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  };
  const origin = allowOrigin(req);
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(new Error("body"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": allowOrigin(req) || "null",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && url.pathname === "/api/sim/health") {
      send(req, res, 200, {
        ok: true,
        store: "memory-tx",
        durable: false,
        stripe_mode: "test-simulation",
        production_reservations: false,
        writes_real_inventory: false,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/sim/availability") {
      send(req, res, 200, availabilityFromStore(store, rows));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/sim/reservation") {
      const found = store.getReservation(url.searchParams.get("id"));
      send(req, res, found ? 200 : 404, found || { ok: false, reason: "missing" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sim/reserve") {
      const body = await readBody(req);
      const reserved = await reserveStock(store, { lines: body.lines || [] });
      send(req, res, 200, reserved);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sim/release") {
      const body = await readBody(req);
      const released = await releaseReservation(store, body.reservation_id, { reason: "released" });
      send(req, res, 200, released);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sim/expire") {
      const body = await readBody(req);
      const expired = await expireReservations(store, { now: body.now });
      send(req, res, 200, expired);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sim/stop") {
      send(req, res, 200, { ok: true, stopping: true });
      setTimeout(() => server.close(), 20);
      return;
    }
    send(req, res, 404, { ok: false });
  } catch (err) {
    send(req, res, err.status || 400, { ok: false, error: err.message || "erreur" });
  }
});

server.listen(port, bind, () => {
  process.stdout.write(`sim-inventory ${bind}:${port} memory-tx durable=false\n`);
});
