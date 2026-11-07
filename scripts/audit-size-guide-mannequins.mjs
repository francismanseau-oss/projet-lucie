/**
 * Vérifie que chaque catégorie boutique « i » pointe vers le mannequin à jour.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const illus = JSON.parse(
  readFileSync(join(root, "catalog/sur-mesure-illustrations.json"), "utf8"),
).categories;
const guide = JSON.parse(readFileSync(join(root, "catalog/size-guide.json"), "utf8"));

const EXPECTED = {
  mitaines: "guide-main-schema.jpg",
  pantoufles: "pied-mesures-humain",
  semelles: "pied-mesures-humain",
  chapeaux: "tete-mesures-humain",
  "cache-oreilles": "tete-mesures-humain",
  foulards: "foulards-mesures", // schéma foulard (pas de photo humain)
  mukluks: null, // hide_diagram
};

const cats = guide.categories || {};
let fail = 0;
for (const [cat, meta] of Object.entries(cats)) {
  const key = meta.illustration_key || cat;
  const entry = illus[key];
  const expect = EXPECTED[cat];
  if (expect === null) {
    if (!entry?.hide_diagram) {
      console.log("FAIL", cat, "should hide_diagram");
      fail++;
    } else console.log("OK", cat, "no diagram");
    continue;
  }
  const fr = entry?.files?.fr || "";
  const en = entry?.files?.en || "";
  const okFr = fr.includes(expect);
  const okEn = en.includes(expect);
  const existsFr = fr && existsSync(join(root, fr));
  const existsEn = en && existsSync(join(root, en));
  if (!okFr || !okEn || !existsFr || !existsEn) {
    console.log("FAIL", cat, { fr, en, okFr, okEn, existsFr, existsEn, expect });
    fail++;
  } else {
    console.log("OK", cat, "→", fr);
  }
}
if (fail) {
  console.error("FAILS", fail);
  process.exit(1);
}
console.log("ALL OK");
