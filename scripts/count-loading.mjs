import fs from "node:fs";
const h = fs.readFileSync(new URL("../boutique.html", import.meta.url), "utf8");
console.log({
  eager: (h.match(/loading="eager"/g) || []).length,
  lazy: (h.match(/loading="lazy"/g) || []).length,
  high: (h.match(/fetchpriority="high"/g) || []).length,
  low: (h.match(/fetchpriority="low"/g) || []).length,
  picture: (h.match(/<picture>/g) || []).length,
  broken_webp_refs: [...h.matchAll(/srcset="(assets\/produits\/webp\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !fs.existsSync(new URL("../" + p, import.meta.url))).length,
});
