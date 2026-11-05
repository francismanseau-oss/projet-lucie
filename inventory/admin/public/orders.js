const TOKEN_KEY = "inv_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || "";
let meta = null;
let currentId = null;

const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const appView = $("app-view");
const listEl = $("list");
const emptyEl = $("empty");
const dlg = $("dlg");
const dlgBody = $("dlg-body");
const banner = $("banner");

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function money(cents) {
  if (cents == null) return "—";
  return (Number(cents) / 100).toFixed(2).replace(".", ",") + " $";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function codeHtml(item) {
  if (item.custom || item.custom_config) {
    const code =
      item.custom_config?.csm_code ||
      (item.product_number != null ? `${item.product_number}-CSM` : "CSM");
    return `<span class="product-code--csm">${escapeHtml(code)}</span>`;
  }
  if (item.product_number != null) return `<span class="product-code">N° ${escapeHtml(item.product_number)}</span>`;
  return "";
}

function measText(cfg) {
  if (!cfg) return "";
  const lines = [];
  if (cfg.unit) lines.push(`Unité : ${cfg.unit === "in" ? "pouces" : "cm"}`);
  const m = cfg.measurements || {};
  for (const [k, v] of Object.entries(m)) {
    if (v === "" || v == null) continue;
    const lab = cfg.measurement_labels?.[k]?.fr || k;
    lines.push(`${lab} : ${v}${cfg.unit === "in" ? " po" : " cm"}`);
  }
  if (cfg.leather) lines.push(`Cuir : ${cfg.leather}`);
  if (cfg.raynaud) lines.push("Raynaud : oui");
  if (cfg.comments) lines.push(`Commentaires : ${cfg.comments}`);
  return lines.join("\n");
}

async function refresh() {
  const filter = $("filter").value;
  const q = $("search").value;
  const data = await api(`/api/orders?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`);
  banner.hidden = false;
  banner.textContent = data.note_fr || "";
  const orders = data.orders || [];
  emptyEl.hidden = orders.length > 0;
  listEl.innerHTML = orders
    .map((o) => {
      const tags = [];
      if (o.payment_verified) tags.push('<span class="tag ok">Paiement vérifié</span>');
      else tags.push('<span class="tag warn">Paiement non vérifié</span>');
      if (o.has_csm) tags.push('<span class="tag warn">CSM</span>');
      if (o.source === "test_fixture") tags.push('<span class="tag fixture">Jeu d’essai</span>');
      if (o.source === "stripe_test") tags.push('<span class="tag ok">Stripe TEST</span>');
      tags.push(`<span class="tag">${escapeHtml(meta?.fulfillment_statuses?.[o.fulfillment_status] || o.fulfillment_status)}</span>`);
      tags.push(
        `<span class="tag">${escapeHtml(meta?.shipping_fee_statuses?.[o.shipping?.fee_status] || "Livraison à confirmer")}</span>`,
      );
      return `<article class="order-card" data-id="${escapeHtml(o.session_id)}">
        <strong>${escapeHtml(o.session_id.slice(0, 22))}…</strong>
        <div class="meta">${escapeHtml(new Date(o.created_at).toLocaleString("fr-CA"))} · ${money(o.amount_total_cents)}</div>
        <div class="meta">${escapeHtml(o.customer_email || "Client non fourni")}</div>
        <div class="tags">${tags.join("")}</div>
      </article>`;
    })
    .join("");
}

function openOrder(id) {
  currentId = id;
  api(`/api/orders/${encodeURIComponent(id)}`).then((data) => {
    const o = data.order;
    const itemsHtml = (o.items || [])
      .map((it) => {
        const meas = measText(it.custom_config);
        return `<div class="item-block">
          <div>${codeHtml(it)} ${escapeHtml(it.name || it.id)} × ${it.qty || 1}</div>
          ${meas ? `<div class="meas">${escapeHtml(meas)}</div>` : ""}
        </div>`;
      })
      .join("") || "<p class=\"hint\">Aucun détail d’article (metadata Stripe limitée).</p>";

    const fulOpts = Object.entries(meta?.fulfillment_statuses || {})
      .map(
        ([k, lab]) =>
          `<option value="${k}" ${k === o.fulfillment_status ? "selected" : ""}>${escapeHtml(lab)}</option>`,
      )
      .join("");

    const feeOpts = Object.entries(meta?.shipping_fee_statuses || {})
      .map(
        ([k, lab]) =>
          `<option value="${k}" ${k === (o.shipping?.fee_status || "a_confirmer") ? "selected" : ""}>${escapeHtml(lab)}</option>`,
      )
      .join("");

    const methodOpts = Object.entries(meta?.shipping_methods || {})
      .map(
        ([k, lab]) =>
          `<option value="${k}" ${k === (o.shipping?.method || "a_confirmer") ? "selected" : ""}>${escapeHtml(lab)}</option>`,
      )
      .join("");

    const hist = (o.status_history || [])
      .map(
        (h) =>
          `<li><strong>${escapeHtml(h.field)}</strong> ${escapeHtml(String(h.before))} → ${escapeHtml(
            typeof h.after === "object" ? "…" : String(h.after),
          )}<br>${escapeHtml(new Date(h.at).toLocaleString("fr-CA"))} · ${escapeHtml(h.note || "")}</li>`,
      )
      .join("") || "<li>Aucun changement encore.</li>";

    dlgBody.innerHTML = `
      <h2>Commande</h2>
      <p class="hint">${escapeHtml(o.session_id)}<br>${escapeHtml(o.source_label)} · Paiement : ${escapeHtml(
        o.payment_status,
      )} ${o.payment_verified ? "(vérifié)" : ""}</p>
      <p><strong>${money(o.amount_total_cents)}</strong> · ${escapeHtml(o.customer_name || "")} ${escapeHtml(
        o.customer_email || "",
      )}</p>

      <div class="dlg-section">
        <h3>Articles</h3>
        ${itemsHtml}
      </div>

      <div class="dlg-section">
        <h3>Fabrication / préparation</h3>
        <p class="hint">Ne modifie pas le paiement Stripe.</p>
        <select id="fld-ful">${fulOpts}</select>
        <button type="button" class="btn btn-primary btn-lg" id="btn-save-ful">Enregistrer le statut</button>
      </div>

      <div class="dlg-section">
        <h3>Livraison</h3>
        <p class="hint">Aucun tarif inventé. Par défaut : « Livraison à confirmer ».</p>
        <label>Mode</label>
        <select id="fld-method">${methodOpts}</select>
        <label>Statut des frais</label>
        <select id="fld-fee-status">${feeOpts}</select>
        <label>Montant frais (cents CAD, vide = inconnu)</label>
        <input id="fld-fee" type="number" min="0" step="1" inputmode="numeric" placeholder="laisser vide"
          value="${o.shipping?.fee_cad_cents ?? ""}">
        <label class="chk"><input type="checkbox" id="fld-agreed" ${
          o.shipping?.client_fee_agreed ? "checked" : ""
        }> Client a accepté les frais</label>
        <label>N° suivi Postes Canada</label>
        <input id="fld-track" type="text" value="${escapeHtml(o.shipping?.tracking_number || "")}">
        <label>Autobus — transporteur</label>
        <input id="fld-carrier" type="text" value="${escapeHtml(o.shipping?.bus?.carrier || "")}">
        <label>Point dépôt</label>
        <input id="fld-drop" type="text" value="${escapeHtml(o.shipping?.bus?.dropoff_point || "")}">
        <label>Point ramassage</label>
        <input id="fld-pick" type="text" value="${escapeHtml(o.shipping?.bus?.pickup_point || "")}">
        <label>Référence transport</label>
        <input id="fld-ref" type="text" value="${escapeHtml(o.shipping?.bus?.reference || "")}">
        <button type="button" class="btn btn-primary btn-lg" id="btn-save-ship">Enregistrer la livraison</button>
      </div>

      <div class="dlg-section">
        <h3>Historique</h3>
        <ul class="hist">${hist}</ul>
      </div>
    `;

    $("btn-save-ful")?.addEventListener("click", async () => {
      if (!confirm("Changer le statut de fabrication / préparation ?")) return;
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/fulfillment`, {
          method: "POST",
          body: JSON.stringify({
            fulfillment_status: $("fld-ful").value,
            confirm: true,
          }),
        });
        dlg.close();
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    $("btn-save-ship")?.addEventListener("click", async () => {
      if (!confirm("Enregistrer les infos de livraison ?")) return;
      const feeRaw = $("fld-fee").value;
      const shipping = {
        method: $("fld-method").value,
        fee_status: $("fld-fee-status").value,
        fee_cad_cents: feeRaw === "" ? null : Number(feeRaw),
        client_fee_agreed: $("fld-agreed").checked,
        tracking_number: $("fld-track").value.trim() || null,
        bus: {
          carrier: $("fld-carrier").value.trim() || null,
          dropoff_point: $("fld-drop").value.trim() || null,
          pickup_point: $("fld-pick").value.trim() || null,
          reference: $("fld-ref").value.trim() || null,
          carrier_accepts_parcels_verified: false,
        },
      };
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/shipping`, {
          method: "POST",
          body: JSON.stringify({ shipping, confirm: true }),
        });
        dlg.close();
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    dlg.showModal();
  });
}

$("btn-login").addEventListener("click", async () => {
  $("login-error").hidden = true;
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: $("password").value }),
    });
    token = data.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    loginView.hidden = true;
    appView.hidden = false;
    meta = await api("/api/orders/meta");
    await refresh();
  } catch (e) {
    $("login-error").hidden = false;
    $("login-error").textContent = e.message;
  }
});

$("btn-logout").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  }
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  appView.hidden = true;
  loginView.hidden = false;
});

$("btn-import").addEventListener("click", async () => {
  if (!confirm("Importer les paiements TEST payés depuis Stripe ?")) return;
  try {
    const r = await api("/api/orders/import-stripe-test", {
      method: "POST",
      body: JSON.stringify({ confirm: true, limit: 15 }),
    });
    alert(`${r.imported_count} commande(s) importée(s) (TEST).`);
    await refresh();
  } catch (e) {
    alert(e.message);
  }
});

listEl.addEventListener("click", (e) => {
  const card = e.target.closest(".order-card");
  if (card) openOrder(card.dataset.id);
});
$("search").addEventListener("input", () => refresh());
$("filter").addEventListener("change", () => refresh());

(async () => {
  if (!token) return;
  try {
    loginView.hidden = true;
    appView.hidden = false;
    meta = await api("/api/orders/meta");
    await refresh();
  } catch {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
  }
})();
