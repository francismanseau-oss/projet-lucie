(() => {
  "use strict";

  const GUIDE_URL = "catalog/size-guide.json";
  const ILLUSTRATIONS_URL = "catalog/sur-mesure-illustrations.json";

  let guideDoc = null;
  let illusDoc = null;
  let loadPromise = null;
  let dialog = null;
  let lastFocus = null;

  const en = () => document.documentElement.lang.startsWith("en");

  function t(fr, enText) {
    return en() ? enText : fr;
  }

  async function ensureData() {
    if (guideDoc && illusDoc) return;
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(GUIDE_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(ILLUSTRATIONS_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([g, i]) => {
      guideDoc = g;
      illusDoc = i;
    });
    return loadPromise;
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

    const list = Array.isArray(sizes) && sizes.length ? sizes : [{ code: "—", label_fr: "—", label_en: "—" }];
    list.forEach((sz) => {
      const tr = document.createElement("tr");
      const tdG = document.createElement("td");
      tdG.textContent = displaySizeLabel(sz);
      const pending = t("À confirmer avec Lucie", "To confirm with Lucie");
      const tdCm = document.createElement("td");
      tdCm.textContent = pending;
      const tdIn = document.createElement("td");
      tdIn.textContent = pending;
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
    const catGuide = guideDoc && guideDoc.categories && guideDoc.categories[category];
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
    const entry = illusDoc && illusDoc.categories && illusDoc.categories[key];
    const fig = dialog.querySelector(".size-guide-figure");
    if (entry && entry.files && (entry.files.fr || entry.files.en) && !entry.hide_diagram) {
      fig.hidden = false;
      const src = en() ? entry.files.en || entry.files.fr : entry.files.fr || entry.files.en;
      img.src = src;
      img.alt = en() ? entry.alt_en || "" : entry.alt_fr || "";
      cap.textContent = en()
        ? entry.note_en || entry.alt_en || ""
        : entry.note_fr || entry.alt_fr || "";
    } else if (key === "pantoufles" || category === "mukluks") {
      // mukluks : réutiliser schéma pied pantoufles (fichiers réels)
      const pant = illusDoc && illusDoc.categories && illusDoc.categories.pantoufles;
      if (pant && pant.files) {
        fig.hidden = false;
        img.src = en() ? pant.files.en || pant.files.fr : pant.files.fr || pant.files.en;
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

  window.BOREALES_SIZE_GUIDE = {
    open,
    close,
    hasCategory(cat) {
      return !!(guideDoc && guideDoc.categories && guideDoc.categories[cat]);
    },
    preload: ensureData,
  };

  // Précharge discret sur boutique
  if (document.querySelector(".shop-products")) {
    ensureData().catch(() => {});
  }

  window.addEventListener("boreales-lang-changed", () => {
    if (dialog && dialog.open && dialog.dataset.category) {
      open({
        category: dialog.dataset.category,
        sizes: dialog._sizes || null,
      });
    }
  });
})();
