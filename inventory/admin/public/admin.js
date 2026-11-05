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

function showChange() {
  hideAllAuth();
  changeView.hidden = false;
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
  // Jeton opaque seulement — jamais le mot de passe. localStorage = « rester connecté » côté UI ;
  // le cookie HttpOnly est aussi posé par le serveur.
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

function photoUrl(imagePath) {
  if (!imagePath) return "";
  if (imagePath.startsWith("assets/")) return `/${imagePath}`;
  if (imagePath.startsWith("/assets/")) return imagePath;
  return `/assets/${imagePath.replace(/^\/+/, "")}`;
}

function badge(item) {
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
  if (summary.low_stock_count > 0 || out > 0) {
    alertsBar.hidden = false;
    const parts = [];
    if (summary.low_stock_count > 0) {
      parts.push(`${summary.low_stock_count} produit(s) sous l’objectif minimum`);
    }
    if (out > 0) parts.push(`${out} en rupture de stock`);
    alertsBar.textContent = parts.join(" · ") + ".";
  } else {
    alertsBar.hidden = true;
  }
}

function fillCategories() {
  const sel = $("category");
  const prev = sel.value;
  sel.innerHTML = `<option value="">Toutes les catégories</option>`;
  for (const c of categories) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = categoryLabelFr(c);
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function currentStockNumber(it) {
  if (it.qty_on_hand == null) return 0;
  const n = Math.floor(Number(it.qty_on_hand));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function renderSizesBlock(it) {
  const sizes = Array.isArray(it.sizes) ? it.sizes : [];
  if (!sizes.length) return "";
  const multi = sizes.length > 1 || it.size_selector;
  const rows = sizes
    .map((s) => {
      const q = s.qty_on_hand == null ? "—" : String(s.qty_on_hand);
      const sold = s.qty_on_hand === 0 ? " is-sold" : "";
      return `<div class="size-row${sold}" data-size="${escapeHtml(s.code)}">
        <span class="size-code"><b>${escapeHtml(s.label_fr || s.code)}</b>${multi ? ` <small>(${escapeHtml(s.code)})</small>` : ""}</span>
        <span class="size-qty">${escapeHtml(q)}</span>
        <div class="size-steps">
          <button type="button" class="btn btn-step" data-act="size-minus" data-size="${escapeHtml(s.code)}" aria-label="Retirer un ${escapeHtml(s.code)}">−</button>
          <button type="button" class="btn btn-step" data-act="size-plus" data-size="${escapeHtml(s.code)}" aria-label="Ajouter un ${escapeHtml(s.code)}">+</button>
        </div>
        ${
          multi
            ? `<button type="button" class="btn btn-ghost btn-xs" data-act="size-remove" data-size="${escapeHtml(s.code)}">Retirer taille</button>`
            : ""
        }
      </div>`;
    })
    .join("");
  return `<div class="sizes-panel" data-sizes>
    <div class="sizes-head">Tailles / formats ${it.size_selector ? "(sélecteur boutique actif)" : "(sans sélecteur)"}</div>
    ${rows}
    <div class="size-add">
      <input class="add-input size-code-input" type="text" placeholder="Code (ex. M)" data-act="new-size-code" aria-label="Code taille">
      <input class="add-input size-label-input" type="text" placeholder="Libellé FR" data-act="new-size-label" aria-label="Libellé taille">
      <button type="button" class="btn btn-ghost" data-act="size-add">Ajouter une taille</button>
    </div>
  </div>`;
}

function renderList() {
  const rows = filterItems(items, {
    search: $("search").value,
    category: $("category").value,
    onlyAlerts: $("only-alerts").checked,
  });
  emptyEl.hidden = rows.length > 0;
  listEl.innerHTML = rows
    .map((it) => {
      const b = badge(it);
      const qty = qtyDisplayLabel(it.qty_on_hand);
      const status = stockStatusLabelFr(it);
      const img = photoUrl(it.image);
      const alertClass = it.below_min || it.out_of_stock ? " is-alert" : "";
      const stock = currentStockNumber(it);
      const multi = Array.isArray(it.sizes) && it.sizes.length > 1;
      return `<article class="product-card${alertClass}" role="listitem" data-id="${escapeHtml(it.product_id)}" data-qty="${stock}">
        <img class="photo" src="${escapeHtml(img)}" alt="" loading="lazy"
          onerror="this.style.opacity='0.25'">
        <div class="body">
          <span class="badge ${b.cls}">${b.text}</span>
          <h3 class="name">${it.product_number != null ? `<span class="product-code">N° ${escapeHtml(String(it.product_number))}</span> ` : ""}${escapeHtml(it.name_fr)}</h3>
          <div class="facts">
            <span>Stock actuel : <b class="qty-live">${escapeHtml(status === "Rupture de stock" ? "0 — rupture" : qty)}</b>${multi ? " <small>(somme des tailles)</small>" : ""}</span>
            <span>${escapeHtml(categoryLabelFr(it.category))}</span>
          </div>
          ${renderSizesBlock(it)}
        </div>
        ${
          multi
            ? ""
            : `<div class="qty-panel">
          <button type="button" class="btn btn-step" data-act="minus" aria-label="Retirer un exemplaire">−</button>
          <span class="step-label">±1</span>
          <button type="button" class="btn btn-step" data-act="plus" aria-label="Ajouter un exemplaire">+</button>
        </div>`
        }
        <div class="add-panel">
          ${
            multi
              ? `<p class="hint">Utilisez + / − sur chaque taille ci-dessus. Le total se met à jour automatiquement.</p>`
              : `<label class="add-label" for="add-${escapeHtml(it.product_id)}">Quantité à ajouter</label>
          <input id="add-${escapeHtml(it.product_id)}" class="add-input" type="number" min="1" step="1" inputmode="numeric"
            placeholder="ex. 5, 10, 22" data-act="add-qty" aria-label="Quantité à ajouter">
          <p class="preview" data-preview hidden></p>
          <button type="button" class="btn btn-primary btn-lg btn-add-stock" data-act="add-stock">Ajouter au stock</button>
          <button type="button" class="btn btn-ghost btn-correct" data-act="correct">Corriger le stock total</button>`
          }
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
let correctCurrent = null;

function parsePositiveInt(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) return null;
  return Math.floor(n);
}

function updatePreview(card) {
  const preview = card.querySelector("[data-preview]");
  const input = card.querySelector(".add-input");
  if (!preview || !input) return;
  const raw = String(input.value || "").trim();
  if (!raw) {
    preview.hidden = true;
    preview.textContent = "";
    return;
  }
  const n = parsePositiveInt(raw);
  if (n == null) {
    preview.hidden = false;
    preview.classList.add("preview-bad");
    preview.textContent = "Entrez un nombre entier positif (ex. 5, 10, 22).";
    return;
  }
  const current = Number(card.dataset.qty || 0);
  const next = current + n;
  preview.hidden = false;
  preview.classList.remove("preview-bad");
  preview.innerHTML = `Stock actuel : <b>${current}</b> · À ajouter : <b>+${n}</b> · Nouveau stock : <b>${next}</b>`;
}

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
  if (sizeCode && Array.isArray(it.sizes)) {
    const sz = it.sizes.find((s) => s.code === sizeCode);
    expected = sz ? sz.qty_on_hand : expected;
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

async function addSize(id, card, btn) {
  const code = card.querySelector("[data-act='new-size-code']")?.value?.trim();
  const label = card.querySelector("[data-act='new-size-label']")?.value?.trim() || code;
  if (!code) {
    showToast("Indiquez un code de taille (ex. M, L).", false);
    return;
  }
  await withBusy(id + "|add-size", btn, async () => {
    try {
      const data = await api(`/api/inventory/${encodeURIComponent(id)}/sizes`, {
        method: "POST",
        body: JSON.stringify({
          code,
          label_fr: label,
          label_en: label,
          qty_on_hand: 3,
          selector: true,
          confirm: true,
        }),
      });
      showToast(data.message_fr || "Taille ajoutée.");
      await refresh();
    } catch (err) {
      showToast(err.message, false);
    }
  });
}

async function removeSize(id, sizeCode, btn) {
  if (!window.confirm(`Retirer la taille « ${sizeCode} » ?`)) return;
  await withBusy(id + "|rm|" + sizeCode, btn, async () => {
    try {
      const data = await api(`/api/inventory/${encodeURIComponent(id)}/sizes/${encodeURIComponent(sizeCode)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      showToast(data.message_fr || "Taille retirée.");
      await refresh();
    } catch (err) {
      showToast(err.message, false);
    }
  });
}

async function addStock(id, card, btn) {
  const it = items.find((i) => i.product_id === id);
  if (!it) return;
  const input = card.querySelector(".add-input");
  const n = parsePositiveInt(input?.value);
  if (n == null) {
    showToast("Entrez un nombre entier positif à ajouter (ex. 5, 10, 22).", false);
    updatePreview(card);
    return;
  }
  const current = currentStockNumber(it);
  const next = current + n;
  const ok = window.confirm(
    `Confirmer l’ajout ?\n\nStock actuel : ${current}\nQuantité à ajouter : +${n}\nNouveau stock : ${next}\n\n(Ceci ajoute au stock, sans remplacer le total.)`,
  );
  if (!ok) return;

  await withBusy(id, btn, async () => {
    try {
      const data = await api(`/api/inventory/${encodeURIComponent(id)}/add`, {
        method: "POST",
        body: JSON.stringify({
          delta: n,
          confirm: true,
          expected_qty: it.qty_on_hand,
        }),
      });
      showToast(data.message_fr || `Ajouté : ${current} → ${next}`);
      await refresh();
    } catch (err) {
      showToast(err.message, false);
      if (err.status === 409) await refresh();
    }
  });
}

function openCorrect(id) {
  const it = items.find((i) => i.product_id === id);
  if (!it) return;
  correctCurrent = it;
  $("dlg-correct-title").textContent = it.name_fr;
  $("dlg-correct-meta").textContent = `Stock actuel : ${qtyDisplayLabel(it.qty_on_hand)} — vous allez FIXER le total (pas ajouter).`;
  $("fld-correct-qty").value = it.qty_on_hand == null ? "" : String(it.qty_on_hand);
  $("dlg-correct-error").hidden = true;
  $("dlg-correct").showModal();
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
  if (btn.dataset.act === "size-add") addSize(id, card, btn);
  if (btn.dataset.act === "size-remove") removeSize(id, btn.dataset.size, btn);
  if (btn.dataset.act === "add-stock") addStock(id, card, btn);
  if (btn.dataset.act === "correct") openCorrect(id);
});

listEl.addEventListener("input", (e) => {
  const input = e.target.closest(".add-input");
  if (!input) return;
  const card = input.closest("[data-id]");
  if (card) updatePreview(card);
});

listEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const input = e.target.closest(".add-input");
  if (!input) return;
  e.preventDefault();
  const card = input.closest("[data-id]");
  if (!card) return;
  const btn = card.querySelector('[data-act="add-stock"]');
  addStock(card.dataset.id, card, btn);
});

$("btn-save-correct").addEventListener("click", async () => {
  if (!correctCurrent) return;
  const raw = $("fld-correct-qty").value;
  const qty = Math.floor(Number(raw));
  if (raw === "" || !Number.isFinite(qty) || qty < 0 || Number(raw) !== qty) {
    $("dlg-correct-error").hidden = false;
    $("dlg-correct-error").textContent = "Entrez un total entier (0 ou plus).";
    return;
  }
  const prev = currentStockNumber(correctCurrent);
  if (
    !window.confirm(
      `Corriger le stock total ?\n\nAncien stock : ${prev}\nNouveau total fixé : ${qty}\n\n(Ceci remplace le total — ce n’est pas un ajout.)`,
    )
  ) {
    return;
  }
  const id = correctCurrent.product_id;
  const btn = $("btn-save-correct");
  await withBusy(id, btn, async () => {
    try {
      $("dlg-correct-error").hidden = true;
      const data = await api(`/api/inventory/${encodeURIComponent(id)}/qty`, {
        method: "POST",
        body: JSON.stringify({
          qty,
          confirm: true,
          expected_qty: correctCurrent.qty_on_hand,
          note: "Correction inventaire physique",
        }),
      });
      $("dlg-correct").close();
      showToast(data.message_fr || `Total corrigé : ${qty}`);
      await refresh();
    } catch (err) {
      $("dlg-correct-error").hidden = false;
      $("dlg-correct-error").textContent = err.message;
      if (err.status === 409) await refresh();
    }
  });
});

$("btn-login").addEventListener("click", async () => {
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
      showChange();
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

$("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-login").click();
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

$("btn-logout").addEventListener("click", async () => {
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
$("category").addEventListener("change", renderList);
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
      showChange();
      return;
    }
    storeToken("", false);
    showLogin();
  }
})();
