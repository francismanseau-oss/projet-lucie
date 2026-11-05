(() => {
  "use strict";

  const chooser = document.getElementById("cp-chooser");
  const panelMesure = document.getElementById("cp-panel-mesure");
  const panelIdee = document.getElementById("cp-panel-idee");
  const hero = document.getElementById("cp-hero");
  if (!chooser || !panelMesure || !panelIdee) return;

  const eng = () => document.documentElement.lang.startsWith("en");

  function readChoice() {
    const q = new URLSearchParams(location.search).get("choix");
    if (q === "mesure" || q === "idee") return q;
    let h = (location.hash || "").replace(/^#/, "");
    if (h.startsWith("choix=")) h = h.slice(6);
    if (h === "mesure" || h === "idee") return h;
    return null;
  }

  function setChoice(choice, pushHash) {
    const isMesure = choice === "mesure";
    const isIdee = choice === "idee";
    const showForm = isMesure || isIdee;

    chooser.hidden = showForm;
    if (hero) hero.hidden = showForm;
    panelMesure.hidden = !isMesure;
    panelIdee.hidden = !isIdee;

    // Hash survit aux redirections de serve (qui enlèvent souvent ?choix=)
    const path = location.pathname;
    const next = showForm ? path + "#" + choice : path;
    if (pushHash === false) {
      history.replaceState({}, "", next);
    } else if (location.pathname + location.hash !== next && location.href.replace(/#.*$/, "") + (showForm ? "#" + choice : "") !== location.origin + next) {
      history.replaceState({}, "", next);
    } else {
      history.replaceState({}, "", next);
    }

    if (isMesure) {
      panelMesure.querySelector(".cp-back")?.focus({ preventScroll: true });
      // Amener l’étape produits à l’écran (évite l’impression de grille vide sous les filtres)
      requestAnimationFrame(() => {
        document.getElementById("sm-step-1")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else if (isIdee) {
      panelIdee.querySelector(".cp-back")?.focus({ preventScroll: true });
    }
  }

  document.getElementById("cp-choose-mesure")?.addEventListener("click", () => setChoice("mesure"));
  document.getElementById("cp-choose-idee")?.addEventListener("click", () => setChoice("idee"));
  document.querySelectorAll("[data-cp-back]").forEach((btn) => {
    btn.addEventListener("click", () => setChoice(null));
  });

  window.addEventListener("hashchange", () => {
    setChoice(readChoice(), false);
  });

  setChoice(readChoice(), false);

  window.__CP_HUB__ = { setChoice, readChoice, eng };
})();
