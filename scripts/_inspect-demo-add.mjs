import fs from "node:fs";
const s = fs.readFileSync(new URL("../site.js", import.meta.url), "utf8");
const i = s.indexOf("demo-add");
console.log(s.slice(i, i + 800));
