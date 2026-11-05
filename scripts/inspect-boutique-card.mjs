import fs from "node:fs";
const html = fs.readFileSync(new URL("../boutique.html", import.meta.url), "utf8");
const i = html.indexOf("shop-product");
console.log(html.slice(i, i + 800));
