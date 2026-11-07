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
    productsWrap: document.getElementById("sm-products-wrap"),
    changeCat: document.getElementById("sm-change-cat"),
    catCurrent: document.getElementById("sm-cat-current"),
    productsTitle: document.getElementById("sm-products-title"),
    step1Lead: document.getElementById("sm-step1-lead"),
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
    filter: null,
    productId: null,
    unit: "cm",
    measurements: {},
    _lastUnit: null,
    chaleur: false,
    comments: "",
    viewStep: 1,
    requestedSize: null,
    linkedProductId: null,
    audienceById: {},
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
        .filter((p) => p.active !== false)
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

  /**
   * Si deux SKU ont le même libellé sans taille (ex. mitaines renard M vs M-L),
   * on garde deux cartes + photo de chaque SKU ; distinction par réf. catalogue
   * (pas de sélecteur S/M/L/XL). Décision Francis 2026-11-01 : ne pas fusionner
   * tant que Lucie n’a pas tranché.
   */
  function displayProductNameDisambiguated(p, list) {
    const base = displayProductName(p);
    const twins = (list || []).filter((x) => displayProductName(x) === base);
    if (twins.length <= 1) return base;
    return base + " · " + t("réf.", "ref.") + " " + p.id;
  }

  function categoryLabel(c) {
    const lab = CAT_LABELS[c];
    return lab ? (eng() ? lab.en : lab.fr) : c;
  }

  function productsInCategory(cat) {
    return (state.catalog.products || []).filter(
      (p) => p.active !== false && p.category === cat,
    );
  }

  function firstImageInCategory(cat) {
    const p = productsInCategory(cat)[0];
    return p?.image || "";
  }

  function updateStep1Copy() {
    if (els.productsTitle) {
      els.productsTitle.textContent = state.filter
        ? t("Choisir un modèle", "Choose a model")
        : t("Choisir une catégorie", "Choose a category");
      els.productsTitle.dataset.fr = state.filter ? "Choisir un modèle" : "Choisir une catégorie";
      els.productsTitle.dataset.en = state.filter ? "Choose a model" : "Choose a category";
    }
    if (els.step1Lead) {
      const fr = state.filter
        ? "Photo, prix officiel du catalogue. Les tailles S/M/L/XL ne s’appliquent pas : vous indiquerez vos mesures."
        : "Choisissez d’abord le type de création, puis le modèle. Les mensurations remplacent les tailles standards.";
      const en = state.filter
        ? "Photo and official catalog price. Standard S/M/L/XL sizes do not apply — you will enter your measurements."
        : "First choose the type of creation, then the model. Measurements replace standard sizes.";
      els.step1Lead.textContent = t(fr, en);
      els.step1Lead.dataset.fr = fr;
      els.step1Lead.dataset.en = en;
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
      name.textContent = displayProductNameDisambiguated(p, list);
      const price = document.createElement("span");
      price.className = "sm-product-tile-price";
      price.textContent = money(p.price_cad_cents);
      const cta = document.createElement("span");
      cta.className = "sm-product-tile-cta";
      cta.textContent = t("Personnaliser", "Customize");
      body.appendChild(name);
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
        "Indiquez la mesure requise : ",
        "Enter the required measurement: ",
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

  const HAND_ADULT = [
    { size: "S", tour: [16, 18], len: [17, 18] },
    { size: "M", tour: [18, 20], len: [18, 19] },
    { size: "L", tour: [20, 22], len: [19, 20] },
    { size: "XL", tour: [22, 24], len: [20, 21] },
  ];
  const HAND_CHILD = [
    { fr: "8 – 24 mois", en: "8–24 months", tour: [11, 13], len: [10, 12] },
    { fr: "2 – 4 ans", en: "2–4 years", tour: [13, 15], len: [12, 14] },
    { fr: "5 – 7 ans", en: "5–7 years", tour: [15, 17], len: [14, 16] },
    { fr: "8 – 10 ans", en: "8–10 years", tour: [17, 18], len: [16, 17] },
    { fr: "11 – 14 ans (junior)", en: "11–14 years (junior)", tour: [18, 20], len: [17, 19] },
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

  function fillHandTable(table, headers, rows) {
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
        "Deux mesures seulement — validées pour la fabrication",
        "Two measurements only — confirmed for crafting",
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
            "Mesurez du pli du poignet (base de la paume) jusqu’au bout du majeur.",
            "Measure from the wrist crease (base of the palm) to the tip of the middle finger.",
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
      const adult = document.createElement("table");
      adult.className = "sm-hand-table";
      fillHandTable(
        adult,
        {
          caption: t("Correspondance des grandeurs (adultes)", "Adult size match"),
          cols: [
            t("Grandeur", "Size"),
            t("Tour", "Around") + " (" + unitName + ")",
            t("Longueur", "Length") + " (" + unitName + ")",
          ],
        },
        HAND_ADULT.map((row) => [row.size, handSpan(row.tour), handSpan(row.len)]),
      );
      const child = document.createElement("table");
      child.className = "sm-hand-table";
      fillHandTable(
        child,
        {
          caption: t("Repères enfants (à titre indicatif)", "Children’s guide (approximate)"),
          cols: [
            t("Âge", "Age"),
            t("Tour", "Around") + " (" + unitName + ")",
            t("Longueur", "Length") + " (" + unitName + ")",
          ],
        },
        HAND_CHILD.map((row) => [eng() ? row.en : row.fr, handSpan(row.tour), handSpan(row.len)]),
      );
      els.handTables.append(note, adult, child);
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
      .map((m) => m.n + " · " + (eng() ? m.label_en : m.label_fr))
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
    if (state._lastUnit && state._lastUnit !== unit) {
      const converted = {};
      for (const [id, val] of Object.entries(state.measurements)) {
        if (val === "" || val == null) continue;
        const cm = api.toCm(val, state._lastUnit);
        const shown = api.fromCm(cm, unit);
        converted[id] = shown == null ? "" : Number(shown.toFixed(3));
      }
      state.measurements = converted;
    }
    state.unit = unit;
    state._lastUnit = unit;
    els.unitIn?.setAttribute("aria-pressed", String(unit === "in"));
    els.unitCm?.setAttribute("aria-pressed", String(unit === "cm"));
    if (els.unitHint) {
      els.unitHint.textContent =
        unit === "in"
          ? t("Saisie en pouces — équivalent cm affiché sous chaque champ.", "Enter inches — cm equivalent shown under each field.")
          : t("Saisie en centimètres — équivalent pouces affiché sous chaque champ.", "Enter centimetres — inch equivalent shown under each field.");
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
    if (state.measurements[f.id]) {
      const other = state.unit === "in" ? "cm" : "in";
      const cm = api.toCm(state.measurements[f.id], state.unit);
      const alt = api.fromCm(cm, other);
      if (alt != null) {
        const shown = other === "in" ? formatInches(cm) : alt.toFixed(2);
        bits.push(
          t("Équivaut à ", "Equals ") +
            shown +
            " " +
            (other === "in" ? t("po", "in") : "cm"),
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
    const suffix = state.unit === "in" ? t("po", "in") : "cm";
    const meas = api.validateMeasurements(spec, state.unit, state.measurements);
    for (const f of fields) {
      const row = document.createElement("div");
      row.className = "sm-input-row";
      row.dataset.field = f.id;
      const inputId = "sm-m-" + f.id;
      const helpId = "sm-h-" + f.id;
      const lab = document.createElement("label");
      lab.htmlFor = inputId;
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
      const wrap = document.createElement("div");
      wrap.className = "sm-input-wrap";
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "decimal";
      input.step = "any";
      input.min = "0";
      input.id = inputId;
      input.value = state.measurements[f.id] ?? "";
      input.setAttribute("aria-required", String(!!f.required));
      input.setAttribute("aria-describedby", helpId);
      const invalid = !meas.ok && meas.field === f.id;
      input.setAttribute("aria-invalid", String(invalid));
      row.classList.toggle("is-error", invalid);
      input.addEventListener("input", () => {
        state.measurements[f.id] = input.value;
        const helpEl = document.getElementById(helpId);
        if (helpEl) helpEl.textContent = measureHelpText(f);
        refreshSummary();
      });
      const suf = document.createElement("span");
      suf.className = "sm-unit-suffix";
      suf.textContent = suffix;
      wrap.appendChild(input);
      wrap.appendChild(suf);
      const help = document.createElement("p");
      help.className = "sm-help";
      help.id = helpId;
      help.textContent = measureHelpText(f);
      row.appendChild(lab);
      row.appendChild(wrap);
      row.appendChild(help);
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
    const meas = api.validateMeasurements(spec, state.unit, state.measurements);
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
      const v = state.measurements[f.id];
      rows.push([
        eng() ? f.label_en : f.label_fr,
        v
          ? v + " " + (state.unit === "in" ? t("po", "in") : "cm")
          : "—",
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

    els.measures?.querySelectorAll(".sm-input-row").forEach((row) => {
      const bad = meas.field === row.dataset.field && !meas.ok;
      row.classList.toggle("is-error", bad);
      const input = row.querySelector("input");
      if (input) input.setAttribute("aria-invalid", String(bad));
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
        const input = document.getElementById("sm-m-" + check.field);
        input?.focus();
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
        measurements_cm: adapted
          ? null
          : Object.fromEntries(
              Object.entries(state.measurements)
                .filter(([, v]) => v !== "" && v != null)
                .map(([k, v]) => [k, api.toCm(v, state.unit)]),
            ),
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
    ])
      .then(([catalog, config, illustrations, audience]) => {
        const n = Array.isArray(catalog?.products) ? catalog.products.length : 0;
        if (!n) {
          throw new Error("catalog empty");
        }
        state.catalog = catalog;
        state.config = config;
        state.illustrations = illustrations;
        state.audienceById = audience && audience.products ? audience.products : {};
        clearMsg();
        state.filter = null;
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
