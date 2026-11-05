/**
 * Affichage bilingue du panier — ids / prix / configs inchangés.
 */
(function (root) {
  "use strict";

  function eng() {
    return document.documentElement.lang.startsWith("en");
  }

  function sizeDisplay(item) {
    if (!item || !item.size) return "";
    const api = root.BOREALES_PRODUCT_SIZES;
    if (api && api.sizeLabel) return api.sizeLabel(item);
    if (eng()) return item.size_label_en || item.size_label_fr || item.size;
    return item.size_label_fr || item.size_label_en || item.size;
  }

  function itemTitle(item) {
    if (!item) return "";
    let title = eng()
      ? item.name_en || item.name || item.name_fr || ""
      : item.name_fr || item.name || item.name_en || "";
    const sizeLab = sizeDisplay(item);
    if (
      sizeLab &&
      item.size &&
      item.size !== "unique" &&
      !String(title).includes(String(sizeLab))
    ) {
      title = title + " — " + sizeLab;
    }
    return title;
  }

  function measureLabel(cfg, fieldId) {
    const lab = cfg?.measurement_labels?.[fieldId];
    if (lab) return eng() ? lab.en || lab.fr : lab.fr || lab.en;
    return fieldId;
  }

  function customDetailBits(cfg) {
    if (!cfg) return [];
    const bits = [];
    if (cfg.unit) {
      bits.push(
        (eng() ? "Unit: " : "Unité : ") +
          (cfg.unit === "in" ? (eng() ? "inches" : "pouces") : "cm"),
      );
    }
    if (cfg.measurements) {
      const m = Object.entries(cfg.measurements)
        .filter(([, v]) => v !== "" && v != null)
        .map(
          ([k, v]) =>
            measureLabel(cfg, k) +
            ": " +
            v +
            (cfg.unit === "in" ? (eng() ? " in" : " po") : " cm"),
        );
      if (m.length) bits.push(m.join(" · "));
    }
    if (cfg.raynaud) bits.push(eng() ? "Raynaud: yes (no charge)" : "Raynaud : oui (sans frais)");
    if (cfg.leather) {
      bits.push(
        (eng() ? "Leather: " : "Cuir : ") +
          (cfg.leather === "noir" ? (eng() ? "black" : "noir") : cfg.leather),
      );
    }
    if (cfg.comments) bits.push((eng() ? "Notes: " : "Notes : ") + cfg.comments);
    return bits;
  }

  root.BOREALES_CART_I18N = { itemTitle, customDetailBits, measureLabel, eng, sizeDisplay };
})(typeof window !== "undefined" ? window : globalThis);
