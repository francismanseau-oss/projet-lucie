import { contactLinksHtml } from "./clients-lib.js";

const TOKEN_KEY = "inv_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
let meta = null;
let currentId = null;
let activeFilter = "toutes";
let activeSort = "oldest";

const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const appView = $("app-view");
const listEl = $("list");
const emptyEl = $("empty");
const dlg = $("dlg");
const dlgBody = $("dlg-body");
const dlgConfirmDelete = $("dlg-confirm-delete");
const dlgConfirmDeleteMsg = $("dlg-confirm-delete-msg");
const banner = $("banner");
const dashEl = $("orders-dashboard");
const stripeModeEl = $("stripe-mode");
let pendingDelete = null;

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

function money(cents) {
  if (cents == null || cents === "") return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toFixed(2).replace(".", ",") + " $";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orderLabel(o) {
  if (o.order_number) return `Commande ${o.order_number}`;
  const sid = String(o.session_id || o.id || "");
  if (sid.startsWith("cs_test_") || sid.startsWith("cs_live_")) {
    return `Commande ${sid.slice(0, 18)}…`;
  }
  return sid ? `Commande ${sid}` : "Commande";
}

function codeHtml(item) {
  if (item.custom || item.custom_config) {
    const code =
      item.custom_config?.csm_code ||
      (item.product_number != null ? `${item.product_number}-CSM` : "CSM");
    return `<span class="product-code--csm">${escapeHtml(code)}</span>`;
  }
  if (item.product_number != null) {
    return `<span class="product-code">N° ${escapeHtml(item.product_number)}</span>`;
  }
  return "";
}

function sizeLabel(item) {
  return (
    item.size_label_fr ||
    item.size_label ||
    item.size ||
    item.custom_config?.size_label_fr ||
    null
  );
}

function formatAddress(addr) {
  if (!addr || typeof addr !== "object") return "";
  const lines = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.postal_code,
    addr.country,
  ].filter((x) => x && String(x).trim());
  return lines.join("\n");
}

function measText(cfg) {
  if (!cfg) return "";
  const lines = [];
  if (cfg.unit) lines.push(`Unité : ${cfg.unit === "in" ? "pouces" : "cm"}`);
  const m = cfg.measurements || {};
  const oor = cfg.measure_out_of_range || {};
  for (const [k, v] of Object.entries(m)) {
    if (oor[k] || v === "" || v == null) continue;
    const lab = cfg.measurement_labels?.[k]?.fr || k;
    lines.push(`${lab} : ${v}${cfg.unit === "in" ? " po" : " cm"}`);
  }
  for (const [k, flagged] of Object.entries(oor)) {
    if (!flagged) continue;
    const lab = cfg.measurement_labels?.[k]?.fr || k;
    lines.push(`${lab} : Mesure hors liste — Lucie contactera le client`);
  }
  if (Array.isArray(cfg.special_requests) && cfg.special_requests.length) {
    lines.push(`Demandes particulières : ${cfg.special_requests.join(", ")}`);
  }
  if (cfg.leather) lines.push(`Cuir : ${cfg.leather}`);
  if (cfg.chaleur) {
    lines.push(
      "Chaleur renforcée : oui (+20 $ non inclus dans le total). Fait à partir de zéro : 1 semaine de fabrication, environ 3 semaines avant Noël.",
    );
  }
  if (cfg.comments) lines.push(`Commentaires : ${cfg.comments}`);
  return lines.join("\n");
}

function paymentTag(o) {
  if (o.payment_verified) {
    return '<span class="tag ok">Paiement vérifié</span>';
  }
  return '<span class="tag pay-no">Paiement non confirmé</span>';
}

const SHIP_SHORT = {
  canada_post: "Postes Canada",
  bus_quebec: "Express bus",
  a_confirmer: "À confirmer",
};

function shipShort(id) {
  if (!id) return "À confirmer";
  return SHIP_SHORT[id] || meta?.shipping_methods?.[id] || id;
}

/** Choix client à la caisse (ne pas confondre avec le transporteur réellement utilisé). */
function clientChosenMethod(o) {
  const s = o.shipping || {};
  if (s.client_chosen_method && s.client_chosen_method !== "a_confirmer") {
    return s.client_chosen_method;
  }
  if (s.method && s.method !== "a_confirmer") return s.method;
  return null;
}

function renderDashboard(summary) {
  const s = summary || {};
  const late = s.en_retard ?? 0;
  dashEl.innerHTML = `
    <div class="dash-item"><strong>${s.a_preparer ?? 0}</strong><span>À préparer</span></div>
    <div class="dash-item"><strong>${s.a_fabriquer ?? 0}</strong><span>Sur mesure</span></div>
    <div class="dash-item${late ? " dash-item--late" : ""}"><strong>${late}</strong><span>En retard</span></div>
    <div class="dash-item"><strong>${s.expediees ?? 0}</strong><span>Expédiées</span></div>
    <div class="dash-item"><strong>${s.annulees ?? 0}</strong><span>Annulées</span></div>
    <div class="dash-item"><strong>${s.total ?? 0}</strong><span>Total</span></div>
  `;
}

function renderStripeMode(data) {
  const live = !!(data && data.stripe_live === true && data.stripe_mode === "LIVE");
  if (live) {
    stripeModeEl.textContent = "Mode réel";
    stripeModeEl.classList.add("is-live");
  } else {
    stripeModeEl.textContent = "Mode essai — paiements fictifs";
    stripeModeEl.classList.remove("is-live");
  }
}

async function refresh() {
  const q = $("search").value;
  const data = await api(
    `/api/orders?filter=${encodeURIComponent(activeFilter)}&q=${encodeURIComponent(q)}&sort=${encodeURIComponent(activeSort)}`,
  );
  banner.hidden = !data.note_fr;
  banner.textContent = data.note_fr || "";
  renderDashboard(data.summary);
  renderStripeMode(data);

  const orders = data.orders || [];
  emptyEl.hidden = orders.length > 0;
  listEl.innerHTML = orders
    .map((o) => {
      const late = o.lateness || {};
      const tags = [paymentTag(o)];
      if (o.archived) tags.push('<span class="tag tag-archive">Archivée</span>');
      if (o.has_csm) tags.push('<span class="tag warn">Sur mesure</span>');
      if (o.source === "test_fixture") tags.push('<span class="tag fixture">Jeu d’essai</span>');
      if (o.source === "stripe_test") tags.push('<span class="tag ok">Stripe TEST</span>');
      tags.push(
        `<span class="tag">${escapeHtml(
          meta?.fulfillment_statuses?.[o.fulfillment_status] || o.fulfillment_status,
        )}</span>`,
      );
      if (late.late && late.label) {
        tags.push(`<span class="tag tag-late">${escapeHtml(late.label)}</span>`);
      }
      const chosen = clientChosenMethod(o);
      const shipLabel = chosen
        ? `Livraison choisie : ${shipShort(chosen)}`
        : "Livraison à confirmer";
      const clientBit =
        o.client_number != null ? `Client n° ${o.client_number} · ` : "";
      const ageBit =
        late.age_label && !["expediee", "annulee"].includes(o.fulfillment_status)
          ? `<div class="meta meta-age">${escapeHtml(late.age_label)}</div>`
          : "";
      const lateDot = late.late
        ? `<span class="late-dot" title="${escapeHtml(late.label || "En retard")}" aria-label="En retard"></span>`
        : "";
      const oid = escapeHtml(o.session_id || o.id);
      return `<article class="order-card${late.late ? " is-late" : ""}" role="listitem" data-id="${oid}">
        <div class="order-card-main">
          <h2 class="order-title">${lateDot}${escapeHtml(orderLabel(o))}</h2>
          <div class="meta">${escapeHtml(new Date(o.created_at).toLocaleString("fr-CA"))}</div>
          <div class="meta">${escapeHtml(clientBit)}${escapeHtml(o.customer_name || "Client non fourni")}${
            o.payment_verified ? ` · ${escapeHtml(money(o.amount_total_cents))}` : ""
          }</div>
          <div class="meta"><strong>${escapeHtml(shipLabel)}</strong></div>
          ${ageBit}
          <div class="tags">${tags.join("")}</div>
        </div>
        <div class="order-card-actions">
          <button type="button" class="btn btn-primary btn-card-act" data-act="edit" data-id="${oid}">Modifier</button>
          <button type="button" class="btn btn-danger btn-card-act" data-act="delete" data-id="${oid}" data-label="${escapeHtml(orderLabel(o))}">Supprimer</button>
        </div>
      </article>`;
    })
    .join("");
}

function askDeleteConfirm(id, label) {
  if (!id) {
    alert("Impossible de supprimer : identifiant manquant.");
    return;
  }
  pendingDelete = { id, label: label || "cette commande" };
  if (dlgConfirmDeleteMsg) {
    dlgConfirmDeleteMsg.textContent = `Supprimer définitivement ${pendingDelete.label} ?`;
  }
  dlgConfirmDelete?.showModal();
}

async function performDeleteOrder() {
  const job = pendingDelete;
  pendingDelete = null;
  dlgConfirmDelete?.close();
  if (!job?.id) return;
  try {
    await api(`/api/orders/${encodeURIComponent(job.id)}/delete`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    if (dlg?.open) dlg.close();
    await refresh();
  } catch (e) {
    alert(e.message || "Suppression impossible.");
  }
}

function openOrder(id) {
  currentId = id;
  api(`/api/orders/${encodeURIComponent(id)}`).then((data) => {
    const o = data.order;
    const itemsHtml =
      (o.items || [])
        .map((it) => {
          const meas = measText(it.custom_config);
          const size = sizeLabel(it);
          const line =
            it.unit_amount != null && it.qty
              ? Number(it.unit_amount) * Number(it.qty || 1)
              : it.amount_total != null
                ? it.amount_total
                : null;
          return `<div class="item-block">
          <div class="item-head">${codeHtml(it)} ${escapeHtml(it.name || it.id)}</div>
          <div class="item-facts">
            ${size ? `<div>Taille : <b>${escapeHtml(size)}</b></div>` : ""}
            <div>Quantité : <b>${escapeHtml(String(it.qty || 1))}</b></div>
            <div>Montant : <b>${escapeHtml(money(line ?? it.unit_amount))}</b></div>
          </div>
          ${meas ? `<div class="meas">${escapeHtml(meas)}</div>` : ""}
        </div>`;
        })
        .join("") || '<p class="hint">Aucun détail d’article (données limitées).</p>';

    const fulOpts = Object.entries(meta?.fulfillment_statuses || {})
      .map(
        ([k, lab]) =>
          `<option value="${k}" ${k === o.fulfillment_status ? "selected" : ""}>${escapeHtml(lab)}</option>`,
      )
      .join("");

    const methodOpts = Object.entries(meta?.shipping_methods || {})
      .filter(([k]) => k !== "pickup")
      .map(
        ([k, lab]) =>
          `<option value="${k}" ${
            k === (o.shipping?.method || "a_confirmer") ? "selected" : ""
          }>${escapeHtml(lab)}</option>`,
      )
      .join("");

    const hist =
      (o.status_history || [])
        .map(
          (h) =>
            `<li><strong>${escapeHtml(h.field)}</strong> ${escapeHtml(String(h.before))} → ${escapeHtml(
              typeof h.after === "object" ? "…" : String(h.after),
            )}<br>${escapeHtml(new Date(h.at).toLocaleString("fr-CA"))} · ${escapeHtml(
              h.note || "",
            )}</li>`,
        )
        .join("") || "<li>Aucun changement encore.</li>";

    const addrText = formatAddress(o.shipping_address);
    const chosenId = clientChosenMethod(o);
    const methodRaw = o.shipping?.method || "a_confirmer";
    const method =
      methodRaw && methodRaw !== "a_confirmer" ? methodRaw : chosenId || "a_confirmer";
    const chosenLabel = shipShort(chosenId);
    const usedLabel = shipShort(method);
    const feeCents =
      o.amount_shipping_cents != null
        ? o.amount_shipping_cents
        : o.shipping?.fee_cad_cents != null
          ? o.shipping.fee_cad_cents
          : null;
    const feeShown = feeCents != null ? money(feeCents) : "À confirmer";
    const bus = o.shipping?.bus || {};
    let transportExtra = "";
    if (chosenId === "canada_post" || method === "canada_post") {
      transportExtra = addrText
        ? `<div><span class="k">Poste</span><span class="v" style="white-space:pre-wrap">${escapeHtml(
            addrText,
          )}</span></div>`
        : `<div><span class="k">Poste</span><span class="v">Adresse manquante pour l’expédition</span></div>`;
    } else if (chosenId === "bus_quebec" || method === "bus_quebec") {
      const bits = [
        bus.dropoff_point ? `Dépôt : ${bus.dropoff_point}` : null,
        bus.pickup_point ? `Ramassage : ${bus.pickup_point}` : null,
        bus.carrier ? `Transporteur : ${bus.carrier}` : null,
        bus.reference ? `Réf. : ${bus.reference}` : null,
      ].filter(Boolean);
      transportExtra = bits.length
        ? `<div><span class="k">Express Bus</span><span class="v">${escapeHtml(
            bits.join(" · "),
          )}</span></div>`
        : `<div><span class="k">Express Bus</span><span class="v">Dépôt / destination non renseignés — ne pas inventer ni utiliser le domicile par défaut</span></div>`;
    }

    const late = o.lateness || {};
    const lateBanner =
      late.late && late.label
        ? `<p class="late-banner" role="status"><span class="late-dot" aria-hidden="true"></span>${escapeHtml(
            late.label,
          )}</p>`
        : late.age_label && !["expediee", "annulee"].includes(o.fulfillment_status)
          ? `<p class="hint meta-age">${escapeHtml(late.age_label)}</p>`
          : "";

    dlgBody.innerHTML = `
      <h2>${escapeHtml(orderLabel(o))}</h2>
      <p class="hint">${escapeHtml(o.source_label || "")} · ${escapeHtml(
        new Date(o.created_at).toLocaleString("fr-CA"),
      )}${
        o.client_number != null
          ? ` · Client n° ${escapeHtml(String(o.client_number))}`
          : ""
      }</p>
      ${lateBanner}
      <p>${
        o.payment_verified
          ? `<span class="tag ok">Paiement vérifié</span> · Total payé : <strong>${escapeHtml(
              money(o.amount_total_cents),
            )}</strong>`
          : `<span class="tag pay-no">Paiement non confirmé par le serveur</span>`
      }</p>

      <div class="dlg-section private">
        <h3>Coordonnées d’expédition</h3>
        <p class="hint">Visible seulement dans cet outil connecté. Vous pouvez corriger les infos ici.</p>
        <div class="dlg-kv">
          <div><span class="k">N° client</span><span class="v">${escapeHtml(
            o.client_number != null ? String(o.client_number) : "—",
          )}</span></div>
        </div>
        <label>Nom</label>
        <input id="fld-name" type="text" value="${escapeHtml(o.customer_name || "")}">
        <label>Courriel</label>
        <input id="fld-email" type="email" value="${escapeHtml(o.customer_email || "")}">
        <label>Téléphone</label>
        <input id="fld-phone" type="tel" value="${escapeHtml(o.customer_phone || "")}">
        <label>Adresse ligne 1</label>
        <input id="fld-addr1" type="text" value="${escapeHtml(o.shipping_address?.line1 || "")}">
        <label>Adresse ligne 2</label>
        <input id="fld-addr2" type="text" value="${escapeHtml(o.shipping_address?.line2 || "")}">
        <label>Ville</label>
        <input id="fld-city" type="text" value="${escapeHtml(o.shipping_address?.city || "")}">
        <label>Province</label>
        <input id="fld-state" type="text" value="${escapeHtml(o.shipping_address?.state || "")}">
        <label>Code postal</label>
        <input id="fld-postal" type="text" value="${escapeHtml(o.shipping_address?.postal_code || "")}">
        <label>Notes Lucie</label>
        <textarea id="fld-notes" rows="3">${escapeHtml(o.notes_lucie || "")}</textarea>
        <button type="button" class="btn btn-primary btn-lg" id="btn-save-details">Enregistrer les infos</button>
        <div class="dlg-kv" style="margin-top:0.75rem">
          <div><span class="k">Livraison choisie</span><span class="v"><strong>${escapeHtml(
            chosenLabel,
          )}</strong></span></div>
          <div><span class="k">Frais facturés</span><span class="v">${escapeHtml(feeShown)}</span></div>
          <div><span class="k">Mode utilisé</span><span class="v">${escapeHtml(usedLabel)}</span></div>
          ${transportExtra}
        </div>
      </div>

      <div class="dlg-section">
        <h3>Articles</h3>
        ${itemsHtml}
        <div class="dlg-kv" style="margin-top:0.65rem">
          <div><span class="k">Sous-total</span><span class="v">${escapeHtml(
            money(o.amount_subtotal_cents),
          )}</span></div>
          <div><span class="k">Livraison</span><span class="v">${escapeHtml(
            o.amount_shipping_cents != null
              ? money(o.amount_shipping_cents)
              : o.shipping?.fee_cad_cents != null
                ? money(o.shipping.fee_cad_cents)
                : "À confirmer",
          )}</span></div>
          <div><span class="k">Total</span><span class="v">${escapeHtml(
            o.payment_verified ? money(o.amount_total_cents) : "— (non confirmé)",
          )}</span></div>
        </div>
      </div>

      <div class="dlg-section">
        <h3>Fabrication / préparation</h3>
        <p class="hint">Ne modifie pas le paiement Stripe.</p>
        <select id="fld-ful">${fulOpts}</select>
        <button type="button" class="btn btn-primary btn-lg" id="btn-save-ful">Enregistrer le statut</button>
      </div>

      <div class="dlg-section">
        <h3>Livraison (suivi)</h3>
        <p class="hint">Aucun tarif inventé. Par défaut : « Livraison à confirmer ».</p>
        <label>Mode utilisé</label>
        <select id="fld-method">${methodOpts}</select>
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

      <div class="dlg-section dlg-manage">
        <h3>Archive</h3>
        <p class="hint">Archiver retire la commande de la liste active (filtre « Archivées » pour la revoir).</p>
        ${
          o.archived
            ? `<button type="button" class="btn btn-primary btn-lg" id="btn-unarchive">Remettre dans les actives</button>`
            : `<button type="button" class="btn btn-primary btn-lg" id="btn-archive">Archiver</button>`
        }
      </div>
    `;

    $("btn-save-details")?.addEventListener("click", async () => {
      if (!confirm("Enregistrer les coordonnées et notes de cette commande ?")) return;
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/details`, {
          method: "POST",
          body: JSON.stringify({
            confirm: true,
            patch: {
              customer_name: $("fld-name").value,
              customer_email: $("fld-email").value,
              customer_phone: $("fld-phone").value,
              notes_lucie: $("fld-notes").value,
              shipping_address: {
                line1: $("fld-addr1").value,
                line2: $("fld-addr2").value,
                city: $("fld-city").value,
                state: $("fld-state").value,
                postal_code: $("fld-postal").value,
                country: o.shipping_address?.country || "CA",
              },
            },
          }),
        });
        dlg.close();
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    $("btn-archive")?.addEventListener("click", async () => {
      if (
        !confirm(
          `Archiver ${orderLabel(o)} ? Elle disparaîtra de la liste active (filtre « Archivées » pour la revoir).`,
        )
      ) {
        return;
      }
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/archive`, {
          method: "POST",
          body: JSON.stringify({ confirm: true, archived: true }),
        });
        dlg.close();
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    $("btn-unarchive")?.addEventListener("click", async () => {
      if (!confirm(`Remettre ${orderLabel(o)} dans les commandes actives ?`)) return;
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/archive`, {
          method: "POST",
          body: JSON.stringify({ confirm: true, archived: false }),
        });
        dlg.close();
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    $("btn-save-ful")?.addEventListener("click", async () => {
      const nextStatus = $("fld-ful").value;
      const msg =
        nextStatus === "annulee"
          ? "Voulez-vous vraiment annuler cette commande?"
          : "Changer le statut de fabrication / préparation ?";
      if (!confirm(msg)) return;
      try {
        await api(`/api/orders/${encodeURIComponent(currentId)}/fulfillment`, {
          method: "POST",
          body: JSON.stringify({
            fulfillment_status: nextStatus,
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
      const prevShip = o.shipping || {};
      const shipping = {
        method: $("fld-method").value,
        actual_carrier: prevShip.actual_carrier || null,
        fee_status: prevShip.fee_status || "a_confirmer",
        fee_cad_cents: prevShip.fee_cad_cents ?? null,
        client_fee_agreed: !!prevShip.client_fee_agreed,
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

async function enterApp() {
  loginView.hidden = true;
  appView.hidden = false;
  meta = await api("/api/orders/meta");
  renderStripeMode(meta);
  await refresh();
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
    $("password").value = "";
    await enterApp();
  } catch (e) {
    $("login-error").hidden = false;
    $("login-error").textContent = e.message;
  }
});

$("btn-logout")?.addEventListener("click", async () => {
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
  if (!confirm("Actualiser les commandes depuis Stripe (mode essai) ?")) return;
  try {
    const r = await api("/api/orders/import-stripe-test", {
      method: "POST",
      body: JSON.stringify({ confirm: true, limit: 15 }),
    });
    alert(`${r.imported_count} commande(s) importée(s) (essai).`);
    await refresh();
  } catch (e) {
    alert(e.message);
  }
});

const dlgChangePw = $("dlg-change-password");
function clearChangePwForm() {
  if ($("cur-password")) $("cur-password").value = "";
  if ($("new-password")) $("new-password").value = "";
  if ($("new-password2")) $("new-password2").value = "";
  const err = $("change-pw-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}
$("btn-open-change")?.addEventListener("click", () => {
  clearChangePwForm();
  dlgChangePw?.showModal();
});
$("btn-change-cancel")?.addEventListener("click", () => {
  clearChangePwForm();
  dlgChangePw?.close();
});
dlgChangePw?.addEventListener("click", (e) => {
  if (e.target === dlgChangePw) {
    clearChangePwForm();
    dlgChangePw.close();
  }
});
$("btn-change-save")?.addEventListener("click", async () => {
  const err = $("change-pw-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const data = await api("/api/password/change", {
      method: "POST",
      body: JSON.stringify({
        current_password: $("cur-password").value,
        new_password: $("new-password").value,
        confirm_password: $("new-password2").value,
      }),
    });
    clearChangePwForm();
    dlgChangePw?.close();
    alert(data.message_fr || "Mot de passe enregistré.");
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Changement impossible.";
    } else {
      alert(e.message || "Changement impossible.");
    }
  }
});

listEl.addEventListener("click", (e) => {
  const actBtn = e.target.closest("[data-act]");
  if (actBtn) {
    e.preventDefault();
    e.stopPropagation();
    const card = actBtn.closest(".order-card");
    const id = actBtn.dataset.id || card?.dataset.id || "";
    if (actBtn.dataset.act === "edit") openOrder(id);
    else if (actBtn.dataset.act === "delete") {
      askDeleteConfirm(id, actBtn.dataset.label || orderLabel({ session_id: id }));
    }
    return;
  }
  const card = e.target.closest(".order-card");
  if (card) openOrder(card.dataset.id);
});

$("btn-confirm-delete-yes")?.addEventListener("click", () => {
  performDeleteOrder();
});
$("btn-confirm-delete-no")?.addEventListener("click", () => {
  pendingDelete = null;
  dlgConfirmDelete?.close();
});
dlgConfirmDelete?.addEventListener("cancel", () => {
  pendingDelete = null;
});
dlgConfirmDelete?.addEventListener("click", (e) => {
  if (e.target === dlgConfirmDelete) {
    pendingDelete = null;
    dlgConfirmDelete.close();
  }
});

dlg.addEventListener("click", (e) => {
  if (e.target === dlg) dlg.close();
});
$("search").addEventListener("input", () => refresh());

$("order-filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  activeFilter = btn.dataset.filter || "toutes";
  $("order-filters").querySelectorAll("[data-filter]").forEach((el) => {
    el.classList.toggle("is-on", el === btn);
  });
  refresh();
});

$("order-sort")?.addEventListener("change", () => {
  activeSort = $("order-sort").value === "newest" ? "newest" : "oldest";
  refresh();
});

(async () => {
  if (!token) return;
  try {
    await enterApp();
  } catch {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
  }
})();
