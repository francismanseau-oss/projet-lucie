(() => {
  "use strict";

  const GUIDE_URL = "catalog/size-guide.json";
  const ILLUSTRATIONS_URL = "catalog/sur-mesure-illustrations.json";
  const CONFIG_URL = "catalog/sur-mesure-config.json";

  let guideDoc = null;
  let illusDoc = null;
  let configDoc = null;
  let dataReady = false;
  let loadPromise = null;
  let dialog = null;
  let lastFocus = null;
  let pageRoot = null;
  let pageState = { sectionId: null, panelIndex: 0, chartUnit: "cm", shellOpen: false };

  const en = () => document.documentElement.lang.startsWith("en");

  function t(fr, enText) {
    return en() ? enText : fr;
  }

  async function ensureData() {
    if (dataReady) return;
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(GUIDE_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(ILLUSTRATIONS_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(CONFIG_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([g, i, c]) => {
      guideDoc = g;
      illusDoc = i;
      configDoc = c;
      dataReady = true;
    });
    return loadPromise;
  }

  function illustrationEntry(key) {
    if (!key || !illusDoc || !illusDoc.categories) return null;
    return illusDoc.categories[key] || null;
  }

  function categoryGuide(category) {
    return (guideDoc && guideDoc.categories && guideDoc.categories[category]) || null;
  }

  function categoryFields(category) {
    const block =
      configDoc &&
      configDoc.measurements_by_category &&
      configDoc.measurements_by_category[category];
    return (block && block.fields) || [];
  }

  /** Résout le fichier image à afficher — remplacer un WebP = changer files dans sur-mesure-illustrations.json. */
  function resolveIllustrationSrc(entry) {
    if (!entry || !entry.files || entry.hide_diagram) return null;
    const src = en() ? entry.files.en || entry.files.fr : entry.files.fr || entry.files.en;
    return src || null;
  }

  function formatDualValue(row) {
    const sm = window.BOREALES_SUR_MESURE;
    const cm =
      row.cm != null
        ? Number(row.cm)
        : row.in != null && sm
          ? sm.toCm(row.in, "in")
          : null;
    if (cm == null || !Number.isFinite(cm)) return null;
    const inches = sm ? sm.fromCm(cm, "in") : cm / 2.54;
    const cmLabel = (Math.round(cm * 100) / 100).toFixed(2).replace(/\.?0+$/, "") + " cm";
    let inLabel;
    if (sm && typeof inches === "number") {
      const eighths = Math.round(inches * 8);
      const whole = Math.floor(eighths / 8);
      const frac = eighths % 8;
      inLabel =
        (frac === 0 ? String(whole) : whole + " " + frac + "/8") +
        " " +
        t("po", "in");
    } else {
      inLabel = (Math.round(inches * 100) / 100) + " " + t("po", "in");
    }
    return { cmLabel, inLabel };
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "size-guide-dialog";
    dialog.className = "size-guide-dialog";
    dialog.setAttribute("aria-labelledby", "size-guide-title");
    dialog.innerHTML =
      '<div class="size-guide-sheet">' +
      '<header class="size-guide-head">' +
      '<h2 id="size-guide-title"></h2>' +
      '<button type="button" class="size-guide-close" aria-label="Fermer">×</button>' +
      "</header>" +
      '<p class="size-guide-how" id="size-guide-how"></p>' +
      '<figure class="size-guide-figure">' +
      '<img id="size-guide-img" alt="" width="1200" height="703" decoding="async">' +
      '<figcaption id="size-guide-cap"></figcaption>' +
      "</figure>" +
      '<div class="size-guide-chart-wrap">' +
      '<h3 id="size-guide-chart-title"></h3>' +
      '<div class="size-guide-table-scroll">' +
      '<table class="size-guide-table" id="size-guide-table">' +
      "<thead></thead><tbody></tbody>" +
      "</table>" +
      "</div>" +
      '<p class="size-guide-lucie" id="size-guide-lucie"></p>' +
      "</div>" +
      "</div>";
    document.body.appendChild(dialog);

    const closeBtn = dialog.querySelector(".size-guide-close");
    closeBtn.addEventListener("click", () => close());
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });
    return dialog;
  }

  function close() {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (_) {}
    }
    lastFocus = null;
  }

  function displaySizeLabel(sz) {
    const api = window.BOREALES_PRODUCT_SIZES;
    if (api && api.displayLabel) return api.displayLabel(sz.code, sz);
    return en() ? sz.label_en || sz.code : sz.label_fr || sz.code;
  }

  function chartCellForSize(sz, unit) {
    const pending = t("À confirmer avec Lucie", "To confirm with Lucie");
    if (!sz || typeof sz !== "object") return pending;
    const dual = formatDualValue({
      cm: sz.measure_cm != null ? sz.measure_cm : sz.cm,
      in: sz.measure_in != null ? sz.measure_in : sz.in,
    });
    if (!dual) return pending;
    return unit === "cm" ? dual.cmLabel : dual.inLabel;
  }

  function fillChart(sizes) {
    const table = document.getElementById("size-guide-table");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";
    const hr = document.createElement("tr");
    ["Grandeur", "Mesures (cm)", "Mesures (po)"].forEach((lab, i) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = en()
        ? ["Size", "Measurements (cm)", "Measurements (in)"][i]
        : lab;
      hr.appendChild(th);
    });
    thead.appendChild(hr);

    const list =
      Array.isArray(sizes) && sizes.length
        ? sizes
        : [{ code: "—", label_fr: "—", label_en: "—" }];
    list.forEach((sz) => {
      const tr = document.createElement("tr");
      const tdG = document.createElement("td");
      tdG.textContent = displaySizeLabel(sz);
      const tdCm = document.createElement("td");
      tdCm.textContent = chartCellForSize(sz, "cm");
      const tdIn = document.createElement("td");
      tdIn.textContent = chartCellForSize(sz, "in");
      tr.appendChild(tdG);
      tr.appendChild(tdCm);
      tr.appendChild(tdIn);
      tbody.appendChild(tr);
    });
  }

  async function open(opts) {
    const category = opts && opts.category;
    const sizes = opts && opts.sizes;
    if (!category) return;
    await ensureData();
    const catGuide = categoryGuide(category);
    if (!catGuide) return;

    ensureDialog();
    lastFocus = document.activeElement;

    const title = document.getElementById("size-guide-title");
    const how = document.getElementById("size-guide-how");
    const img = document.getElementById("size-guide-img");
    const cap = document.getElementById("size-guide-cap");
    const chartTitle = document.getElementById("size-guide-chart-title");
    const lucie = document.getElementById("size-guide-lucie");
    const closeBtn = dialog.querySelector(".size-guide-close");

    dialog.dataset.category = category;
    dialog._sizes = sizes || [];
    title.textContent = en() ? catGuide.title_en : catGuide.title_fr;
    how.textContent = en() ? catGuide.how_en : catGuide.how_fr;
    closeBtn.setAttribute("aria-label", t("Fermer", "Close"));
    chartTitle.textContent = t("Correspondance des grandeurs", "Size correspondence");
    lucie.textContent = t(
      "Aucune grille cm/po validée n’est publiée pour ces grandeurs. Les mesures exactes restent à confirmer avec Lucie.",
      "No validated cm/in chart is published for these sizes. Exact measurements remain to be confirmed with Lucie.",
    );

    const key = catGuide.illustration_key || category;
    const entry = illustrationEntry(key);
    const fig = dialog.querySelector(".size-guide-figure");
    const src = resolveIllustrationSrc(entry);
    if (src) {
      fig.hidden = false;
      img.src = src;
      img.alt = en() ? entry.alt_en || "" : entry.alt_fr || "";
      cap.textContent = en()
        ? entry.note_en || entry.alt_en || ""
        : entry.note_fr || entry.alt_fr || "";
    } else if (key === "pantoufles" || category === "mukluks") {
      const pant = illustrationEntry("pantoufles");
      const pantSrc = resolveIllustrationSrc(pant);
      if (pantSrc) {
        fig.hidden = false;
        img.src = pantSrc;
        img.alt = en() ? pant.alt_en || "" : pant.alt_fr || "";
        cap.textContent = en()
          ? "Foot diagram (shared with slippers)."
          : "Schéma du pied (partagé avec les pantoufles).";
      } else {
        fig.hidden = true;
        img.removeAttribute("src");
      }
    } else {
      fig.hidden = true;
      img.removeAttribute("src");
      img.alt = "";
      cap.textContent = "";
    }

    fillChart(sizes);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeBtn.focus();
  }

  function pageSections() {
    return (guideDoc && guideDoc.page && guideDoc.page.sections) || [];
  }

  function buildMarkersList(panel, entry) {
    const ul = document.createElement("ul");
    ul.className = "sg-page-markers";
    const fields = categoryFields(panel.category);
    const markers = (entry && entry.markers) || [];
    const rows =
      fields.length > 0
        ? fields.map((f) => ({
            n: f.diagram_number,
            label: en() ? f.label_en : f.label_fr,
            help: en() ? f.help_en : f.help_fr,
            values: f.values || f.reference || null,
          }))
        : markers.map((m) => ({
            n: m.n,
            label: en() ? m.label_en : m.label_fr,
            help: "",
            values: null,
          }));

    rows.forEach((row) => {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "sg-page-marker-head";
      if (row.n != null) {
        const badge = document.createElement("span");
        badge.className = "sg-page-marker-n";
        badge.textContent = String(row.n);
        head.appendChild(badge);
      }
      const lab = document.createElement("strong");
      lab.textContent = row.label || "";
      head.appendChild(lab);
      li.appendChild(head);
      if (row.help) {
        const help = document.createElement("p");
        help.className = "sg-page-marker-help";
        help.textContent = row.help;
        li.appendChild(help);
      }
      const dual = row.values ? formatDualValue(row.values) : null;
      if (dual) {
        const vals = document.createElement("p");
        vals.className = "sg-page-marker-values";
        vals.textContent = dual.cmLabel + " · " + dual.inLabel;
        li.appendChild(vals);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function formatInches(cm) {
    const eighths = Math.round((cm / 2.54) * 8);
    const whole = Math.floor(eighths / 8);
    const rem = eighths - whole * 8;
    const frac = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" }[rem];
    if (!frac) return String(whole);
    if (!whole) return frac;
    return whole + " " + frac;
  }

  function handSpan(pair, unit) {
    if (!pair || pair.length < 2) return "—";
    if (unit === "in") return formatInches(pair[0]) + " – " + formatInches(pair[1]);
    return pair[0] + " – " + pair[1];
  }

  function buildHandTable(captionText, cols, rows) {
    const table = document.createElement("table");
    table.className = "sg-page-hand-table";
    const caption = document.createElement("caption");
    caption.textContent = captionText;
    table.appendChild(caption);
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    cols.forEach((label) => {
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
    return table;
  }

  function renderHandGuidePanel(panel) {
    const wrap = document.createElement("div");
    wrap.className = "sg-page-panel sg-page-panel--hand";
    wrap.dataset.category = panel.category || "mitaines";

    const hg = (guideDoc.page && guideDoc.page.hand_guide) || {};
    const unit = pageState.chartUnit === "in" ? "in" : "cm";
    const unitName = unit === "in" ? t("po", "in") : "cm";

    const title = document.createElement("h3");
    title.className = "sg-page-panel-title";
    title.textContent = en() ? hg.title_en || "" : hg.title_fr || "";
    wrap.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "sg-page-how";
    sub.textContent = en() ? hg.sub_en || "" : hg.sub_fr || "";
    if (sub.textContent) wrap.appendChild(sub);

    appendUnitControls(wrap);

    const layout = document.createElement("div");
    layout.className = "sg-page-layout";

    const figure = document.createElement("figure");
    figure.className = "sg-page-figure sg-page-figure--hand";
    figure.dataset.illustrationKey = "hand_guide";
    const img = document.createElement("img");
    img.className = "sg-page-img sg-page-img--hand";
    img.src = hg.image || "assets/mesures/guide-main-schema.jpg";
    img.width = hg.image_width || 1024;
    img.height = hg.image_height || 682;
    img.decoding = "async";
    img.loading = "lazy";
    img.alt = en() ? hg.alt_en || "" : hg.alt_fr || "";
    figure.appendChild(img);
    layout.appendChild(figure);

    const side = document.createElement("div");
    side.className = "sg-page-side";
    side.appendChild(buildMarkersList(panel, null));

    const handGroups = [
      {
        key: "femme",
        label: t("Femme — S à XL", "Women — S to XL"),
        rows: hg.femme,
      },
      {
        key: "homme",
        label: t("Homme — S à XL", "Men — S to XL"),
        rows: hg.homme,
      },
      {
        key: "enfant",
        label: t("Enfant — S à XL", "Kids — S to XL"),
        rows: hg.enfant,
      },
    ];

    const accordion = document.createElement("div");
    accordion.className = "sg-page-accordion";
    const headers = [
      t("Grandeur", "Size"),
      t("Tour", "Around") + " (" + unitName + ")",
      t("Longueur", "Length") + " (" + unitName + ")",
    ];

    handGroups.forEach(function (group) {
      const rows = Array.isArray(group.rows) ? group.rows : [];
      if (!rows.length) return;

      const details = document.createElement("details");
      details.className = "sg-page-accordion-item";
      details.dataset.group = group.key;

      const summary = document.createElement("summary");
      summary.className = "sg-page-accordion-summary";
      summary.textContent = group.label;

      const body = document.createElement("div");
      body.className = "sg-page-accordion-body";
      body.appendChild(
        buildHandTable(
          "",
          headers,
          rows.map(function (row) {
            return [
              row.size,
              handSpan(row.circ, unit),
              handSpan(row.len, unit),
            ];
          }),
        ),
      );

      details.appendChild(summary);
      details.appendChild(body);
      accordion.appendChild(details);
    });

    side.appendChild(accordion);
    wireSoftAccordion(accordion);

    const advice = document.createElement("p");
    advice.className = "sg-page-hand-advice";
    advice.textContent = en() ? hg.advice_en || "" : hg.advice_fr || "";
    if (advice.textContent) side.appendChild(advice);

    layout.appendChild(side);
    wrap.appendChild(layout);
    return wrap;
  }

  function buildUnitToggle() {
    const unit = pageState.chartUnit === "in" ? "in" : "cm";
    const unitBar = document.createElement("div");
    unitBar.className = "sg-page-unit-toggle";
    unitBar.setAttribute("role", "group");
    unitBar.setAttribute("aria-label", t("Unité", "Unit"));
    ["cm", "in"].forEach((u) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sg-page-unit-btn" + (unit === u ? " is-active" : "");
      btn.textContent = u === "in" ? t("Pouces", "Inches") : t("Centimètres", "Centimetres");
      btn.setAttribute("aria-pressed", String(unit === u));
      btn.addEventListener("click", () => {
        pageState.chartUnit = u;
        renderPage();
      });
      unitBar.appendChild(btn);
    });
    return unitBar;
  }

  /** Bascule cm/po juste sous l’intro, avant le schéma + tableau. */
  function appendUnitControls(wrap) {
    wrap.appendChild(buildUnitToggle());
  }

  function formatLenCm(cm, unit) {
    if (cm == null || !Number.isFinite(Number(cm))) return "—";
    const n = Number(cm);
    if (unit === "in") return formatInches(n) + " " + t("po", "in");
    const shown = Math.round(n * 10) / 10;
    return String(shown).replace(/\.0$/, "") + " cm";
  }

  /** Soft open/close for foot pointure accordions (native <details> snaps). */
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

  function appendBodySizeChart(container, chartKey) {
    const page = guideDoc.page || {};
    const unit = pageState.chartUnit === "in" ? "in" : "cm";
    const unitName = unit === "in" ? t("po", "in") : "cm";

    if (chartKey === "foot") {
      const fg = page.foot_guide || {};
      const source = document.createElement("p");
      source.className = "sg-page-chart-source";
      source.textContent = en() ? fg.source_en || "" : fg.source_fr || "";
      if (source.textContent) container.appendChild(source);
      const system = document.createElement("p");
      system.className = "sg-page-chart-source";
      system.textContent = en() ? fg.system_en || "" : fg.system_fr || "";
      if (system.textContent) container.appendChild(system);

      const groups = [
        {
          key: "femme",
          label: t("Femme — demi-pointures", "Women — half sizes"),
          rows: fg.femme,
        },
        {
          key: "homme",
          label: t("Homme — demi-pointures", "Men — half sizes"),
          rows: fg.homme,
        },
        {
          key: "enfant",
          label: t("Enfant — pointures entières", "Kids — whole sizes only"),
          rows: fg.enfant,
        },
      ];

      const accordion = document.createElement("div");
      accordion.className = "sg-page-accordion";

      groups.forEach((group) => {
        const rows = Array.isArray(group.rows) ? group.rows : [];
        if (!rows.length) return;

        const details = document.createElement("details");
        details.className = "sg-page-accordion-item";
        details.dataset.group = group.key;

        const summary = document.createElement("summary");
        summary.className = "sg-page-accordion-summary";
        summary.textContent = group.label;

        const body = document.createElement("div");
        body.className = "sg-page-accordion-body";
        body.appendChild(
          buildHandTable(
            "",
            [
              t("Pointure", "Shoe size"),
              t("Longueur du pied", "Foot length") + " (" + unitName + ")",
            ],
            rows.map((row) => [
              row.label || String(row.pointure),
              formatLenCm(row.len_cm, unit),
            ]),
          ),
        );

        details.appendChild(summary);
        details.appendChild(body);
        accordion.appendChild(details);
      });

      container.appendChild(accordion);
      wireSoftAccordion(accordion);
      return;
    }

    if (chartKey === "head") {
      const hg = page.head_guide || {};
      const source = document.createElement("p");
      source.className = "sg-page-chart-source";
      source.textContent = en() ? hg.source_en || "" : hg.source_fr || "";
      if (source.textContent) container.appendChild(source);
      const adult = Array.isArray(hg.adult_cm) ? hg.adult_cm : [];
      container.appendChild(
        buildHandTable(
          t("Correspondance des grandeurs (adultes)", "Adult size match"),
          [
            t("Grandeur", "Size"),
            t("Tour de tête", "Head circumference") + " (" + unitName + ")",
          ],
          adult.map((row) => [row.size, handSpan(row.circ, unit)]),
        ),
      );
    }
  }

  function renderPagePanel(panel) {
    if (panel.use_hand_guide) return renderHandGuidePanel(panel);

    const wrap = document.createElement("div");
    wrap.className = "sg-page-panel";
    wrap.dataset.category = panel.category || "";

    const cat = categoryGuide(panel.category) || {};
    const key = panel.illustration_key;
    const entry = key ? illustrationEntry(key) : null;

    const title = document.createElement("h3");
    title.className = "sg-page-panel-title";
    title.textContent = en() ? cat.title_en || "" : cat.title_fr || "";
    if (title.textContent) wrap.appendChild(title);

    const how = document.createElement("p");
    how.className = "sg-page-how";
    how.textContent = en()
      ? cat.how_en || ""
      : cat.how_fr || "";
    if (how.textContent) wrap.appendChild(how);

    if (panel.size_chart === "foot" || panel.size_chart === "head") {
      appendUnitControls(wrap);
    }

    const layout = document.createElement("div");
    layout.className = "sg-page-layout";

    const figure = document.createElement("figure");
    figure.className = "sg-page-figure";
    figure.dataset.illustrationKey = key || "";

    if (panel.note_only || !key || (entry && entry.hide_diagram)) {
      figure.classList.add("is-note-only");
      const note = document.createElement("p");
      note.className = "sg-page-note-box";
      note.textContent =
        (en()
          ? (entry && entry.note_en) || cat.how_en
          : (entry && entry.note_fr) || cat.how_fr) ||
        t(
          "Mukluks : surtout formats bébé — contactez Lucie pour un adulte. Aucun schéma pied adulte pour l’instant.",
          "Mukluks: mostly baby sizes — contact Lucie for adults. No adult foot diagram for now.",
        );
      figure.appendChild(note);
    } else {
      const img = document.createElement("img");
      img.className = "sg-page-img";
      const dims =
        entry && Array.isArray(entry.verified_size_px) && entry.verified_size_px.length >= 2
          ? entry.verified_size_px
          : [1200, 703];
      img.width = dims[0];
      img.height = dims[1];
      img.decoding = "async";
      img.loading = "lazy";
      const src = resolveIllustrationSrc(entry);
      if (src) {
        img.src = src;
        img.alt = en() ? entry.alt_en || "" : entry.alt_fr || "";
      } else {
        figure.classList.add("is-missing");
        img.alt = t("Illustration à venir", "Illustration coming soon");
      }
      figure.appendChild(img);
      if (panel.size_chart !== "foot" && panel.size_chart !== "head") {
        const cap = document.createElement("figcaption");
        cap.className = "sg-page-cap";
        const markers = (entry && entry.markers) || [];
        const legend = markers
          .map((m) => {
            const lab = en() ? m.label_en : m.label_fr;
            return m.n != null ? m.n + " · " + lab : lab;
          })
          .filter(Boolean)
          .join(" · ");
        cap.textContent =
          legend ||
          (en() ? entry && entry.alt_en : entry && entry.alt_fr) ||
          "";
        if (cap.textContent) figure.appendChild(cap);
      }
    }

    const side = document.createElement("div");
    side.className = "sg-page-side";
    const sideTitle = document.createElement("h3");
    sideTitle.textContent = t("Repères de mesure", "Measurement landmarks");
    side.appendChild(sideTitle);
    side.appendChild(buildMarkersList(panel, entry));

    if (panel.size_chart === "foot" || panel.size_chart === "head") {
      const chartTitle = document.createElement("h3");
      chartTitle.className = "sg-page-chart-title";
      chartTitle.textContent = t("Tableau des grandeurs", "Size chart");
      side.appendChild(chartTitle);
      appendBodySizeChart(side, panel.size_chart);
    }

    const asideNote = en() ? panel.aside_note_en || "" : panel.aside_note_fr || "";
    if (asideNote) {
      const aside = document.createElement("p");
      aside.className = "sg-page-aside-note";
      aside.textContent = asideNote;
      side.appendChild(aside);
    }

    layout.appendChild(figure);
    layout.appendChild(side);
    wrap.appendChild(layout);
    return wrap;
  }

  function renderPage() {
    if (!pageRoot || !guideDoc || !guideDoc.page) return;
    const page = guideDoc.page;
    const sections = pageSections();
    if (!sections.length) return;

    if (!pageState.sectionId) pageState.sectionId = sections[0].id;
    let section = sections.find((s) => s.id === pageState.sectionId) || sections[0];
    pageState.sectionId = section.id;
    if (pageState.panelIndex >= (section.panels || []).length) pageState.panelIndex = 0;

    pageRoot.innerHTML = "";

    const shell = document.createElement("details");
    shell.className = "sg-page-shell";
    shell.open = !!pageState.shellOpen;
    shell.addEventListener("toggle", () => {
      pageState.shellOpen = shell.open;
      pageRoot.classList.toggle("is-shell-open", shell.open);
      syncHint();
    });
    pageRoot.classList.toggle("is-shell-open", shell.open);

    const summary = document.createElement("summary");
    summary.className = "sg-page-shell-summary";
    const h2 = document.createElement("h2");
    h2.id = "guide-tailles-title";
    h2.textContent = en() ? page.title_en : page.title_fr;
    summary.appendChild(h2);
    const hint = document.createElement("span");
    hint.className = "sg-page-shell-hint";
    function syncHint() {
      hint.textContent = shell.open
        ? t("Masquer", "Hide")
        : t("Afficher le guide", "Show size guide");
    }
    syncHint();
    summary.appendChild(hint);
    shell.appendChild(summary);

    const body = document.createElement("div");
    body.className = "sg-page-shell-body";

    const inner = document.createElement("div");
    inner.className = "sg-page-inner";

    const introText = en() ? page.intro_en || "" : page.intro_fr || "";
    if (introText) {
      const intro = document.createElement("p");
      intro.className = "sg-page-intro";
      intro.textContent = introText;
      inner.appendChild(intro);
    }

    const nav = document.createElement("div");
    nav.className = "sg-page-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", t("Parties du corps", "Body areas"));
    sections.forEach((sec) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "sg-page-nav-btn" + (sec.id === pageState.sectionId ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(sec.id === pageState.sectionId));
      btn.dataset.sectionId = sec.id;
      btn.textContent = en() ? sec.label_en : sec.label_fr;
      btn.addEventListener("click", () => {
        pageState.sectionId = sec.id;
        pageState.panelIndex = 0;
        renderPage();
      });
      nav.appendChild(btn);
    });
    inner.appendChild(nav);

    section = sections.find((s) => s.id === pageState.sectionId) || sections[0];
    const panels = section.panels || [];
    if (panels.length > 1) {
      const sub = document.createElement("div");
      sub.className = "sg-page-subnav";
      sub.setAttribute("role", "tablist");
      panels.forEach((panel, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "sg-page-subnav-btn" + (idx === pageState.panelIndex ? " is-active" : "");
        btn.setAttribute("aria-selected", String(idx === pageState.panelIndex));
        btn.textContent = en() ? panel.tab_en : panel.tab_fr;
        btn.addEventListener("click", () => {
          pageState.panelIndex = idx;
          renderPage();
        });
        sub.appendChild(btn);
      });
      inner.appendChild(sub);
    }

    const panel = panels[pageState.panelIndex] || panels[0];
    if (panel) inner.appendChild(renderPagePanel(panel));

    body.appendChild(inner);
    shell.appendChild(body);
    pageRoot.appendChild(shell);
  }

  async function mountPage(root) {
    pageRoot = root;
    await ensureData();
    if (!guideDoc || !guideDoc.page) return;
    renderPage();
  }

  window.BOREALES_SIZE_GUIDE = {
    open,
    close,
    hasCategory(cat) {
      return !!(guideDoc && guideDoc.categories && guideDoc.categories[cat]);
    },
    preload: ensureData,
    mountPage,
    refreshPage: renderPage,
  };

  function boot() {
    const mount = document.querySelector("[data-size-guide-page]");
    if (mount) {
      mountPage(mount).catch(() => {});
    } else if (document.querySelector(".shop-products")) {
      ensureData().catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("boreales-lang-changed", () => {
    if (dialog && dialog.open && dialog.dataset.category) {
      open({
        category: dialog.dataset.category,
        sizes: dialog._sizes || null,
      });
    }
    if (pageRoot) renderPage();
  });
})();
