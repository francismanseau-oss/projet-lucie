import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("hub Créations personnalisées présent avec deux choix", () => {
  const html = read("creations-personnalisees.html");
  assert.match(html, /Créations personnalisées/);
  assert.match(html, /cp-choose-mesure/);
  assert.match(html, /cp-choose-idee/);
  assert.match(html, /Commander sur mesure/);
  assert.match(html, /Proposer une création/);
  assert.match(html, /demo-mittens\.svg/);
  assert.match(html, /demo-scarf\.svg/);
  assert.match(html, /id="cp-choose-mesure"/);
  assert.match(html, /Choisir mes photos/);
  assert.match(html, /id="idea-form"/);
  assert.match(html, /id="sm-products"/);
  assert.match(html, /creations\.html/);
});

test("sur-mesure.html redirige vers hub#mesure", () => {
  const html = read("sur-mesure.html");
  assert.match(html, /creations-personnalisees\.html#mesure/);
});

test("contact : lien discret idée, plus de formulaire idea-form", () => {
  const html = read("contact.html");
  assert.match(html, /creations-personnalisees\.html#idee/);
  assert.match(html, /Proposer une création/);
  assert.doesNotMatch(html, /id="idea-form"/);
  assert.match(html, /Créations personnalisées/);
});

test("nav principale pointe vers le hub", () => {
  const index = read("index.html");
  assert.match(index, /creations-personnalisees\.html/);
  assert.match(index, /Créations personnalisées/);
  assert.doesNotMatch(index, /href="sur-mesure\.html"[^>]*>Sur mesure</);
});

test("site.js flèches mobiles pointent vers le hub", () => {
  const js = read("site.js");
  assert.match(js, /creations-personnalisees\.html/);
  assert.match(js, /Créations personnalisées/);
});
