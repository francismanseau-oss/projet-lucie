/**
 * Simulation DOM légère — multi-grandeur + format unique, FR/EN, mobile CSS présent.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const sizes = JSON.parse(readFileSync("catalog/product-sizes.json", "utf8"));
const css = readFileSync("style.css", "utf8");
const psSrc = readFileSync("product-sizes.js", "utf8");

const sandbox = {
  window: {},
  document: {
    documentElement: { lang: "fr-CA" },
    querySelector: () => null,
  },
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(psSrc, sandbox);
const api = sandbox.BOREALES_PRODUCT_SIZES;
api.refresh = () => Promise.resolve(sizes);
// inject cache
sandbox.BOREALES_PRODUCT_SIZES.load = () => Promise.resolve(sizes);
Object.assign(api, {
  entry: (id) => sizes.products[id] || null,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const m = sizes.products["mitaines-dame-renard-roux"].sizes[0];
assert(api.displayLabel("M", m, "fr") === "Moyen", "FR Moyen");
assert(api.displayLabel("M", m, "en") === "Medium", "EN Medium");
assert(api.stockPhrase(3, "fr") === "3 en stock", "3 en stock");
assert(api.stockPhrase(1, "en") === "1 in stock", "1 in stock");
assert(api.stockPhrase(0, "fr") === "Épuisé", "Épuisé");
assert(api.optionLabel(m, "fr") === "Moyen", "optionLabel sans qty");

// Structure attendue multi
const multiHtml = sizes.products["mitaines-dame-renard-roux"].sizes
  .map((sz) => {
    const name = api.displayLabel(sz.code, sz, "fr");
    const stock = api.stockPhrase(sz.qty_on_hand, "fr");
    return `<button class="size-choice"><span class="size-choice-name">${name}</span><span class="size-choice-stock">${stock}</span></button>`;
  })
  .join("");
assert(multiHtml.includes("Moyen") && multiHtml.includes("3 en stock"), "FR multi block");
assert(!multiHtml.includes("(3)"), "pas de (3)");

const multiEn = sizes.products["mitaines-dame-renard-roux"].sizes
  .map((sz) => {
    const name = api.displayLabel(sz.code, sz, "en");
    const stock = api.stockPhrase(sz.qty_on_hand, "en");
    return `${name}/${stock}`;
  })
  .join("|");
assert(multiEn === "Medium/3 in stock|Large/3 in stock", "EN multi " + multiEn);

// Unique M-L non séparé
const ml = sizes.products["chapeau-dame-m-l-coyote"];
assert(!ml.selector && ml.sizes[0].code === "M-L", "M-L mono");
assert(api.displayLabel("M-L", ml.sizes[0], "fr") === "Moyen–Grand", "Moyen–Grand");
assert(api.stockPhrase(ml.sizes[0].qty_on_hand, "fr") === "3 en stock", "stock unique");

// CSS responsive
assert(css.includes(".size-choice-list"), "css list");
assert(css.includes("@media(max-width:375px)"), "css mobile 375");
assert(css.includes("grid-template-columns:1fr 1fr"), "2 cols");

console.log("DOM/UI simulation OK");
console.log("sample FR:", multiHtml.replace(/</g, "\n<").slice(0, 280));
