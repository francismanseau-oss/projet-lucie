(() => {
  "use strict";

  const KEY = "boreales-cart";
  const api = window.BOREALES_SUR_MESURE;
  const eng = () => document.documentElement.lang.startsWith("en");
  const t = (fr, en) => (eng() ? en : fr);

  function setProductsStatus(fr, en, kind) {
    const el = document.getElementById("sm-products-status");
    if (!el) return;
    const text = t(fr, en);
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "sm-products-status";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className =
      "sm-products-status" +
      (kind === "err" ? " is-err" : kind === "ok" ? " is-ok" : "");
  }

  if (!api) {
    setProductsStatus(
      "Module de prix sur mesure introuvable. Rechargez la page (sur-mesure-pricing.js).",
      "Made-to-measure pricing module missing. Reload the page (sur-mesure-pricing.js).",
      "err",
    );
    return;
  }

  function isAdaptedProduct(product) {
    if (!product) return false;
    if (product.order_flow === "adapted_contact") return true;
    if (api.isSkipMeasuresProduct) return api.isSkipMeasuresProduct(state.config, product.id);
    const ids = state.config?.skip_measures_product_ids || state.config?.adapted_contact?.product_ids || [];
    return Array.isArray(ids) && ids.includes(product.id);
  }

  const els = {
    categoryPick: document.getElementById("sm-category-pick"),
    audienceBar: document.getElementById("sm-audience-bar"),
    productsWrap: document.getElementById("sm-products-wrap"),
    changeCat: document.getElementById("sm-change-cat"),
    catCurrent: document.getElementById("sm-cat-current"),
    productsTitle: document.getElementById("sm-products-title"),
    products: document.getElementById("sm-products"),
    productsStatus: document.getElementById("sm-products-status"),
    step1: document.getElementById("sm-step-1"),
    step2: document.getElementById("sm-step-2"),
    step3: document.getElementById("sm-step-3"),
    step4: document.getElementById("sm-step-4"),
    configLead: document.getElementById("sm-config-lead"),
    configName: document.getElementById("sm-config-name"),
    options: document.getElementById("sm-options"),
    measuresBlock: document.getElementById("sm-step-3"),
    measures: document.getElementById("sm-measures"),
    unitIn: document.getElementById("sm-unit-in"),
    unitCm: document.getElementById("sm-unit-cm"),
    unitHint: document.getElementById("sm-unit-hint"),
    measureNote: document.getElementById("sm-measure-note"),
    measureFigure: document.getElementById("sm-measure-figure"),
    measureImg: document.getElementById("sm-measure-img"),
    measureCaption: document.getElementById("sm-measure-caption"),
    handGuide: document.getElementById("sm-hand-guide"),
    handPhoto: document.getElementById("sm-hand-photo"),
    handTitle: document.getElementById("sm-hand-title"),
    handSub: document.getElementById("sm-hand-sub"),
    handSteps: document.getElementById("sm-hand-steps"),
    handTables: document.getElementById("sm-hand-tables"),
    handAdvice: document.getElementById("sm-hand-advice"),
    summary: document.getElementById("sm-summary-list"),
    priceBox: document.getElementById("sm-price-box"),
    priceValue: document.getElementById("sm-price-value"),
    priceNote: document.getElementById("sm-price-note"),
    add: document.getElementById("sm-add"),
    msg: document.getElementById("sm-msg"),
    comments: document.getElementById("sm-comments"),
    chaleurWrap: document.getElementById("sm-chaleur-wrap"),
    chaleur: document.getElementById("sm-chaleur"),
    chaleurNote: document.getElementById("sm-chaleur-note"),
    measureErrors: document.getElementById("sm-measure-errors"),
    progress: document.getElementById("sm-progress"),
  };

  if (!els.products || !els.add) {
    setProductsStatus(
      "Zone produits introuvable dans la page. Vérifiez creations-personnalisees.html.",
      "Product area missing on the page. Check creations-personnalisees.html.",
      "err",
    );
    return;
  }

  const state = {
    catalog: null,
    config: null,
    illustrations: null,
    limits: null,
    filter: null,
    audienceFilter: "tous",
    productId: null,
    unit: "cm",
    measurements: {},
    measurementsCm: {},
    measureOutOfRange: {},
    openWheelField: null,
    _lastUnit: null,
    chaleur: false,
    comments: "",
    viewStep: 1,
    requestedSize: null,
    linkedProductId: null,
    audienceById: {},
    productSizes: null,
  };

  const LETTERS = {
    S: { fr: "Petit", en: "Small" },
    M: { fr: "Moyen", en: "Medium" },
    L: { fr: "Grand", en: "Large" },
    XL: { fr: "Très grand", en: "Extra Large" },
  };

  function audienceOf(productId) {
    const row = state.audienceById[productId];
    return row && row.audience ? row.audience : "";
  }

  /** Même logique boutique : unisexe = F+H ; tous = F+H+Enfants (ex. cache-oreilles 8-14). */
  function matchesAudienceFilter(productId) {
    const want = state.audienceFilter || "tous";
    if (want === "tous") return true;
    const aud = audienceOf(productId);
    if (!aud) return false;
    if (aud === "tous" || aud === "all") return true;
    if (aud === "unisexe") return want === "femmes" || want === "hommes";
    return aud === want;
  }

  function chaleurEligible(product) {
    const heat = state.config?.pending_options?.chaleur_renforcee;
    if (!product || !heat) return false;
    const cats = heat.applies_to_categories || [];
    const auds = heat.applies_to_audiences || ["femmes", "hommes"];
    return cats.includes(product.category) && auds.includes(audienceOf(product.id));
  }

  function stripChaleurFromUrl() {
    const url = new URL(location.href);
    url.searchParams.delete("chaleur");
    const hash = url.hash
      .replace(/([?&])chaleur=1\b&?/g, "$1")
      .replace(/[?&]$/, "");
    history.replaceState(null, "", url.pathname + url.search + hash);
  }

  function readOrderLink() {
    const q = new URLSearchParams(location.search);
    const raw = (location.hash || "").replace(/^#/, "");
    const hashQuery = raw.includes("&") ? raw.replace(/^(mesure|idee)&/, "").replace(/^choix=(mesure|idee)&/, "") : "";
    const hp = new URLSearchParams(hashQuery);
    const taille = (q.get("taille") || hp.get("taille") || "").toUpperCase();
    return {
      modele: q.get("modele") || hp.get("modele") || "",
      taille: LETTERS[taille] ? taille : "",
      chaleur: (q.get("chaleur") || hp.get("chaleur")) === "1",
    };
  }

  function delayText() {
    const d = state.config && state.config.made_to_order;
    if (d && d.delay_fr && d.delay_en) return t(d.delay_fr, d.delay_en);
    return t(
      "Environ 1 semaine de fabrication, puis le délai de livraison. En période de Noël, l’attente peut aller jusqu’à 3 semaines avant la livraison.",
      "About 1 week to make, then shipping time. Around Christmas, the wait can be up to 3 weeks before delivery.",
    );
  }

  function placeholderSrc() {
    return eng()
      ? "assets/mesures/_placeholder-a-produire-en.svg"
      : "assets/mesures/_placeholder-a-produire-fr.svg";
  }

  function money(cents) {
    return (cents / 100).toFixed(2).replace(".", ",") + " $ CAD";
  }

  function showMsg(kind, fr, en) {
    if (!els.msg) return;
    els.msg.hidden = false;
    els.msg.className = "sm-msg " + (kind === "ok" ? "is-ok" : "is-err");
    els.msg.textContent = t(fr, en);
  }

  function clearMsg() {
    if (!els.msg) return;
    els.msg.hidden = true;
    els.msg.textContent = "";
  }

  function currentProduct() {
    return api.findProduct(state.catalog, state.productId);
  }

  const CAT_ORDER = [
    "mitaines",
    "chapeaux",
    "pantoufles",
    "mukluks",
    "cache-oreilles",
    "foulards",
    "semelles",
  ];

  const CAT_LABELS = {
    mitaines: { fr: "Mitaines", en: "Mittens" },
    pantoufles: { fr: "Pantoufles", en: "Slippers" },
    chapeaux: { fr: "Chapeaux", en: "Hats" },
    "cache-oreilles": { fr: "Cache-oreilles", en: "Ear warmers" },
    foulards: { fr: "Foulards", en: "Scarves" },
    semelles: { fr: "Semelles", en: "Insoles" },
    mukluks: { fr: "Mukluks", en: "Mukluks" },
  };

  function categories() {
    const present = new Set(
      (state.catalog.products || [])
        .filter(
          (p) =>
            p.active !== false &&
            matchesAudienceFilter(p.id) &&
            !isBabyMukluk(p),
        )
        .map((p) => p.category),
    );
    const ordered = CAT_ORDER.filter((c) => present.has(c));
    for (const c of present) {
      if (!ordered.includes(c)) ordered.push(c);
    }
    return ordered;
  }

  /** Affichage sur mesure : retire S/M/L/XL du libellé (la Boutique reste inchangée). */
  function stripSizeTokens(name) {
    let s = String(name || "");
    s = s.replace(/\b(XXL|XL|M-L|L-XL|S-M)\b/gi, " ");
    s = s.replace(/(^|[\s—–-])([SML])(?=$|[\s—–-])/gi, "$1");
    s = s.replace(/\s*[—–]\s*/g, " — ");
    s = s.replace(/\s{2,}/g, " ").replace(/\s*—\s*$/g, "").replace(/^\s*—\s*/g, "").trim();
    return s || String(name || "");
  }

  function displayProductName(p) {
    if (!p) return "";
    const raw = eng() && p.name_en ? p.name_en : p.name_fr;
    return stripSizeTokens(raw);
  }

  function isBabyMukluk(p) {
    if (!p || p.category !== "mukluks") return false;
    const key = String(p.id || "") + " " + String(p.name_fr || "");
    return /bebe|bébé/i.test(key);
  }

  /** Ex. mukluks-bebe-7-18-mois-vison → « 7-18 mois » */
  function babyMuklukAgeLabel(p) {
    if (!isBabyMukluk(p)) return "";
    const src = String(p.id || "") + " " + String(p.image || "");
    let m = src.match(/(\d+)\s*-\s*(\d+)\s*-?\s*mois/i);
    if (m) {
      return eng() ? m[1] + "-" + m[2] + " months" : m[1] + "-" + m[2] + " mois";
    }
    m =
      src.match(/(?:^|-)a-(\d+)-mois/i) ||
      src.match(/(?:^|-)(\d+)-mois/i) ||
      src.match(/(\d+)\s*mois/i);
    if (m) {
      return eng() ? m[1] + " months" : m[1] + " mois";
    }
    return "";
  }

  /** Format taille pour la carte (sans réf. catalogue). */
  function productTileSizeLabel(p) {
    if (!p) return "";
    const age = babyMuklukAgeLabel(p);
    if (age) return age;
    const id = String(p.id || "");
    const combo = id.match(/-(s-m|m-l|l-xl)(?:-|$)/i);
    if (combo) return combo[1].toUpperCase().replace(/-/g, "-");
    const entry =
      (state.productSizes &&
        state.productSizes.products &&
        state.productSizes.products[p.id]) ||
      null;
    const sizes = entry && Array.isArray(entry.sizes) ? entry.sizes : [];
    if (sizes.length) {
      return sizes
        .map((s) => (eng() ? s.label_en || s.code : s.label_fr || s.code))
        .filter(Boolean)
        .join(" · ");
    }
    const letter = id.match(/-(xxl|xl|[sml])(?:-|$)/i);
    if (letter) return letter[1].toUpperCase();
    return "";
  }

  function categoryLabel(c) {
    const lab = CAT_LABELS[c];
    return lab ? (eng() ? lab.en : lab.fr) : c;
  }

  function productsInCategory(cat) {
    return (state.catalog.products || []).filter(
      (p) =>
        p.active !== false &&
        p.category === cat &&
        matchesAudienceFilter(p.id) &&
        !isBabyMukluk(p),
    );
  }

  function firstImageInCategory(cat) {
    const p = productsInCategory(cat)[0];
    return p?.image || "";
  }

  function renderAudienceBar() {
    if (!els.audienceBar) return;
    els.audienceBar.querySelectorAll(".audience-filter").forEach((btn) => {
      const aud = btn.dataset.audience || "tous";
      btn.classList.toggle("active", aud === state.audienceFilter);
      btn.setAttribute("aria-pressed", String(aud === state.audienceFilter));
    });
  }

  function setAudienceFilter(aud) {
    const next = aud || "tous";
    if (state.audienceFilter === next) return;
    state.audienceFilter = next;
    renderAudienceBar();
    if (state.filter && !productsInCategory(state.filter).length) {
      clearCategory();
      return;
    }
    renderCategoryPick();
    renderProducts();
    updateStep1Copy();
  }

  function updateStep1Copy() {
    if (els.productsTitle) {
      els.productsTitle.textContent = state.filter
        ? t("Choisir un modèle", "Choose a model")
        : t("Choisir une catégorie", "Choose a category");
      els.productsTitle.dataset.fr = state.filter ? "Choisir un modèle" : "Choisir une catégorie";
      els.productsTitle.dataset.en = state.filter ? "Choose a model" : "Choose a category";
    }
  }

  function selectCategory(cat) {
    state.filter = cat;
    state.productId = null;
    renderCategoryPick();
    renderProducts();
    updateStep1Copy();
    if (els.productsWrap) {
      els.productsWrap.hidden = false;
      requestAnimationFrame(() => {
        els.productsWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (els.categoryPick) els.categoryPick.hidden = true;
    renderPersonalization();
    updateProgress();
  }

  function clearCategory() {
    state.filter = null;
    state.productId = null;
    if (els.productsWrap) els.productsWrap.hidden = true;
    if (els.categoryPick) els.categoryPick.hidden = false;
    renderCategoryPick();
    renderProducts();
    updateStep1Copy();
    renderPersonalization();
    updateProgress();
    requestAnimationFrame(() => {
      els.categoryPick?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderCategoryPick() {
    if (!els.categoryPick) return;
    els.categoryPick.innerHTML = "";
    if (!state.catalog) return;
    if (state.filter) {
      els.categoryPick.hidden = true;
      return;
    }
    els.categoryPick.hidden = false;
    for (const c of categories()) {
      const n = productsInCategory(c).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sm-category-card";
      btn.setAttribute("role", "listitem");
      const img = document.createElement("img");
      img.src = firstImageInCategory(c);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 400;
      img.height = 400;
      img.onerror = () => {
        img.style.visibility = "hidden";
      };
      const body = document.createElement("span");
      body.className = "sm-category-card-body";
      const title = document.createElement("strong");
      title.textContent = categoryLabel(c);
      const count = document.createElement("span");
      count.className = "sm-category-card-count";
      count.textContent =
        n +
        " " +
        t(n > 1 ? "modèles" : "modèle", n > 1 ? "models" : "model");
      body.appendChild(title);
      body.appendChild(count);
      btn.appendChild(img);
      btn.appendChild(body);
      btn.addEventListener("click", () => selectCategory(c));
      els.categoryPick.appendChild(btn);
    }
  }

  function renderProducts() {
    if (!els.products) return;
    els.products.innerHTML = "";
    if (els.changeCat) {
      els.changeCat.textContent = t("← Changer de catégorie", "← Change category");
    }
    if (!state.filter) {
      if (els.productsWrap) els.productsWrap.hidden = true;
      setProductsStatus("", "");
      return;
    }
    if (els.productsWrap) els.productsWrap.hidden = false;
    if (els.catCurrent) {
      els.catCurrent.textContent = categoryLabel(state.filter);
    }
    if (!state.catalog) {
      setProductsStatus(
        "Chargement du catalogue Boutique…",
        "Loading the Shop catalog…",
      );
      return;
    }
    const list = productsInCategory(state.filter);
    if (!list.length) {
      setProductsStatus(
        "Aucun modèle dans cette catégorie.",
        "No models in this category.",
        "err",
      );
      return;
    }
    setProductsStatus("", "");
    for (const p of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sm-product-tile";
      btn.setAttribute("aria-pressed", String(state.productId === p.id));
      const img = document.createElement("img");
      img.src = p.image || "";
      img.alt = displayProductName(p);
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 400;
      img.height = 400;
      img.onerror = () => {
        img.removeAttribute("src");
        img.alt = t("Photo indisponible", "Photo unavailable");
        img.classList.add("is-missing");
      };
      const body = document.createElement("span");
      body.className = "sm-product-tile-body";
      const name = document.createElement("strong");
      name.textContent = displayProductName(p);
      body.appendChild(name);
      const price = document.createElement("span");
      price.className = "sm-product-tile-price";
      price.textContent = money(p.price_cad_cents);
      const cta = document.createElement("span");
      cta.className = "sm-product-tile-cta";
      cta.textContent = t("Personnaliser", "Customize");
      body.appendChild(price);
      body.appendChild(cta);
      btn.appendChild(img);
      btn.appendChild(body);
      btn.addEventListener("click", () => selectProduct(p.id));
      els.products.appendChild(btn);
    }
  }

  function gotoStep(n, { focus = true } = {}) {
    const max = state.productId ? 4 : 1;
    let step = Math.max(1, Math.min(Number(n) || 1, max));
    if (isAdaptedProduct(currentProduct()) && step === 3) step = 4;
    state.viewStep = step;
    updateProgress();
    const map = { 1: els.step1, 2: els.step2, 3: els.step3, 4: els.step4 };
    Object.values(map).forEach((el) => el?.classList.remove("is-current-step"));
    const target = map[step];
    if (target && !target.hidden) {
      target.classList.add("is-current-step");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (focus) {
        const heading = target.querySelector("h2");
        if (heading) {
          if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
      }
    }
  }

  function updateProgress() {
    const product = currentProduct();
    const adapted = isAdaptedProduct(product);
    const unlocked = state.productId ? 4 : 1;
    els.progress?.querySelectorAll("[data-sm-goto]").forEach((btn) => {
      const n = Number(btn.getAttribute("data-sm-goto"));
      if (adapted && n === 3) {
        btn.hidden = true;
        btn.disabled = true;
        return;
      }
      btn.hidden = false;
      const enabled = n <= unlocked;
      btn.disabled = !enabled;
      btn.classList.toggle("is-current", n === state.viewStep);
      btn.classList.toggle("is-done", enabled && n < state.viewStep);
      if (n === state.viewStep) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
  }

  function selectProduct(id) {
    if (state.linkedProductId && id !== state.linkedProductId) state.requestedSize = null;
    state.productId = id;
    state.measurements = {};
    state.measurementsCm = {};
    state.measureOutOfRange = {};
    state.openWheelField = null;
    state._lastUnit = null;
    state.unit = null;
    state.chaleur = false;
    state.comments = "";
    if (els.comments) els.comments.value = "";
    const link = readOrderLink();
    const product = currentProduct();
    state.chaleur = !!(link.chaleur && link.modele === product.id && chaleurEligible(product));
    if (els.chaleur) els.chaleur.checked = state.chaleur;
    clearMsg();
    clearMeasureErrors();
    renderProducts();
    renderPersonalization();
    if (isAdaptedProduct(product)) {
      state.unit = null;
      renderMeasures();
    } else {
      setUnit("cm");
    }
    renderIllustration();
    refreshSummary();
    gotoStep(2);
  }

  function limitAudienceKey() {
    const aliases = state.limits?.audience_aliases || {
      enfants: "enfant",
      femmes: "femme",
      hommes: "homme",
      unisexe: "femme",
      tous: "femme",
      all: "femme",
    };
    const aud = audienceOf(state.productId);
    if (aud && aliases[aud]) return aliases[aud];
    const filter = state.audienceFilter;
    if (filter && filter !== "tous" && aliases[filter]) return aliases[filter];
    return "femme";
  }

  function fieldLimitsCm(fieldId) {
    const entry = state.limits?.by_field?.[fieldId];
    if (!entry?.limits_cm) return null;
    const key = limitAudienceKey();
    return entry.limits_cm[key] || entry.limits_cm.femme || null;
  }

  function formatCmLabel(cm) {
    const n = Math.round(Number(cm) * 10) / 10;
    return String(n).replace(/\.0$/, "");
  }

  function formatInchFromEighths(eighths) {
    const whole = Math.floor(eighths / 8);
    const rem = eighths - whole * 8;
    const frac = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" }[rem];
    if (!frac) return String(whole);
    if (!whole) return frac;
    return whole + " " + frac;
  }

  /** Ticks respectant les limites cm exactes (jamais au-delà). */
  function buildMeasureTicks(fieldId) {
    const lim = fieldLimitsCm(fieldId);
    if (!lim || !Number.isFinite(lim.min) || !Number.isFinite(lim.max)) return [];
    const min = Number(lim.min);
    const max = Number(lim.max);
    if (state.unit === "in") {
      const ticks = [];
      const startE = Math.ceil((min / 2.54) * 8 - 1e-12);
      const endE = Math.floor((max / 2.54) * 8 + 1e-12);
      for (let e = startE; e <= endE; e++) {
        const cm = (e / 8) * 2.54;
        if (cm < min - 1e-9 || cm > max + 1e-9) continue;
        ticks.push({ cm, label: formatInchFromEighths(e) });
      }
      return ticks;
    }
    const step = state.limits?.increments?.cm ?? 0.5;
    const ticks = [];
    const start = Math.ceil(min / step - 1e-12) * step;
    for (let v = start; v <= max + 1e-9; v = Math.round((v + step) * 1000) / 1000) {
      if (v < min - 1e-9) continue;
      ticks.push({ cm: v, label: formatCmLabel(v) });
    }
    return ticks;
  }

  function syncDisplayMeasurements() {
    const out = {};
    for (const [id, cm] of Object.entries(state.measurementsCm || {})) {
      if (cm == null || !Number.isFinite(Number(cm))) continue;
      if (state.measureOutOfRange?.[id]) continue;
      const shown = api.fromCm(Number(cm), state.unit);
      if (shown == null) continue;
      out[id] = state.unit === "in" ? Number(shown.toFixed(6)) : Number(Number(cm).toFixed(6));
    }
    state.measurements = out;
  }

  function displayMeasureValue(fieldId) {
    if (state.measureOutOfRange?.[fieldId]) {
      return t("Mesure hors liste — Lucie me contactera", "Out-of-list measure — Lucie will contact me");
    }
    const cm = state.measurementsCm?.[fieldId];
    if (cm == null || !Number.isFinite(Number(cm))) return null;
    if (state.unit === "in") return formatInches(Number(cm)) + " " + t("po", "in");
    return formatCmLabel(cm) + " cm";
  }

  function setMeasureCm(fieldId, cm) {
    state.measureOutOfRange[fieldId] = false;
    delete state.measureOutOfRange[fieldId];
    state.measurementsCm[fieldId] = Number(cm);
    syncDisplayMeasurements();
  }

  function setMeasureOutOfRange(fieldId) {
    state.measureOutOfRange[fieldId] = true;
    delete state.measurementsCm[fieldId];
    syncDisplayMeasurements();
  }

  function clearMeasureChoice(fieldId) {
    delete state.measureOutOfRange[fieldId];
    delete state.measurementsCm[fieldId];
    syncDisplayMeasurements();
  }

  function clearMeasureErrors() {
    if (!els.measureErrors) return;
    els.measureErrors.hidden = true;
    els.measureErrors.textContent = "";
  }

  function fieldLabel(spec, fieldId) {
    const f = (spec?.fields || []).find((x) => x.id === fieldId);
    if (!f) return fieldId;
    return eng() ? f.label_en : f.label_fr;
  }

  function errorMessage(can, spec) {
    if (can.ok) return null;
    if (can.reason === "unit_required") {
      return t(
        "Choisissez une unité (pouces ou centimètres) avant de continuer.",
        "Choose a unit (inches or centimetres) before continuing.",
      );
    }
    if (can.reason === "measurement_required") {
      return t(
        "Choisissez une mesure (liste ou hors liste) : ",
        "Choose a measurement (list or out-of-list): ",
      ) + fieldLabel(spec, can.field);
    }
    if (can.reason === "measurement_invalid") {
      return t(
        "La mesure doit être un nombre positif : ",
        "Measurement must be a positive number: ",
      ) + fieldLabel(spec, can.field);
    }
    if (can.reason === "no_product") {
      return t("Choisissez d’abord un produit.", "Choose a product first.");
    }
    return t("Complétez la configuration pour continuer.", "Complete the configuration to continue.");
  }

  function illustrationEntry(category) {
    return state.illustrations?.categories?.[category] || null;
  }

  const HAND_FEMME = [
    { size: "S", tour: [15, 17], len: [17, 18] },
    { size: "M", tour: [17, 19], len: [18, 19] },
    { size: "L", tour: [19, 20], len: [19, 20] },
    { size: "XL", tour: [20, 21.5], len: [20, 21] },
  ];
  const HAND_HOMME = [
    { size: "S", tour: [18, 20.5], len: [18, 19] },
    { size: "M", tour: [20.5, 23], len: [19, 20] },
    { size: "L", tour: [23, 24], len: [20, 21] },
    { size: "XL", tour: [24, 25.5], len: [21, 22] },
  ];
  const HAND_ENFANT = [
    { size: "S", tour: [14, 15], len: [13.5, 14.5] },
    { size: "M", tour: [15, 16.5], len: [14.5, 15.5] },
    { size: "L", tour: [16.5, 18], len: [15.5, 16.5] },
    { size: "XL", tour: [18, 19], len: [16.5, 17.5] },
  ];

  function formatInches(cm) {
    const eighths = Math.round((cm / 2.54) * 8);
    const whole = Math.floor(eighths / 8);
    const rem = eighths - whole * 8;
    const frac = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" }[rem];
    if (!frac) return String(whole);
    if (!whole) return frac;
    return whole + " " + frac;
  }

  function handSpan(pair) {
    if (state.unit === "in") return formatInches(pair[0]) + " – " + formatInches(pair[1]);
    return pair[0] + " – " + pair[1];
  }

  function wireSoftAccordion(root) {
    const items = Array.from(root.querySelectorAll(".sg-page-accordion-item"));
    function setExpanded(details, expanded, animate) {
      const body = details.querySelector(".sg-page-accordion-body");
      if (!body) return;
      if (details.dataset.animating === "1") return;
      if (!animate) {
        details.open = expanded;
        details.classList.toggle("is-collapsed", !expanded);
        body.style.height = expanded ? "auto" : "0px";
        body.style.opacity = expanded ? "1" : "0";
        return;
      }
      details.dataset.animating = "1";
      if (expanded) {
        details.classList.remove("is-collapsed");
        details.open = true;
        body.style.height = "0px";
        body.style.opacity = "0";
        const target = body.scrollHeight;
        requestAnimationFrame(function () {
          body.style.height = target + "px";
          body.style.opacity = "1";
        });
        const onEnd = function (ev) {
          if (ev.propertyName !== "height") return;
          body.style.height = "auto";
          details.dataset.animating = "0";
          body.removeEventListener("transitionend", onEnd);
        };
        body.addEventListener("transitionend", onEnd);
      } else {
        const start = body.scrollHeight;
        body.style.height = start + "px";
        body.style.opacity = "1";
        requestAnimationFrame(function () {
          details.classList.add("is-collapsed");
          body.style.height = "0px";
          body.style.opacity = "0";
        });
        const onEnd = function (ev) {
          if (ev.propertyName !== "height") return;
          details.open = false;
          details.dataset.animating = "0";
          body.removeEventListener("transitionend", onEnd);
        };
        body.addEventListener("transitionend", onEnd);
      }
    }
    items.forEach(function (details, index) {
      const summary = details.querySelector(".sg-page-accordion-summary");
      if (!summary) return;
      setExpanded(details, index === 0, false);
      summary.addEventListener("click", function (e) {
        e.preventDefault();
        const willOpen = !details.open || details.classList.contains("is-collapsed");
        if (willOpen) {
          items.forEach(function (other) {
            if (other !== details && other.open && !other.classList.contains("is-collapsed")) {
              setExpanded(other, false, true);
            }
          });
          setExpanded(details, true, true);
        } else {
          setExpanded(details, false, true);
        }
      });
    });
  }

  function fillHandTable(table, headers, rows) {
    if (headers.caption) {
      const caption = document.createElement("caption");
      const title = document.createElement("span");
      title.textContent = headers.caption;
      const provisional = document.createElement("span");
      provisional.className = "sm-hand-provisional";
      provisional.textContent = t(
        "Mesures indicatives — à confirmer avec Lucie",
        "Indicative measurements — to be confirmed with Lucie",
      );
      caption.append(title, provisional);
      table.appendChild(caption);
    }
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    headers.cols.forEach((label) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const body = document.createElement("tbody");
    rows.forEach((cells) => {
      const tr = document.createElement("tr");
      cells.forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
  }

  function paintHandGuide() {
    if (!els.handGuide) return;
    const inches = state.unit === "in";
    const unitName = inches
      ? t("po", "in")
      : "cm";
    if (els.handTitle) {
      els.handTitle.textContent = t(
        "Comment mesurer pour vos mitaines",
        "How to measure for your mittens",
      );
    }
    if (els.handSub) {
      els.handSub.textContent = t(
        "Deux mesures — tour et longueur — selon la grille fabricant Auclair",
        "Two measurements — circumference and length — per Auclair manufacturer chart",
      );
    }
    if (els.handPhoto) {
      els.handPhoto.alt = t(
        "Schéma : tour de main autour de la paume sans le pouce (1), longueur du pli du poignet au bout du majeur (2).",
        "Diagram: hand circumference around the palm without the thumb (1), hand length from the wrist crease to the middle fingertip (2).",
      );
    }
    if (els.handSteps) {
      els.handSteps.replaceChildren();
      const steps = [
        {
          title: t("Tour de main", "Hand circumference"),
          text: t(
            "Mesurez le tour de votre main autour de la paume, au plus large, sans inclure le pouce.",
            "Measure around the palm at the widest point, without the thumb.",
          ),
        },
        {
          title: t("Longueur de la main", "Hand length"),
          text: t(
            "Du pli du poignet jusqu’au bout du majeur. Si les mesures diffèrent, privilégiez la longueur.",
            "From the wrist crease to the tip of the middle finger. If the two measurements differ, prefer length.",
          ),
        },
      ];
      steps.forEach((step, i) => {
        const li = document.createElement("li");
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = String(i + 1);
        const copy = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = step.title;
        const span = document.createElement("span");
        span.textContent = step.text;
        copy.append(strong, span);
        li.append(n, copy);
        els.handSteps.appendChild(li);
      });
    }
    if (els.handTables) {
      els.handTables.replaceChildren();
      const note = document.createElement("p");
      note.className = "sm-hand-unitnote";
      note.textContent = inches
        ? t(
            "Grandeurs en pouces : 1 po = 2,54 cm, arrondies au 1/8 po.",
            "Sizes in inches: 1 in = 2.54 cm, rounded to the nearest 1/8 in.",
          )
        : t(
            "Grandeurs en centimètres. Le bouton Pouces convertit le tableau.",
            "Sizes in centimetres. The Inches button converts the table.",
          );
      const accordion = document.createElement("div");
      accordion.className = "sg-page-accordion";
      const cols = [
        t("Grandeur", "Size"),
        t("Tour", "Around") + " (" + unitName + ")",
        t("Longueur", "Length") + " (" + unitName + ")",
      ];
      const groups = [
        { key: "femme", label: t("Femme — S à XL", "Women — S to XL"), rows: HAND_FEMME },
        { key: "homme", label: t("Homme — S à XL", "Men — S to XL"), rows: HAND_HOMME },
        { key: "enfant", label: t("Enfant — S à XL", "Kids — S to XL"), rows: HAND_ENFANT },
      ];
      groups.forEach(function (group) {
        const details = document.createElement("details");
        details.className = "sg-page-accordion-item";
        details.dataset.group = group.key;
        const summary = document.createElement("summary");
        summary.className = "sg-page-accordion-summary";
        summary.textContent = group.label;
        const body = document.createElement("div");
        body.className = "sg-page-accordion-body";
        const table = document.createElement("table");
        table.className = "sm-hand-table";
        fillHandTable(
          table,
          { caption: "", cols: cols },
          group.rows.map(function (row) {
            return [row.size, handSpan(row.tour), handSpan(row.len)];
          }),
        );
        body.appendChild(table);
        details.appendChild(summary);
        details.appendChild(body);
        accordion.appendChild(details);
      });
      els.handTables.append(note, accordion);
      wireSoftAccordion(accordion);
    }
    if (els.handAdvice) {
      els.handAdvice.textContent = t(
        "Conseil : mesurez la main dominante (celle que vous utilisez le plus), et gardez la main détendue, sans serrer.",
        "Tip: measure the dominant hand (the one you use most), and keep the hand relaxed, without squeezing.",
      );
    }
  }

  function renderIllustration() {
    const product = currentProduct();
    const figure = els.measureFigure;
    const img = els.measureImg;
    const caption = els.measureCaption;
    if (!figure || !img) return;
    if (!product || isAdaptedProduct(product)) {
      figure.hidden = true;
      figure.classList.remove("is-hand", "is-pending", "is-no-diagram");
      if (els.handGuide) els.handGuide.hidden = true;
      img.hidden = true;
      img.removeAttribute("src");
      img.alt = "";
      if (caption) caption.hidden = true;
      return;
    }
    if (product.category === "mitaines") {
      figure.hidden = false;
      figure.classList.add("is-hand");
      figure.classList.remove("is-pending", "is-no-diagram");
      img.hidden = true;
      img.removeAttribute("src");
      img.alt = "";
      if (caption) caption.hidden = true;
      if (els.handGuide) {
        els.handGuide.hidden = false;
        paintHandGuide();
      }
      return;
    }
    figure.classList.remove("is-hand");
    if (els.handGuide) els.handGuide.hidden = true;
    img.hidden = false;
    if (caption) caption.hidden = false;
    const entry = illustrationEntry(product.category);
    // Mukluks : pas de schéma pied (bébé ≠ pied adulte ; adulte → Lucie).
    if (entry?.hide_diagram || product.category === "mukluks") {
      figure.hidden = false;
      figure.classList.add("is-pending", "is-no-diagram");
      img.hidden = true;
      img.removeAttribute("src");
      img.alt = "";
      if (caption) {
        caption.hidden = false;
        caption.textContent =
          (eng() ? entry?.note_en : entry?.note_fr) ||
          t(
            "Mukluks : surtout pour bébé — aucun schéma de pied. Pour un adulte, contactez Lucie.",
            "Mukluks: mostly for babies — no foot diagram. For an adult, contact Lucie.",
          );
      }
      return;
    }
    img.hidden = false;
    figure.classList.remove("is-no-diagram");
    figure.hidden = false;
    const lang = eng() ? "en" : "fr";
    const src = entry?.files?.[lang] || "";
    const alt =
      (eng() ? entry?.alt_en : entry?.alt_fr) ||
      t(
        "Emplacement pour l’illustration des mensurations — à produire.",
        "Placeholder for the measurement illustration — to be produced.",
      );
    // Une seule langue par image : fichier FR ou EN distinct. « pret » seulement si fichier vérifié.
    const ready = entry && entry.asset_status === "pret" && !!src;

    const markers = entry?.markers || [];
    const legend = markers
      .map((m) => {
        const lab = eng() ? m.label_en : m.label_fr;
        return m.n != null ? m.n + " · " + lab : lab;
      })
      .filter(Boolean)
      .join(" · ");

    if (!ready) {
      figure.classList.add("is-pending");
      img.removeAttribute("onerror");
      img.src = placeholderSrc();
      img.alt = alt;
      if (caption) {
        caption.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = t("Illustration à produire", "Artwork to be produced");
        caption.appendChild(strong);
        caption.appendChild(
          document.createTextNode(
            " — " +
              t(
                "Fichier mono-langue non encore vérifié pour cette catégorie.",
                "Single-language file not yet verified for this category.",
              ),
          ),
        );
        if (legend) {
          caption.appendChild(document.createElement("br"));
          caption.appendChild(document.createTextNode(t("Repères prévus : ", "Planned markers: ") + legend));
        }
      }
      return;
    }

    figure.classList.remove("is-pending");
    img.onerror = () => {
      figure.classList.add("is-pending");
      img.onerror = null;
      img.src = placeholderSrc();
      if (caption) {
        caption.textContent = t(
          "Fichier illustration manquant — non remplacé par une image trompeuse.",
          "Illustration file missing — not replaced with a misleading image.",
        );
      }
    };
    img.src = src;
    img.alt = alt;
    if (caption) {
      // Légende HTML dans la langue du site seulement (l’image WebP est déjà mono-langue).
      caption.textContent = legend
        ? t("Repères : ", "Markers: ") + legend
        : t(
            "Référez-vous au schéma pour indiquer vos mesures.",
            "Use the diagram to enter your measurements.",
          );
    }
  }

  function clientFacingName(product) {
    let s = displayProductName(product);
    s = eng()
      ? s.replace(/\bdame\b/gi, "for women").replace(/\bhomme\b/gi, "for men")
      : s.replace(/\bdame\b/gi, "pour femme").replace(/\bhomme\b/gi, "pour homme");
    return s.replace(/\s{2,}/g, " ").trim();
  }

  function renderPersonalization() {
    const product = currentProduct();
    if (!els.step2) return;
    if (!product) {
      els.step2.hidden = true;
      if (els.step3) els.step3.hidden = true;
      if (els.step4) els.step4.hidden = true;
      state.viewStep = 1;
      updateProgress();
      return;
    }
    els.step2.hidden = false;
    if (els.step3) els.step3.hidden = false;
    if (els.step4) els.step4.hidden = false;
    updateProgress();

    if (els.configName) els.configName.textContent = clientFacingName(product);
    const adapted = isAdaptedProduct(product);
    if (els.configLead) {
      els.configLead.textContent = adapted
        ? t(
            "Photo modèle seulement. Aucune mesure à saisir ici — Lucie vous contactera après le paiement.",
            "Example photo only. No measurements to enter here — Lucie will contact you after payment.",
          )
        : t(
            "Fabrication selon vos mensurations.",
            "Made to your measurements.",
          );
    }
    if (els.comments) {
      els.comments.placeholder = adapted
        ? t(
            "Besoins, confort ou précisions utiles pour Lucie (optionnel)…",
            "Needs, comfort notes or details for Lucie (optional)…",
          )
        : t(
            "Précisions pour la fabrication…",
            "Notes for manufacturing…",
          );
    }

    const showHeat = !adapted && chaleurEligible(product);
    if (els.chaleurWrap) els.chaleurWrap.hidden = !showHeat;
    if (!showHeat) {
      state.chaleur = false;
      if (els.chaleur) els.chaleur.checked = false;
    }
    if (els.step3) els.step3.hidden = adapted;
  }

  function setUnit(unit) {
    // Les cm internes restent exacts — jamais de réécriture / substitution de mesure.
    state.unit = unit;
    state._lastUnit = unit;
    syncDisplayMeasurements();
    els.unitIn?.setAttribute("aria-pressed", String(unit === "in"));
    els.unitCm?.setAttribute("aria-pressed", String(unit === "cm"));
    if (els.unitHint) {
      els.unitHint.textContent =
        unit === "in"
          ? t(
              "Choisissez une valeur en pouces (⅛). L’équivalent cm s’affiche sous chaque mesure.",
              "Pick a value in inches (⅛). The cm equivalent appears under each measure.",
            )
          : t(
              "Choisissez une valeur en centimètres (pas de 0,5). L’équivalent pouces s’affiche sous chaque mesure.",
              "Pick a value in centimetres (0.5 steps). The inch equivalent appears under each measure.",
            );
    }
    renderMeasureFields();
    if (currentProduct()?.category === "mitaines") paintHandGuide();
    refreshSummary();
  }

  function renderMeasures() {
    const product = currentProduct();
    if (!product || !els.measures) return;
    if (isAdaptedProduct(product)) {
      els.measures.hidden = true;
      els.measures.innerHTML = "";
      if (els.measureNote) els.measureNote.hidden = true;
      if (els.measureErrors) {
        els.measureErrors.hidden = true;
        els.measureErrors.textContent = "";
      }
      if (els.unitIn) els.unitIn.closest?.(".sm-unit-row")?.setAttribute("hidden", "");
      document.getElementById("sm-unit-row")?.setAttribute("hidden", "");
      document.querySelector(".sm-unit-toggle")?.setAttribute("hidden", "");
      return;
    }
    document.getElementById("sm-unit-row")?.removeAttribute("hidden");
    document.querySelector(".sm-unit-toggle")?.removeAttribute("hidden");
    const spec = api.categoryMeasures(state.config, product.category);
    if (els.measureNote) {
      if (spec?.note_fr && !(spec.fields || []).length) {
        els.measureNote.hidden = false;
        els.measureNote.textContent = eng() ? spec.note_en : spec.note_fr;
      } else if (spec?.awaiting_lucie_validation || spec?.provisional) {
        els.measureNote.hidden = false;
        els.measureNote.textContent = t(
          "Mesures provisoires — proposées pour la fabrication, non encore validées définitivement par Lucie.",
          "Provisional measurements — proposed for crafting, not yet finally validated by Lucie.",
        );
      } else {
        els.measureNote.hidden = true;
      }
    }
    if (!state.unit) {
      els.measures.hidden = true;
      els.measures.innerHTML = "";
      return;
    }
    renderMeasureFields();
  }

  function measureHelpText(f) {
    const bits = [];
    if (f.help_fr) bits.push(eng() ? f.help_en || f.help_fr : f.help_fr);
    if (state.measureOutOfRange?.[f.id]) {
      bits.push(
        t(
          "Demande hors liste — Lucie vous contactera avec les coordonnées du paiement.",
          "Out-of-list request — Lucie will contact you using the payment details.",
        ),
      );
      return bits.join(" · ");
    }
    const cm = state.measurementsCm?.[f.id];
    if (cm != null && Number.isFinite(Number(cm))) {
      const other = state.unit === "in" ? "cm" : "in";
      const alt = api.fromCm(Number(cm), other);
      if (alt != null) {
        const shown = other === "in" ? formatInches(Number(cm)) : formatCmLabel(alt);
        bits.push(
          t("Équivaut à ", "Equals ") +
            shown +
            " " +
            (other === "in" ? t("po", "in") : "cm"),
        );
      }
      const lim = fieldLimitsCm(f.id);
      if (lim) {
        bits.push(
          t("Limites : ", "Limits: ") +
            (state.unit === "in"
              ? formatInches(lim.min) + " – " + formatInches(lim.max) + " " + t("po", "in")
              : formatCmLabel(lim.min) + " – " + formatCmLabel(lim.max) + " cm"),
        );
      }
    }
    return bits.join(" · ");
  }

  function renderMeasureFields() {
    const product = currentProduct();
    const spec = api.categoryMeasures(state.config, product.category);
    const fields = spec?.fields || [];
    els.measures.hidden = false;
    els.measures.innerHTML = "";
    if (!fields.length) {
      const p = document.createElement("p");
      p.className = "sm-help";
      p.textContent = t(
        "Aucune mensuration obligatoire pour ce produit — utilisez les commentaires si besoin.",
        "No required measurements for this product — use comments if needed.",
      );
      els.measures.appendChild(p);
      return;
    }
    const meas = api.validateMeasurements(spec, state.unit, state.measurements, {
      measurementsCm: state.measurementsCm,
      measureOutOfRange: state.measureOutOfRange,
    });
    const unitSuffix = state.unit === "in" ? t("po", "in") : "cm";
    for (const f of fields) {
      const row = document.createElement("div");
      row.className = "sm-wheel-field";
      row.dataset.field = f.id;
      const triggerId = "sm-m-" + f.id;
      const helpId = "sm-h-" + f.id;
      const panelId = "sm-w-" + f.id;
      const isOpen = state.openWheelField === f.id;
      const isOor = !!state.measureOutOfRange?.[f.id];
      const invalid = !meas.ok && meas.field === f.id;
      row.classList.toggle("is-open", isOpen);
      row.classList.toggle("is-oor", isOor);
      row.classList.toggle("is-error", invalid);

      const lab = document.createElement("label");
      lab.htmlFor = triggerId;
      if (f.diagram_number != null) {
        const num = document.createElement("span");
        num.className = "sm-field-num";
        num.textContent = String(f.diagram_number);
        num.setAttribute("aria-hidden", "true");
        lab.appendChild(num);
      }
      lab.appendChild(
        document.createTextNode((eng() ? f.label_en : f.label_fr) + (f.required ? " *" : "")),
      );

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.id = triggerId;
      trigger.className = "sm-wheel-trigger";
      trigger.setAttribute("aria-expanded", String(isOpen));
      trigger.setAttribute("aria-controls", panelId);
      trigger.setAttribute("aria-required", String(!!f.required));
      trigger.setAttribute("aria-describedby", helpId);
      trigger.setAttribute("aria-invalid", String(invalid));
      const shown = displayMeasureValue(f.id);
      trigger.textContent = shown || t("Choisir une mesure…", "Choose a measurement…");
      trigger.addEventListener("click", () => {
        state.openWheelField = isOpen ? null : f.id;
        renderMeasureFields();
        if (!isOpen) {
          const panel = document.getElementById(panelId);
          panel?.querySelector(".sm-wheel-item.is-selected")?.scrollIntoView({ block: "center" });
        }
      });

      const help = document.createElement("p");
      help.className = "sm-help";
      help.id = helpId;
      help.textContent = measureHelpText(f);

      row.appendChild(lab);
      row.appendChild(trigger);
      row.appendChild(help);

      if (isOpen) {
        const panel = document.createElement("div");
        panel.className = "sm-wheel-panel";
        panel.id = panelId;
        panel.setAttribute("role", "listbox");
        panel.setAttribute(
          "aria-label",
          (eng() ? f.label_en : f.label_fr) + " — " + unitSuffix,
        );

        const ticks = buildMeasureTicks(f.id);
        const controls = document.createElement("div");
        controls.className = "sm-wheel-controls";

        const minus = document.createElement("button");
        minus.type = "button";
        minus.className = "sm-wheel-step";
        minus.setAttribute("aria-label", t("Valeur précédente", "Previous value"));
        minus.textContent = "−";

        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "sm-wheel-step";
        plus.setAttribute("aria-label", t("Valeur suivante", "Next value"));
        plus.textContent = "+";

        const viewport = document.createElement("div");
        viewport.className = "sm-wheel-viewport";
        const list = document.createElement("ul");
        list.className = "sm-wheel-list";

        let selectedIdx = -1;
        const curCm = state.measurementsCm?.[f.id];
        if (curCm != null && !isOor) {
          selectedIdx = ticks.findIndex((tick) => Math.abs(tick.cm - Number(curCm)) < 1e-6);
        }
        if (selectedIdx < 0 && ticks.length) selectedIdx = Math.floor(ticks.length / 2);

        ticks.forEach((tick, idx) => {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sm-wheel-item" + (idx === selectedIdx && !isOor ? " is-selected" : "");
          btn.setAttribute("role", "option");
          btn.setAttribute("aria-selected", String(idx === selectedIdx && !isOor));
          btn.textContent = tick.label + " " + unitSuffix;
          btn.addEventListener("click", () => {
            setMeasureCm(f.id, tick.cm);
            state.openWheelField = null;
            renderMeasureFields();
            refreshSummary();
          });
          li.appendChild(btn);
          list.appendChild(li);
        });

        if (!ticks.length) {
          const empty = document.createElement("p");
          empty.className = "sm-help";
          empty.textContent = t(
            "Aucune valeur dans la liste pour cette clientèle. Utilisez « hors liste ».",
            "No listed values for this audience. Use the out-of-list option.",
          );
          viewport.appendChild(empty);
        } else {
          viewport.appendChild(list);
        }

        function stepBy(delta) {
          if (!ticks.length) return;
          let idx = selectedIdx;
          if (idx < 0) idx = Math.floor(ticks.length / 2);
          idx = Math.max(0, Math.min(ticks.length - 1, idx + delta));
          selectedIdx = idx;
          setMeasureCm(f.id, ticks[idx].cm);
          renderMeasureFields();
          refreshSummary();
          requestAnimationFrame(() => {
            document
              .getElementById(panelId)
              ?.querySelector(".sm-wheel-item.is-selected")
              ?.scrollIntoView({ block: "center" });
          });
        }
        minus.addEventListener("click", () => stepBy(-1));
        plus.addEventListener("click", () => stepBy(1));

        controls.appendChild(minus);
        controls.appendChild(viewport);
        controls.appendChild(plus);
        panel.appendChild(controls);

        const oor = document.createElement("button");
        oor.type = "button";
        oor.className = "sm-wheel-oor" + (isOor ? " is-active" : "");
        oor.textContent = t(
          "Mesure hors liste — Lucie me contactera",
          "Out-of-list measure — Lucie will contact me",
        );
        oor.addEventListener("click", () => {
          setMeasureOutOfRange(f.id);
          state.openWheelField = null;
          renderMeasureFields();
          refreshSummary();
        });
        panel.appendChild(oor);

        if (shown) {
          const clear = document.createElement("button");
          clear.type = "button";
          clear.className = "sm-wheel-clear";
          clear.textContent = t("Effacer ce choix", "Clear this choice");
          clear.addEventListener("click", () => {
            clearMeasureChoice(f.id);
            renderMeasureFields();
            refreshSummary();
          });
          panel.appendChild(clear);
        }

        row.appendChild(panel);
      }

      els.measures.appendChild(row);
    }
  }

  function refreshSummary() {
    const product = currentProduct();
    const aside = els.summary?.closest(".sm-summary");
    if (aside) aside.classList.toggle("is-empty", !product);
    if (els.step4) els.step4.hidden = !product;
    if (!els.summary) return;
    els.summary.innerHTML = "";

    if (!product) {
      els.add.disabled = true;
      if (els.priceBox) els.priceBox.hidden = true;
      return;
    }

    if (els.priceBox) els.priceBox.hidden = false;
    const price = api.officialPrice(state.catalog, product.id);
    const totalCents = price.ok ? price.total_cad_cents : null;
    const spec = api.categoryMeasures(state.config, product.category);
    const meas = api.validateMeasurements(spec, state.unit, state.measurements, {
      measurementsCm: state.measurementsCm,
      measureOutOfRange: state.measureOutOfRange,
    });
    const can = api.canAddToCart(state.catalog, state.config, product.id, state);

    const rows = [
      [t("Modèle", "Model"), clientFacingName(product)],
      [t("Prix", "Price"), totalCents != null ? money(totalCents) : "—"],
    ];
    if (state.requestedSize && LETTERS[state.requestedSize]) {
      rows.push([
        t("Taille demandée", "Requested size"),
        t(LETTERS[state.requestedSize].fr, LETTERS[state.requestedSize].en),
      ]);
      rows.push([t("Délai", "Lead time"), delayText()]);
    }
    rows.push([
      t("Unité", "Unit"),
      state.unit === "in"
        ? t("Pouces", "Inches")
        : state.unit === "cm"
          ? t("Centimètres", "Centimetres")
          : "—",
    ]);
    for (const f of spec?.fields || []) {
      rows.push([
        eng() ? f.label_en : f.label_fr,
        displayMeasureValue(f.id) || "—",
      ]);
    }
    const oorIds = Object.keys(state.measureOutOfRange || {}).filter(
      (k) => state.measureOutOfRange[k],
    );
    if (oorIds.length) {
      rows.push([
        t("Demande particulière", "Special request"),
        t(
          "Mesure hors liste — Lucie contactera le client (coordonnées du paiement).",
          "Out-of-list measure — Lucie will contact the client (payment details).",
        ),
      ]);
    }
    if (els.chaleurWrap && !els.chaleurWrap.hidden) {
      rows.push([
        t("Chaleur renforcée", "Extra warmth"),
        state.chaleur
          ? t("Oui — +20 $ non inclus dans le total", "Yes — +$20 not included in the total yet")
          : t("Non", "No"),
      ]);
    }
    rows.push([
      t("Cuir", "Leather"),
      t("Noir seulement", "Black only"),
    ]);
    if (state.comments.trim()) {
      rows.push([t("Commentaires", "Comments"), state.comments.trim()]);
    }
    rows.push([
      t("Livraison", "Shipping"),
      t("Frais à calculer", "Fees to be calculated"),
    ]);

    for (const [a, b] of rows) {
      const li = document.createElement("li");
      li.innerHTML = "<span></span><span></span>";
      li.children[0].textContent = a;
      li.children[1].textContent = b;
      els.summary.appendChild(li);
    }

    els.measures?.querySelectorAll(".sm-wheel-field").forEach((row) => {
      const bad = meas.field === row.dataset.field && !meas.ok;
      row.classList.toggle("is-error", bad);
      const trigger = row.querySelector(".sm-wheel-trigger");
      if (trigger) trigger.setAttribute("aria-invalid", String(bad));
    });

    const errText = errorMessage(can, spec);
    if (els.measureErrors) {
      if (errText && state.unit) {
        els.measureErrors.hidden = false;
        els.measureErrors.textContent = errText;
      } else if (errText && can.reason === "unit_required") {
        els.measureErrors.hidden = false;
        els.measureErrors.textContent = errText;
      } else {
        clearMeasureErrors();
      }
    }

    if (els.priceValue) els.priceValue.textContent = totalCents != null ? money(totalCents) : "—";
    if (els.priceNote) {
      els.priceNote.textContent =
        state.chaleur && chaleurEligible(product)
          ? t(
              "Même prix que dans la Boutique. Le supplément de 20 $ n’est pas ajouté pour l’instant.",
              "Same price as in the Shop. The $20 supplement is not added for now.",
            )
          : t(
              "Même prix que dans la Boutique. Livraison calculée au paiement — pas encore une commande payée.",
              "Same price as in the Shop. Shipping is calculated at payment — not a paid order yet.",
            );
    }
    els.priceBox?.classList.remove("is-pending");
    els.add.disabled = !can.ok;
    updateProgress();
  }

  function addToCart() {
    clearMsg();
    const check = api.canAddToCart(state.catalog, state.config, state.productId, state);
    if (!check.ok) {
      const spec = api.categoryMeasures(state.config, check.product?.category || currentProduct()?.category);
      const msg = errorMessage(check, spec) || t(
        "Complétez l’unité et les mesures requises.",
        "Complete the unit and required measurements.",
      );
      showMsg("err", msg, msg);
      if (els.measureErrors) {
        els.measureErrors.hidden = false;
        els.measureErrors.textContent = msg;
      }
      refreshSummary();
      if (check.reason === "unit_required") gotoStep(3);
      else if (check.field) {
        gotoStep(3, { focus: false });
        const trigger = document.getElementById("sm-m-" + check.field);
        trigger?.focus();
      }
      return;
    }
    const product = check.product;
    const adapted = !!(check.skip_measures || isAdaptedProduct(product));
    const price = {
      ...check.price,
      total_cad_cents: check.price.total_cad_cents,
    };
    const customId =
      "custom:" + product.id + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const spec = api.categoryMeasures(state.config, product.category);
    const measurement_labels = {};
    if (!adapted) {
      for (const f of spec?.fields || []) {
        measurement_labels[f.id] = { fr: f.label_fr, en: f.label_en };
      }
    }
    const name_fr = adapted
      ? product.name_fr
      : "Sur mesure — " + stripSizeTokens(product.name_fr);
    const name_en = adapted
      ? product.name_en || "Adapted mukluks – Made to order"
      : "Custom — " + stripSizeTokens(product.name_en || product.name_fr);

    syncDisplayMeasurements();
    const measureOutOfRange = adapted
      ? {}
      : Object.fromEntries(
          Object.entries(state.measureOutOfRange || {}).filter(([, v]) => !!v),
        );
    const measurementsCm = adapted
      ? null
      : Object.fromEntries(
          Object.entries(state.measurementsCm || {}).filter(
            ([k, v]) =>
              !measureOutOfRange[k] && v != null && Number.isFinite(Number(v)),
          ),
        );
    const special_requests = Object.keys(measureOutOfRange).map(
      (fieldId) => "mesure_hors_liste:" + fieldId,
    );
    const productNumber =
      product.product_number != null ? Number(product.product_number) : null;
    const item = {
      id: customId,
      catalog_id: product.id,
      product_type: product.category,
      product_number: productNumber,
      name: eng() ? name_en : name_fr,
      name_fr,
      name_en,
      price: price.total_cad_cents / 100,
      price_cad_cents: price.total_cad_cents,
      qty: 1,
      custom: true,
      custom_config: {
        product_id: product.id,
        product_number: productNumber,
        category: product.category,
        unit: adapted ? null : state.unit,
        measurements: adapted ? {} : { ...state.measurements },
        measurements_cm: measurementsCm,
        measure_out_of_range: measureOutOfRange,
        special_requests,
        measurement_labels,
        chaleur: adapted ? false : !!state.chaleur,
        comments: state.comments.trim(),
        leather: "noir",
        requested_size: adapted ? null : state.requestedSize || null,
        requested_size_label_fr:
          !adapted && state.requestedSize ? LETTERS[state.requestedSize].fr : null,
        requested_size_label_en:
          !adapted && state.requestedSize ? LETTERS[state.requestedSize].en : null,
        lead_time_fr: adapted
          ? "Lucie communiquera sous 3 à 5 jours ouvrables pour les mesures. Confection : minimum 1 semaine après confirmation des mesures."
          : state.requestedSize && state.config?.made_to_order
            ? state.config.made_to_order.delay_fr
            : null,
        lead_time_en: adapted
          ? "Lucie will contact you within 3 to 5 business days for measurements. Making: at least 1 week after measurement confirmation."
          : state.requestedSize && state.config?.made_to_order
            ? state.config.made_to_order.delay_en
            : null,
        priced_ok: true,
        price_source: "catalog/products.json",
        csm_code: productNumber != null ? productNumber + "-CSM" : "CSM",
        skip_measures: adapted,
        adapted_contact: adapted,
      },
    };

    let cart = [];
    try {
      cart = JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (_) {
      cart = [];
    }
    if (!Array.isArray(cart)) cart = [];
    cart.push(item);
    localStorage.setItem(KEY, JSON.stringify(cart));
    window.dispatchEvent(new Event("boreales-cart-updated"));
    if (window.refreshCartCount) window.refreshCartCount({ bounce: true });
    showMsg(
      "ok",
      adapted
        ? "Ajouté au panier. Passez au paiement — Lucie vous contactera ensuite pour les mesures."
        : "Ajouté au panier avec vos mesures. Ce n’est pas encore un paiement.",
      adapted
        ? "Added to cart. Proceed to payment — Lucie will then contact you for measurements."
        : "Added to cart with your measurements. This is not a payment yet.",
    );
    gotoStep(4, { focus: false });
    els.msg?.focus?.();
  }

  els.unitIn?.addEventListener("click", () => setUnit("in"));
  els.unitCm?.addEventListener("click", () => setUnit("cm"));
  els.add.addEventListener("click", addToCart);
  els.progress?.querySelectorAll("[data-sm-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      gotoStep(btn.getAttribute("data-sm-goto"));
    });
  });
  els.comments?.addEventListener("input", () => {
    state.comments = els.comments.value || "";
    refreshSummary();
  });
  els.chaleur?.addEventListener("change", () => {
    state.chaleur = !!els.chaleur.checked;
    refreshSummary();
  });

  document.querySelectorAll("[data-set-lang]").forEach((b) => {
    b.addEventListener("click", () => {
      setTimeout(() => {
        renderCategoryPick();
        renderProducts();
        updateStep1Copy();
        if (els.changeCat) {
          els.changeCat.textContent = t("← Changer de catégorie", "← Change category");
        }
        renderPersonalization();
        if (state.unit) renderMeasureFields();
        else renderMeasures();
        renderIllustration();
        refreshSummary();
      }, 0);
    });
  });

  els.changeCat?.addEventListener("click", () => clearCategory());

  els.audienceBar?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".audience-filter");
    if (!btn || !els.audienceBar.contains(btn)) return;
    setAudienceFilter(btn.dataset.audience || "tous");
  });

  function boot() {
    if (location.protocol === "file:") {
      setProductsStatus(
        "Ouvrez le site via un serveur HTTP local (pas file://) pour charger le catalogue Boutique.",
        "Open the site via a local HTTP server (not file://) to load the Shop catalog.",
        "err",
      );
      showMsg(
        "err",
        "Ouvrez le site via un serveur HTTP local (pas file://) pour charger le catalogue Boutique.",
        "Open the site via a local HTTP server (not file://) to load the Shop catalog.",
      );
      return;
    }
    setProductsStatus(
      "Chargement du catalogue Boutique…",
      "Loading the Shop catalog…",
    );
    const productsUrl = new URL("catalog/products.json", document.baseURI).href;
    const configUrl = new URL("catalog/sur-mesure-config.json", document.baseURI).href;
    const illusUrl = new URL("catalog/sur-mesure-illustrations.json", document.baseURI).href;
    const audienceUrl = new URL("catalog/audience.json", document.baseURI).href;
    const sizesUrl = new URL("catalog/product-sizes.json", document.baseURI).href;
    const limitsUrl = new URL("catalog/sur-mesure-limits.json", document.baseURI).href;
    Promise.all([
      fetch(productsUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("products HTTP " + r.status);
        return r.json();
      }),
      fetch(configUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("config HTTP " + r.status);
        return r.json();
      }),
      fetch(illusUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("illustrations HTTP " + r.status);
        return r.json();
      }),
      fetch(audienceUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { products: {} })),
      fetch(sizesUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { products: {} })),
      fetch(limitsUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([catalog, config, illustrations, audience, productSizes, limits]) => {
        const n = Array.isArray(catalog?.products) ? catalog.products.length : 0;
        if (!n) {
          throw new Error("catalog empty");
        }
        state.catalog = catalog;
        state.config = config;
        state.illustrations = illustrations;
        state.limits = limits;
        state.audienceById = audience && audience.products ? audience.products : {};
        state.productSizes = productSizes && productSizes.products ? productSizes : { products: {} };
        clearMsg();
        state.filter = null;
        state.audienceFilter = "tous";
        renderAudienceBar();
        renderCategoryPick();
        renderProducts();
        updateStep1Copy();
        renderIllustration();
        refreshSummary();
        const link = readOrderLink();
        const linked = link.modele ? api.findProduct(catalog, link.modele) : null;
        if (linked) {
          state.linkedProductId = linked.id;
          state.requestedSize = link.taille || null;
          if (link.chaleur && !chaleurEligible(linked)) stripChaleurFromUrl();
          const linkedAud = audienceOf(linked.id);
          state.audienceFilter =
            linkedAud && linkedAud !== "unisexe" ? linkedAud : "tous";
          renderAudienceBar();
          state.filter = linked.category;
          if (els.categoryPick) els.categoryPick.hidden = true;
          if (els.productsWrap) els.productsWrap.hidden = false;
          renderCategoryPick();
          updateStep1Copy();
          selectProduct(linked.id);
        }
        const cats = state.filter
          ? 1
          : els.categoryPick?.querySelectorAll(".sm-category-card").length || 0;
        if (!cats) {
          setProductsStatus(
            "Catalogue chargé mais aucune catégorie trouvée.",
            "Catalog loaded but no categories found.",
            "err",
          );
          if (els.productsWrap) els.productsWrap.hidden = false;
        } else {
          setProductsStatus("", "");
        }
      })
      .catch((err) => {
        console.error("[sur-mesure] catalog load", err);
        setProductsStatus(
          "Impossible de charger le catalogue Boutique (products.json). Vérifiez le serveur local et rechargez.",
          "Could not load the Shop catalog (products.json). Check the local server and reload.",
          "err",
        );
        showMsg(
          "err",
          "Impossible de charger le catalogue Boutique ou la config sur mesure.",
          "Could not load the Shop catalog or made-to-measure config.",
        );
      });
  }

  boot();
})();
