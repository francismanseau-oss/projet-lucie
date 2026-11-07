import {
  auditActionLabelFr,
  categoryLabelFr,
  filterItems,
  qtyDisplayLabel,
  stockStatusLabelFr,
} from "/lib/ui-helpers.js";

const TOKEN_KEY = "inv_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
let items = [];
let audienceFilter = "tous";
let categoryFilter = "";
let categories = [];
let nameById = new Map();
let toastTimer = null;
let resetToken = "";

const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const changeView = $("change-view");
const forgotView = $("forgot-view");
const resetView = $("reset-view");
const appView = $("app-view");
const banner = $("banner");
const listEl = $("list");
const emptyEl = $("empty");
const summaryEl = $("summary");
const alertsBar = $("alerts-bar");
const dlgAudit = $("dlg-audit");
const toastEl = $("toast");
const mainNav = $("main-nav");

function hideAllAuth() {
  loginView.hidden = true;
  changeView.hidden = true;
  forgotView.hidden = true;
  resetView.hidden = true;
  appView.hidden = true;
  if (mainNav) mainNav.hidden = true;
}

function showLogin() {
  hideAllAuth();
  loginView.hidden = false;
}

function showChange(forced) {
  hideAllAuth();
  changeView.hidden = false;
  const cancel = $("btn-change-cancel");
  if (cancel) cancel.hidden = !!forced;
  const title = $("change-title");
  const hint = $("change-hint");
  if (title && hint) {
    if (forced) {
      title.textContent = "Choisissez votre mot de passe";
      hint.textContent = "C’est votre première connexion. Le mot de passe temporaire ne servira plus après.";
    } else {
      title.textContent = "Changer le mot de passe";
      hint.textContent = "Facultatif pendant les essais. Le mot de passe actuel reste valide tant qu’un nouveau n’est pas enregistré.";
    }
  }
}

function showForgot() {
  hideAllAuth();
  forgotView.hidden = false;
}

function showReset() {
  hideAllAuth();
  resetView.hidden = false;
}

function showApp() {
  hideAllAuth();
  appView.hidden = false;
  if (mainNav) mainNav.hidden = false;
}

function storeToken(t, remember) {
  token = t || "";
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  if (remember) localStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.setItem(TOKEN_KEY, token);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function badge(item) {
  if (item.skip_inventory) return { cls: "ok", text: "Sur mesure seulement" };
  if (item.qty_on_hand == null) return { cls: "unk", text: "À confirmer" };
  if (item.out_of_stock || item.qty_on_hand === 0) return { cls: "out", text: "Rupture de stock" };
  if (item.below_min) return { cls: "warn", text: "Stock bas" };
  return { cls: "ok", text: "En stock" };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, ok = true) {
  if (!toastEl) return;
  toastEl.hidden = false;
  toastEl.className = ok ? "toast toast-ok" : "toast toast-err";
  toastEl.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function renderSummary(summary, units) {
  const out = summary.out_of_stock_count || 0;
  summaryEl.innerHTML = `
    <strong>${summary.total} produits</strong>
    <span>${units ?? "—"} exemplaires · ${summary.low_stock_count} alerte(s)${
      out ? ` · ${out} rupture(s)` : ""
    }</span>
  `;
  const stockItems = (items || []).filter((it) => !it.skip_inventory);
  const lowItems = stockItems.filter((it) => it.below_min && !it.out_of_stock);
  const outItems = stockItems.filter((it) => it.out_of_stock || it.qty_on_hand === 0);
  if (lowItems.length || outItems.length) {
    alertsBar.hidden = false;
    const listHtml = (arr) =>
      `<ul class="alerts-names">${arr
        .map((it) => `<li>${escapeHtml(displayTitle(it))}</li>`)
        .join("")}</ul>`;
    const summaryBits = [];
    if (lowItems.length) summaryBits.push(`${lowItems.length} sous l’objectif`);
    if (outItems.length) summaryBits.push(`${outItems.length} en rupture`);
    const blocks = [];
    if (lowItems.length) {
      blocks.push(
        `<div class="alerts-block"><p class="alerts-label">${lowItems.length} sous l’objectif minimum</p>${listHtml(lowItems)}</div>`,
      );
    }
    if (outItems.length) {
      blocks.push(
        `<div class="alerts-block"><p class="alerts-label">${outItems.length} en rupture de stock</p>${listHtml(outItems)}</div>`,
      );
    }
    alertsBar.innerHTML = `<details class="alerts-acc">
      <summary class="alerts-acc-summary">${escapeHtml(summaryBits.join(" · "))}</summary>
      <div class="alerts-acc-body">${blocks.join("")}</div>
    </details>`;
  } else {
    alertsBar.hidden = true;
    alertsBar.innerHTML = "";
  }
}

function fillCategories() {
  const box = $("category");
  if (!box) return;
  box.innerHTML = "";
  const make = (value, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-filter" + (categoryFilter === value ? " is-on" : "");
    b.dataset.filterCat = value;
    b.textContent = label;
    box.appendChild(b);
  };
  make("", "Tous les produits");
  for (const c of categories) make(c, categoryLabelFr(c));
}

function currentStockNumber(it) {
  if (it.qty_on_hand == null) return 0;
  const n = Math.floor(Number(it.qty_on_hand));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sizeQtyNumber(s) {
  if (!s || s.qty_on_hand == null) return 0;
  const n = Math.floor(Number(s.qty_on_hand));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Titre affiché seulement : enlève les marques de taille du libellé
 * (M, L, M-L, L-XL…) sans modifier les données enregistrées.
 */
function displayNameWithoutSize(nameFr) {
  let name = String(nameFr || "").trim();
  // « Chapeau dame M-L — … » / « … M / L … »
  name = name.replace(/\b(?:P|M|G|TG|S|L|XL|XXL|M-L|L-XL|S-M)\b/gi, " ");
  // Pas de tirets dans le titre affiché (raccourcit, plus lisible)
  name = name.replace(/\s*[–—−‐-]\s*/g, " ");
  name = name.replace(/\s{2,}/g, " ");
  name = name.replace(/^\s*[,:;/]\s*|\s*[,:;/]\s*$/g, "");
  return name.trim() || String(nameFr || "").trim();
}

/** Titre affiché : N° + nom (sans taille ni tirets). */
function displayTitle(it) {
  const name = displayNameWithoutSize(it.name_fr || it.product_id || "");
  if (it.product_number != null && it.product_number !== "") {
    return `N° ${it.product_number} ${name}`;
  }
  return name;
}

const SIZE_GROUP_FR = { homme: "Homme", femme: "Femme", enfant: "Enfant" };

function sizeGroupInfo(s, sizeGroups) {
  const fromList = Array.isArray(sizeGroups)
    ? sizeGroups.find((g) => g.id === s.group)
    : null;
  if (fromList) return { id: fromList.id, label: fromList.label_fr || fromList.id };
  if (s.group && SIZE_GROUP_FR[s.group]) return { id: s.group, label: SIZE_GROUP_FR[s.group] };
  const code = String(s.code || "");
  if (/^H-/i.test(code)) return { id: "homme", label: "Homme" };
  if (/^F-/i.test(code)) return { id: "femme", label: "Femme" };
  if (/^E-/i.test(code)) return { id: "enfant", label: "Enfant" };
  return null;
}

function isHalfPointure(s) {
  const code = String(s.code || "");
  const label = String(s.label_fr || "");
  return /\.5\b/.test(code) || /½/.test(label) || /1\/2/.test(label);
}

/** Semelles : pointure seule dans l’accordéon (le titre dit déjà Homme/Femme/Enfant). */
function displaySizeLabel(s, groupInfo, shortInAccordion) {
  const code = String(s.code || "");
  const m = code.match(/^[HFE]-([\d.]+)$/i);
  if (m) {
    const n = String(m[1]).replace(/\.5$/, "½");
    if (shortInAccordion) return n;
    if (groupInfo?.label) return `${groupInfo.label} ${n}`;
  }
  return s.label_fr || s.code;
}

function renderSizeRow(s, sizeGroups, shortLabel) {
  const qNum = sizeQtyNumber(s);
  const q = s.qty_on_hand == null ? "—" : String(qNum);
  const sold = qNum === 0 ? " is-sold" : "";
  const groupInfo = sizeGroupInfo(s, sizeGroups);
  const half = isHalfPointure(s) ? " is-half" : "";
  const label = displaySizeLabel(s, groupInfo, shortLabel);
  return `<div class="size-row${sold}${half}" data-size="${escapeHtml(s.code)}">
    <span class="size-code"><b>${escapeHtml(label)}</b></span>
    <span class="size-qty">${escapeHtml(q)}</span>
    <div class="size-steps">
      <button type="button" class="btn btn-step" data-act="size-minus" data-size="${escapeHtml(s.code)}" aria-label="Retirer un ${escapeHtml(label)}"${qNum <= 0 ? " disabled" : ""}>−</button>
      <button type="button" class="btn btn-step" data-act="size-plus" data-size="${escapeHtml(s.code)}" aria-label="Ajouter un ${escapeHtml(label)}">+</button>
    </div>
  </div>`;
}

function renderSizesBlock(it) {
  const sizes = Array.isArray(it.sizes) ? it.sizes : [];
  if (!sizes.length) return "";
  const sizeGroups = it.size_groups || null;
  const total = currentStockNumber(it);

  const buckets = { femme: [], homme: [], enfant: [], other: [] };
  for (const s of sizes) {
    const g = sizeGroupInfo(s, sizeGroups);
    if (g?.id === "femme") buckets.femme.push(s);
    else if (g?.id === "homme") buckets.homme.push(s);
    else if (g?.id === "enfant") buckets.enfant.push(s);
    else buckets.other.push(s);
  }

  const hasAudienceGroups =
    buckets.femme.length + buckets.homme.length + buckets.enfant.length > 0;

  if (hasAudienceGroups) {
    // Ordre demandé : Femme → Homme → Enfant
    const order = [
      { id: "femme", label: "Femme", list: buckets.femme },
      { id: "homme", label: "Homme", list: buckets.homme },
      { id: "enfant", label: "Enfant", list: buckets.enfant },
    ];
    const accordions = order
      .filter((g) => g.list.length)
      .map((g, idx) => {
        const subtotal = g.list.reduce((n, s) => n + sizeQtyNumber(s), 0);
        const openAttr = idx === 0 ? " open" : "";
        const rows = g.list.map((s) => renderSizeRow(s, sizeGroups, true)).join("");
        return `<details class="size-acc"${openAttr}>
          <summary class="size-acc-summary">${escapeHtml(g.label)} <span class="size-acc-count">${subtotal} en stock</span></summary>
          <div class="size-acc-body">${rows}</div>
        </details>`;
      })
      .join("");
    const otherRows = buckets.other.map((s) => renderSizeRow(s, sizeGroups, false)).join("");
    return `<div class="sizes-panel sizes-panel--acc" data-sizes>
      ${accordions}
      ${otherRows}
      <p class="stock-total">Total : <b>${total}</b> en stock</p>
    </div>`;
  }

  const rows = sizes.map((s) => renderSizeRow(s, sizeGroups, false)).join("");
  return `<div class="sizes-panel" data-sizes>
    ${rows}
    <p class="stock-total">Total : <b>${total}</b> en stock</p>
  </div>`;
}

function renderSimpleQty(it) {
  const stock = currentStockNumber(it);
  const qtyLabel = qtyDisplayLabel(it.qty_on_hand);
  const status = stockStatusLabelFr(it);
  const shown = status === "Rupture de stock" ? "0" : qtyLabel;
  return `<div class="qty-panel qty-panel--simple">
    <button type="button" class="btn btn-step" data-act="minus" aria-label="Retirer un exemplaire"${stock <= 0 ? " disabled" : ""}>−</button>
    <div class="qty-simple-mid">
      <span class="qty-live">${escapeHtml(shown)}</span>
      <span class="stock-total">Total : <b>${stock}</b> en stock</span>
    </div>
    <button type="button" class="btn btn-step" data-act="plus" aria-label="Ajouter un exemplaire">+</button>
  </div>`;
}

function renderList() {
  const rows = filterItems(items, {
    search: $("search").value,
    category: categoryFilter,
    audience: audienceFilter,
    onlyAlerts: $("only-alerts").checked,
  });
  emptyEl.hidden = rows.length > 0;
  listEl.innerHTML = rows
    .map((it) => {
      const b = badge(it);
      const alertClass = it.below_min || it.out_of_stock ? " is-alert" : "";
      const stock = currentStockNumber(it);
      const hasSizes = Array.isArray(it.sizes) && it.sizes.length > 0;
      return `<article class="product-card${alertClass}" role="listitem" data-id="${escapeHtml(it.product_id)}" data-qty="${stock}">
        <div class="body">
          <span class="badge ${b.cls}">${b.text}</span>
          <h3 class="name">${escapeHtml(displayTitle(it))}</h3>
          ${hasSizes ? renderSizesBlock(it) : renderSimpleQty(it)}
        </div>
      </article>`;
    })
    .join("");
}

async function refresh() {
  const data = await api("/api/inventory");
  items = data.items || [];
  categories = data.categories || [];
  nameById = new Map(items.map((i) => [i.product_id, i.name_fr]));
  if (data.warning_fr) {
    banner.hidden = false;
    banner.textContent = data.warning_fr;
  }
  renderSummary(data.summary, data.units_on_hand);
  fillCategories();
  renderList();
}

const busyIds = new Set();

async function withBusy(id, btn, fn) {
  if (busyIds.has(id)) return;
  busyIds.add(id);
  if (btn) {
    btn.disabled = true;
    btn.dataset.busy = "1";
  }
  try {
    await fn();
  } finally {
    busyIds.delete(id);
    if (btn) {
      btn.disabled = false;
      delete btn.dataset.busy;
    }
  }
}

async function adjust(id, delta, btn, sizeCode) {
  const it = items.find((i) => i.product_id === id);
  if (!it) return;
  let expected = it.qty_on_hand;
  let current = currentStockNumber(it);
  if (sizeCode && Array.isArray(it.sizes)) {
    const sz = it.sizes.find((s) => s.code === sizeCode);
    expected = sz ? sz.qty_on_hand : expected;
    current = sizeQtyNumber(sz);
  }
  if (delta < 0 && current <= 0) {
    showToast("Impossible : la quantité ne peut pas être négative.", false);
    return;
  }
  await withBusy(id + (sizeCode ? "|" + sizeCode : ""), btn, async () => {
    try {
      const body = {
        delta,
        confirm: true,
        expected_qty: expected,
      };
      if (sizeCode) body.size_code = sizeCode;
      const data = await api(`/api/inventory/${encodeURIComponent(id)}/adjust`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast(data.message_fr || "Enregistré.");
      await refresh();
    } catch (err) {
      showToast(err.message, false);
      if (err.status === 409) await refresh();
    }
  });
}

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn || btn.disabled) return;
  const card = btn.closest("[data-id]");
  if (!card) return;
  const id = card.dataset.id;
  if (btn.dataset.act === "plus") adjust(id, 1, btn);
  if (btn.dataset.act === "minus") adjust(id, -1, btn);
  if (btn.dataset.act === "size-plus") adjust(id, 1, btn, btn.dataset.size);
  if (btn.dataset.act === "size-minus") adjust(id, -1, btn, btn.dataset.size);
});

/** Un seul accordéon ouvert à la fois (Femme / Homme / Enfant). */
listEl.addEventListener("toggle", (e) => {
  const opened = e.target;
  if (!(opened instanceof HTMLDetailsElement) || !opened.classList.contains("size-acc")) return;
  if (!opened.open) return;
  const panel = opened.closest(".sizes-panel");
  if (!panel) return;
  panel.querySelectorAll("details.size-acc").forEach((other) => {
    if (other !== opened) other.open = false;
  });
}, true);

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").hidden = true;
  try {
    const remember = $("remember").checked;
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: $("password").value, remember }),
    });
    storeToken(data.token, remember && !data.must_change_password);
    $("password").value = "";
    if (data.must_change_password) {
      showChange(true);
      showToast("Choisissez maintenant votre propre mot de passe.");
      return;
    }
    showApp();
    await refresh();
  } catch (err) {
    $("login-error").hidden = false;
    $("login-error").textContent = err.message;
  }
});

$("btn-open-change").addEventListener("click", () => showChange(false));

$("btn-change-cancel").addEventListener("click", () => {
  $("change-error").hidden = true;
  $("cur-password").value = "";
  $("new-password").value = "";
  $("new-password2").value = "";
  showApp();
});

$("btn-change").addEventListener("click", async () => {
  $("change-error").hidden = true;
  try {
    const data = await api("/api/password/change", {
      method: "POST",
      body: JSON.stringify({
        current_password: $("cur-password").value,
        new_password: $("new-password").value,
        confirm_password: $("new-password2").value,
      }),
    });
    $("cur-password").value = "";
    $("new-password").value = "";
    $("new-password2").value = "";
    showToast(data.message_fr || "Mot de passe enregistré.");
    showApp();
    await refresh();
  } catch (err) {
    $("change-error").hidden = false;
    $("change-error").textContent = err.message;
  }
});

$("btn-forgot").addEventListener("click", () => {
  $("forgot-msg").hidden = true;
  $("forgot-error").hidden = true;
  showForgot();
});

$("btn-forgot-back").addEventListener("click", () => showLogin());

$("btn-forgot-send").addEventListener("click", async () => {
  $("forgot-error").hidden = true;
  $("forgot-msg").hidden = true;
  try {
    const data = await api("/api/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email: $("forgot-email").value }),
    });
    $("forgot-msg").hidden = false;
    $("forgot-msg").textContent =
      data.message_fr ||
      "Si cette adresse est enregistrée, un lien a été préparé (essai local).";
  } catch (err) {
    $("forgot-error").hidden = false;
    $("forgot-error").textContent = err.message;
  }
});

$("btn-reset").addEventListener("click", async () => {
  $("reset-error").hidden = true;
  try {
    await api("/api/password/reset", {
      method: "POST",
      body: JSON.stringify({
        token: resetToken,
        new_password: $("reset-password").value,
        confirm_password: $("reset-password2").value,
      }),
    });
    showToast("Mot de passe mis à jour. Connectez-vous.");
    history.replaceState(null, "", location.pathname);
    showLogin();
  } catch (err) {
    $("reset-error").hidden = false;
    $("reset-error").textContent = err.message;
  }
});

$("btn-logout")?.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  }
  storeToken("", false);
  items = [];
  listEl.innerHTML = "";
  showLogin();
  $("password").value = "";
});

$("search").addEventListener("input", renderList);
$("audience-filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter-aud]");
  if (!btn) return;
  audienceFilter = btn.dataset.filterAud || "tous";
  $("audience-filters").querySelectorAll("[data-filter-aud]").forEach((el) => {
    el.classList.toggle("is-on", el === btn);
  });
  renderList();
});
$("category").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter-cat]");
  if (!btn) return;
  categoryFilter = btn.dataset.filterCat || "";
  $("category").querySelectorAll("[data-filter-cat]").forEach((el) => {
    el.classList.toggle("is-on", el === btn);
  });
  renderList();
});
$("only-alerts").addEventListener("change", renderList);

$("btn-audit").addEventListener("click", async () => {
  try {
    const data = await api("/api/audit?limit=40");
    const ul = $("audit-list");
    ul.innerHTML =
      (data.entries || [])
        .map((e) => {
          const when = new Date(e.at).toLocaleString("fr-CA");
          const name = nameById.get(e.product_id) || "Produit";
          const action = auditActionLabelFr(e.action);
          const before =
            e.before?.qty_on_hand != null
              ? String(e.before.qty_on_hand)
              : e.before?.qty_on_hand === null
                ? "—"
                : "";
          const after =
            e.after?.qty_on_hand != null
              ? String(e.after.qty_on_hand)
              : e.after?.qty_on_hand === null
                ? "—"
                : "";
          let detail = "";
          if (e.after?.added != null) {
            detail = ` · ${before} +${e.after.added} → ${after}`;
          } else if (e.after?.corrected_by != null) {
            detail = ` · ${before} → ${after} (corrigé)`;
          } else if (before !== "" && after !== "") {
            detail = ` · ${before} → ${after}`;
          } else if (e.note) {
            detail = ` · ${e.note}`;
          }
          return `<li><strong>${escapeHtml(action)}</strong> · ${escapeHtml(name)}${escapeHtml(detail)}<br>${escapeHtml(when)}</li>`;
        })
        .join("") || "<li>Aucun changement pour l’instant.</li>";
    dlgAudit.showModal();
  } catch (err) {
    showToast(err.message, false);
  }
});

(async () => {
  const hash = location.hash || "";
  const m = hash.match(/reset=([a-f0-9]{32,})/i);
  if (m) {
    resetToken = m[1];
    showReset();
    return;
  }
  if (!token) {
    showLogin();
    return;
  }
  try {
    showApp();
    await refresh();
  } catch (err) {
    if (err.status === 403) {
      showChange(true);
      return;
    }
    storeToken("", false);
    showLogin();
  }
})();
