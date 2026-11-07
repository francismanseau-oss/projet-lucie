import {
  buildClientDirectory,
  filterClients,
  mailToHref,
  messageTemplatesFr,
  orderLabel,
  formatAddress,
  contactLinksHtml,
} from "./clients-lib.js";

const TOKEN_KEY = "inv_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
let allClients = [];
let meta = null;

const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const appView = $("app-view");
const bodyEl = $("clients-body");
const emptyEl = $("empty");
const countEl = $("clients-count");
const dlg = $("dlg-client");
const dlgBody = $("dlg-client-body");
const banner = $("banner");

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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(cents) {
  if (cents == null || cents === "") return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toFixed(2).replace(".", ",") + " $";
}

function shippingLabel(o) {
  const method = o.shipping?.method;
  return meta?.shipping_methods?.[method] || method || "Mode à confirmer";
}

function renderList() {
  const rows = filterClients(allClients, $("search").value);
  countEl.textContent = `${rows.length} client(s)`;
  emptyEl.hidden = rows.length > 0;
  bodyEl.innerHTML = rows
    .map((c) => {
      const links = contactLinksHtml(c.email, c.phone, escapeHtml);
      return `<tr data-key="${escapeHtml(c.key)}">
      <td><b>${escapeHtml(c.client_number != null ? String(c.client_number) : "—")}</b></td>
      <td>${escapeHtml(c.name || "Non fourni")}</td>
      <td>${links.mail}</td>
      <td>${links.phone}</td>
      <td>${escapeHtml(c.address || "Non fourni")}</td>
      <td>${escapeHtml(c.city || "Non fourni")}</td>
      <td><b>${c.orders_count}</b></td>
      <td class="clients-actions-cell">
        <button type="button" class="btn btn-primary btn-open-client" data-open-client="${escapeHtml(
          c.key,
        )}">Ouvrir</button>
      </td>
    </tr>`;
    })
    .join("");
}

function openClient(key) {
  const client = allClients.find((c) => c.key === key);
  if (!client) return;

  const selectedOrder = client.orders[0] || null;
  const label = selectedOrder ? orderLabel(selectedOrder) : null;
  const templates = messageTemplatesFr(label ? `Commande ${label}` : null);

  const ordersHtml = client.orders
    .map((o) => {
      const addr = formatAddress(o.shipping_address) || "Non fournie";
      const items = (o.items || [])
        .map((it) => {
          const size = it.size_label_fr || it.size || "—";
          return `${it.name || it.id} · taille ${size} · ×${it.qty || 1}`;
        })
        .join("<br>") || "Aucun article";
      const bus = o.shipping?.bus || {};
      const busBits = [
        bus.dropoff_point ? `Dépôt : ${bus.dropoff_point}` : null,
        bus.pickup_point ? `Ramassage : ${bus.pickup_point}` : null,
        bus.carrier ? `Transporteur : ${bus.carrier}` : null,
        bus.reference ? `Réf. : ${bus.reference}` : null,
      ].filter(Boolean);
      const method = o.shipping?.method || "";
      let shipExtra = "";
      if (method === "bus_quebec") {
        shipExtra = busBits.length
          ? `<div class="meta">${escapeHtml(busBits.join(" · "))}</div>`
          : `<div class="meta"><b>Attention :</b> dépôt Express Bus non renseigné — ne pas inventer.</div>`;
      } else if (method === "canada_post") {
        shipExtra = `<div class="meta" style="white-space:pre-wrap">${escapeHtml(addr)}</div>`;
      }
      return `<div class="order-mini" data-order-id="${escapeHtml(o.session_id)}">
        <h4>${escapeHtml(orderLabel(o))}</h4>
        <div class="meta">${escapeHtml(new Date(o.created_at).toLocaleString("fr-CA"))}
          · ${
            o.payment_verified
              ? escapeHtml(money(o.amount_total_cents))
              : "Paiement non confirmé"
          }
          · ${escapeHtml(shippingLabel(o))}
        </div>
        <div class="meta">${items}</div>
        ${shipExtra}
        <div class="client-actions">
          <a class="btn btn-ghost" href="orders.html">Voir dans Commandes</a>
        </div>
      </div>`;
    })
    .join("");

  const mailBase = mailToHref({
    email: client.email,
    subject: templates[0].subject,
    body: templates[0].body,
  });

  dlgBody.innerHTML = `
    <h2>${escapeHtml(client.name || "Client")}</h2>
    <p class="hint">N° client ${escapeHtml(
      client.client_number != null ? String(client.client_number) : "—",
    )} · factures en LFB-date-heure</p>
    <div class="dlg-kv">
      <div><span class="k">N° client</span><span class="v">${escapeHtml(
        client.client_number != null ? String(client.client_number) : "—",
      )}</span></div>
      <div><span class="k">Courriel</span><span class="v">${
        contactLinksHtml(client.email, client.phone, escapeHtml).mail
      }</span></div>
      <div><span class="k">Téléphone</span><span class="v">${
        contactLinksHtml(client.email, client.phone, escapeHtml).phone
      }</span></div>
      <div><span class="k">Adresse</span><span class="v">${escapeHtml(
        client.address || "Non fourni",
      )}</span></div>
      <div><span class="k">Ville</span><span class="v">${escapeHtml(
        client.city || "Non fourni",
      )}</span></div>
    </div>

    <div class="dlg-section private">
      <h3>Écrire au client</h3>
      <p class="hint">Ouvre votre application courriel. Rien n’est envoyé automatiquement.</p>
      <div class="template-row" id="tpl-row">
        ${templates
          .map(
            (t) =>
              `<button type="button" class="btn btn-filter" data-tpl="${escapeHtml(t.id)}">${escapeHtml(
                t.label,
              )}</button>`,
          )
          .join("")}
      </div>
      <div class="client-actions">
        <a class="btn btn-primary" id="btn-mailto" href="${
          mailBase ? escapeHtml(mailBase) : "#"
        }" ${mailBase ? "" : "aria-disabled=\"true\""}>Écrire au client</a>
        ${
          client.phone
            ? `<a class="btn btn-ghost" href="tel:${escapeHtml(
                String(client.phone).replace(/[^\d+]/g, ""),
              )}">Appeler</a>`
            : `<span class="hint">Appel indisponible (téléphone non fourni)</span>`
        }
      </div>
    </div>

    <div class="dlg-section">
      <h3>Commandes (${client.orders_count})</h3>
      <p class="hint">Chaque commande conserve sa propre adresse d’expédition.</p>
      ${ordersHtml}
    </div>
  `;

  const tplMap = Object.fromEntries(templates.map((t) => [t.id, t]));
  dlgBody.querySelector("#tpl-row")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tpl]");
    if (!btn) return;
    const t = tplMap[btn.dataset.tpl];
    if (!t) return;
    const href = mailToHref({ email: client.email, subject: t.subject, body: t.body });
    const a = dlgBody.querySelector("#btn-mailto");
    if (a && href) a.href = href;
    dlgBody.querySelectorAll("[data-tpl]").forEach((el) => {
      el.classList.toggle("is-on", el === btn);
    });
  });

  dlg.showModal();
}

async function refresh() {
  const data = await api("/api/orders?filter=toutes&q=");
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  allClients = buildClientDirectory(data.orders || []);
  renderList();
}

async function enterApp() {
  loginView.hidden = true;
  appView.hidden = false;
  meta = await api("/api/orders/meta");
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

$("search").addEventListener("input", renderList);
bodyEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-client]");
  if (!btn) return;
  e.preventDefault();
  openClient(btn.dataset.openClient);
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
