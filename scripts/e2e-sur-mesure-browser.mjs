/**
 * E2E : catégorie → modèles → mesures → panier (FR + EN).
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BOREALES_BASE || "http://127.0.0.1:8766";
const outDir = path.join(root, "docs");

async function runLang(page, lang) {
  await page.goto(`${base}/creations-personnalisees.html#mesure`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForSelector(".sm-category-card", { timeout: 15000 });
  await page.locator(`.desktop-languages [data-set-lang="${lang}"]`).click({ force: true });
  await page.waitForTimeout(400);

  const catCount = await page.locator(".sm-category-card").count();
  const tilesBefore = await page.locator(".sm-product-tile").count();
  await page.screenshot({
    path: path.join(outDir, `_e2e-sm-cats-${lang}.png`),
    fullPage: false,
  });

  // Choisir Mitaines / Mittens
  const catBtn = page.locator(".sm-category-card").filter({
    hasText: lang === "en" ? /Mittens/i : /Mitaines/i,
  });
  await catBtn.first().click();
  await page.waitForSelector(".sm-product-tile", { timeout: 10000 });
  await page.waitForTimeout(400);
  const tilesAfter = await page.locator(".sm-product-tile").count();
  const firstName = (await page.locator(".sm-product-tile strong").first().textContent()) || "";
  const hasSizeToken = /\b(XXL|XL|M-L|L-XL|S-M|[SML])\b/i.test(firstName);

  await page.screenshot({
    path: path.join(outDir, `_e2e-sm-models-${lang}.png`),
    fullPage: false,
  });

  await page.locator(".sm-product-tile").first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-sm-goto="3"]').click();
  await page.waitForTimeout(200);
  await page.locator("#sm-unit-cm").click();
  await page.waitForTimeout(300);
  const inputs = page.locator("#sm-measures input[type='number']");
  const nInputs = await inputs.count();
  for (let i = 0; i < nInputs; i++) {
    await inputs.nth(i).fill(i === 0 ? "20" : "18");
  }
  const illusSrc = await page.locator("#sm-measure-img").getAttribute("src");

  await page.locator('[data-sm-goto="4"]').click();
  await page.waitForTimeout(300);
  const addDisabled = await page.locator("#sm-add").isDisabled();
  if (!addDisabled) {
    await page.locator("#sm-add").click();
    await page.waitForTimeout(400);
  }

  // Changer de catégorie
  await page.locator('[data-sm-goto="1"]').click();
  await page.waitForTimeout(200);
  await page.locator("#sm-change-cat").click();
  await page.waitForTimeout(400);
  const catsAgain = await page.locator(".sm-category-card").count();
  const tilesHidden = await page.locator(".sm-product-tile").count();

  const cart = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("boreales-cart") || "[]");
    } catch {
      return [];
    }
  });
  const custom = [...cart].reverse().find((x) => x.custom) || null;

  return {
    lang,
    catCount,
    tilesBefore,
    tilesAfter,
    firstName,
    hasSizeToken,
    measureInputs: nInputs,
    illusSrc,
    addDisabled,
    catsAgain,
    tilesAfterChangeCat: tilesHidden,
    cartRef: custom?.custom_config?.product_id || null,
    cartPrice: custom?.price ?? null,
    cartName: custom?.name || null,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/creations-personnalisees.html`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.removeItem("boreales-cart"));

const fr = await runLang(page, "fr");
const en = await runLang(page, "en");
await browser.close();

const ok =
  fr.catCount === 7 &&
  en.catCount === 7 &&
  fr.tilesBefore === 0 &&
  en.tilesBefore === 0 &&
  fr.tilesAfter > 0 &&
  fr.tilesAfter < 66 &&
  !fr.hasSizeToken &&
  !en.hasSizeToken &&
  fr.catsAgain === 7 &&
  fr.tilesAfterChangeCat === 0 &&
  !!fr.cartRef &&
  fr.cartPrice != null;

const report = { ok, fr, en };
fs.writeFileSync(path.join(outDir, "_e2e-sm-category-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
