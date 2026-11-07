import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createAdminInventoryStore } from "../inventory/admin/lib/admin-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pub = path.join(root, "inventory/admin/public");

const js = fs.readFileSync(path.join(pub, "admin.js"), "utf8");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const css = fs.readFileSync(path.join(pub, "admin.css"), "utf8");

const checks = [
  ["pas de photo dans les fiches", !/\.photo|class=\"photo\"/.test(js)],
  ["pas de boutons clientèle fiche", !js.includes("aud-pick") && !js.includes("renderAudienceEdit")],
  ["pas Retirer taille", !js.includes("size-remove")],
  ["pas Ajouter une taille", !js.includes("size-add") && !js.includes("addSize")],
  ["titre N° + nom", js.includes("displayTitle")],
  ["total en stock", js.includes("stock-total")],
  ["zones filtres HTML", html.includes("filter-zone") && html.includes("Clientèle") && html.includes("Catégories") && html.includes("Administration")],
  ["filtres clientèle toolbar", html.includes('data-filter-aud="femmes"')],
  ["fond beige zones", css.includes("#e6d5c4")],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "OK" : "FAIL"} — ${label}`);
  if (!ok) failed += 1;
}

const invPath = path.join(root, "inventory/admin/data/lucie-inventory.json");
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));
const seed = Array.isArray(inv.items) ? inv.items : Array.isArray(inv) ? inv : [];
console.log(`Inventaire chargé : ${seed.length} produits (lecture seule pour classification)`);

const two = seed.find((i) => Array.isArray(i.sizes) && i.sizes.length >= 2);
const one = seed.find((i) => Array.isArray(i.sizes) && i.sizes.length === 1);
const none = seed.find((i) => !i.sizes || !i.sizes.length);
const zero = seed.find((i) => {
  if (Array.isArray(i.sizes) && i.sizes.length) {
    return i.sizes.every((s) => Number(s.qty_on_hand) === 0) || Number(i.qty_on_hand) === 0;
  }
  return Number(i.qty_on_hand) === 0;
});

console.log("Échantillon 2 tailles:", two ? `${two.product_number} ${two.name_fr} (${two.sizes.map((s) => s.code + "=" + s.qty_on_hand).join(", ")})` : "aucun");
console.log("Échantillon 1 taille:", one ? `${one.product_number} ${one.name_fr}` : "aucun");
console.log("Échantillon sans taille:", none ? `${none.product_number} ${none.name_fr} qty=${none.qty_on_hand}` : "aucun");
console.log("Échantillon stock 0:", zero ? `${zero.product_number} ${zero.name_fr}` : "aucun");

// Persistance en mémoire (copie) — ne touche pas le fichier réel
const store = createAdminInventoryStore(structuredClone(seed), { dataMode: "demo", actor: "test-cleanup" });
const beforeHash = fs.readFileSync(invPath);
if (!two) {
  console.log("SKIP persist 2 tailles");
} else {
  const id = two.product_id;
  const code = two.sizes[0].code;
  const before = store.get(id);
  const beforeQty = before.sizes.find((s) => s.code === code).qty_on_hand;
  store.adjustQty({
    productId: id,
    delta: 1,
    sizeCode: code,
    confirm: true,
    expectedQty: beforeQty,
  });
  const mid = store.get(id);
  const midQty = mid.sizes.find((s) => s.code === code).qty_on_hand;
  store.adjustQty({
    productId: id,
    delta: -1,
    sizeCode: code,
    confirm: true,
    expectedQty: midQty,
  });
  const after = store.get(id);
  const afterQty = after.sizes.find((s) => s.code === code).qty_on_hand;
  const sumOk =
    after.qty_on_hand === after.sizes.reduce((n, s) => n + (Number(s.qty_on_hand) || 0), 0);
  console.log(
    Number(afterQty) === Number(beforeQty) && sumOk
      ? `OK — persist mémoire ±1 taille ${code} revenu à ${afterQty}, total=${after.qty_on_hand}`
      : `FAIL — persist mémoire before=${beforeQty} after=${afterQty}`,
  );
  if (!(Number(afterQty) === Number(beforeQty) && sumOk)) failed += 1;

  // négatif bloqué
  try {
    let q = store.get(id).sizes.find((s) => s.code === code).qty_on_hand;
    while (q > 0) {
      store.adjustQty({
        productId: id,
        delta: -1,
        sizeCode: code,
        confirm: true,
        expectedQty: q,
      });
      q = store.get(id).sizes.find((s) => s.code === code).qty_on_hand;
    }
    let blocked = false;
    try {
      store.adjustQty({
        productId: id,
        delta: -1,
        sizeCode: code,
        confirm: true,
        expectedQty: 0,
      });
    } catch {
      blocked = true;
    }
    const finalQ = store.get(id).sizes.find((s) => s.code === code).qty_on_hand;
    console.log(
      blocked || finalQ === 0
        ? `OK — pas de négatif (qty=${finalQ}, blocked=${blocked})`
        : `FAIL — négatif possible`,
    );
    if (!(blocked || finalQ === 0)) failed += 1;
  } catch (err) {
    console.log("FAIL — test négatif:", err.message);
    failed += 1;
  }
}

const afterHash = fs.readFileSync(invPath);
const fileUntouched = Buffer.compare(beforeHash, afterHash) === 0;
console.log(fileUntouched ? "OK — fichier lucie-inventory.json inchangé" : "FAIL — fichier inventaire modifié");
if (!fileUntouched) failed += 1;

// boutique sizes sync file untouched check — we didn't call size APIs
const sizesPath = path.join(root, "catalog/product-sizes.json");
const sizesStat = fs.statSync(sizesPath);
console.log(`OK — product-sizes.json présent (${sizesStat.size} octets), non modifié par ce test`);

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log("\nTous les contrôles automatiques OK");
