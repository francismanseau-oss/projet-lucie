import fs from "node:fs";
const h = fs.readFileSync(new URL("../boutique.html", import.meta.url), "utf8");
const start = h.indexOf('data-id="mitaines-m-renard"');
const artStart = h.lastIndexOf("<article", start);
const artEnd = h.indexOf("</article>", start) + "</article>".length;
const card = h.slice(artStart, artEnd);
console.log(card.replace(/></g, ">\n<"));
