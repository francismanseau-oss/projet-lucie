import fs from "node:fs";
const c = JSON.parse(fs.readFileSync(new URL("../catalog/products.json", import.meta.url), "utf8"));

function stripSizeTokens(name) {
  let s = String(name || "");
  s = s.replace(/\b(XXL|XL|M-L|L-XL|S-M)\b/gi, " ");
  s = s.replace(/(^|[\s—–-])([SML])(?=$|[\s—–-])/gi, "$1");
  s = s.replace(/\s*[—–]\s*/g, " — ");
  s = s.replace(/\s{2,}/g, " ").replace(/\s*—\s*$/g, "").replace(/^\s*—\s*/g, "").trim();
  return s;
}

const groups = {};
for (const p of c.products) {
  const key = p.category + "|" + stripSizeTokens(p.name_fr);
  (groups[key] = groups[key] || []).push({
    id: p.id,
    name: p.name_fr,
    price: p.price_cad,
    strip: stripSizeTokens(p.name_fr),
  });
}
const multi = Object.entries(groups).filter(([, a]) => a.length > 1);
const priceAmb = multi.filter(([, a]) => new Set(a.map((x) => x.price)).size > 1);
console.log(JSON.stringify({ multiSkuSameLabel: multi.length, priceAmbiguities: priceAmb.length, samples: multi.slice(0, 8) }, null, 2));
