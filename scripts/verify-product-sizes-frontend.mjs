/**
 * Vérifs locales tailles (FR/EN, sélecteurs, stocks provisoires) — sans déploiement.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sizes = JSON.parse(readFileSync(join(root, "catalog/product-sizes.json"), "utf8"));
const boutique = readFileSync(join(root, "boutique.html"), "utf8");
const site = readFileSync(join(root, "site.js"), "utf8");
const panier = readFileSync(join(root, "panier.html"), "utf8");
const paiement = readFileSync(join(root, "paiement.html"), "utf8");

const checks = [];
function ok(name, cond, detail = "") {
  checks.push({ name, ok: !!cond, detail });
}

ok("66 produits tailles", Object.keys(sizes.products).length === 66);
ok(
  "sélecteurs ≥ 3 (formats combinés séparés)",
  Object.values(sizes.products).filter((p) => p.selector).length >= 3,
);
ok("#104 M seul", sizes.products["mitaines-dame-renard-roux"]?.sizes?.map((s) => s.code).join(",") === "M");
ok("#105 M seul", sizes.products["mitaines-dame-vison-et-renard"]?.sizes?.map((s) => s.code).join(",") === "M");
ok("#126 M+L", sizes.products["mitaines-style-inuit-coyote"]?.sizes?.map((s) => s.code).join(",") === "M,L");
ok(
  "#107 M seul",
  sizes.products["mitaines-dame-m-l-chat-sauvage"]?.selector === false &&
    sizes.products["mitaines-dame-m-l-chat-sauvage"].sizes.map((s) => s.code).join(",") === "M" &&
    sizes.products["mitaines-dame-m-l-chat-sauvage"].sizes.every((s) => s.qty_on_hand === 3),
);
ok(
  "plus de M-L mono (1 inventaire pour 2 grandeurs)",
  !Object.values(sizes.products).some((p) => !p.selector && p.sizes.some((s) => s.code === "M-L")),
);
ok("#101 unique", sizes.products["mitaines-bebe-sans-pouces-vison-fermeture-eclair"]?.selector === false);
ok("#700 universelle", /universelle/i.test(sizes.products["semelles-fourrure-recyclee-pointures-5-a-12"]?.sizes?.[0]?.label_fr || ""));
ok("qty 3 partout", Object.values(sizes.products).every((p) => p.sizes.every((s) => s.qty_on_hand === 3)));
ok("boutique charge product-sizes.js", boutique.includes("product-sizes.js"));
ok("site.js choix cliquables", site.includes("size-choice") && site.includes("setupSizesAndCart"));
ok("site stock sous grandeur", site.includes("stockPhrase") && !site.includes("?(q!=null?' ('"));
ok("pas de select dropdown", !site.includes("className='size-select'"));
ok("libellé Moyen", sizes.products["mitaines-dame-renard-roux"]?.sizes?.[0]?.label_fr === "Moyen");
ok("libellé Medium", sizes.products["mitaines-dame-renard-roux"]?.sizes?.[0]?.label_en === "Medium");
ok("panier clé taille", panier.includes("lineKey") && panier.includes("product-sizes.js"));
ok("paiement envoie size", paiement.includes("row.size = x.size"));
ok("label EN #700", /universal/i.test(sizes.products["semelles-fourrure-recyclee-pointures-5-a-12"]?.sizes?.[0]?.label_en || ""));
ok("pas de genre #126", !/dame|homme|femme|men|women/i.test(JSON.stringify(sizes.products["mitaines-style-inuit-coyote"])));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "OK" : "FAIL", c.name, c.detail);
if (failed.length) {
  console.error("FAILED", failed.length);
  process.exit(1);
}
console.log("ALL OK", checks.length);
