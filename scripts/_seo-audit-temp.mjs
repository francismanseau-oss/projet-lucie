import fs from "node:fs";

const html = fs.readFileSync("boutique.html", "utf8");
const catalog = JSON.parse(fs.readFileSync("catalog/products.json", "utf8"));
const art = html.match(/<article[\s\S]*?<\/article>/)[0];
console.log("full first article length", art.length);
console.log(art.slice(-800));
const p = catalog.products[0];
const idx = html.indexOf(p.id);
console.log("id location context", html.slice(idx - 80, idx + p.id.length + 80));
