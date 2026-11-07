/**
 * Répertoire clients dérivé des commandes existantes.
 * Pas de second stockage — rapprochement par courriel normalisé seulement.
 */

import { normalizeOrder } from "./orders-core.js";

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function cityFromOrder(o) {
  return o.shipping_address?.city || null;
}

/**
 * @param {object[]} orders
 * @returns {object[]} clients triés par nom
 */
export function buildClientDirectory(orders) {
  const byEmail = new Map();

  for (const raw of orders || []) {
    const o = normalizeOrder(raw);
    const email = normalizeEmail(o.customer_email);
    if (!email) continue;

    let client = byEmail.get(email);
    if (!client) {
      client = {
        key: email,
        email: o.customer_email,
        name: o.customer_name || "Non fourni",
        phone: o.customer_phone || null,
        city: cityFromOrder(o),
        latest_order_at: o.created_at,
        orders: [],
      };
      byEmail.set(email, client);
    }

    client.orders.push(o);

    // Identité « courante » = commande la plus récente (sans écraser l’historique des commandes)
    if (String(o.created_at) >= String(client.latest_order_at)) {
      client.latest_order_at = o.created_at;
      if (o.customer_name) client.name = o.customer_name;
      if (o.customer_phone) client.phone = o.customer_phone;
      if (cityFromOrder(o)) client.city = cityFromOrder(o);
      client.email = o.customer_email || client.email;
    }
  }

  const list = [...byEmail.values()].map((c) => {
    c.orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    c.orders_count = c.orders.length;
    return c;
  });

  list.sort((a, b) =>
    String(a.name || a.email).localeCompare(String(b.name || b.email), "fr", {
      sensitivity: "base",
    }),
  );
  return list;
}

export function filterClients(clients, search = "") {
  const q = String(search || "")
    .trim()
    .toLowerCase();
  if (!q) return clients || [];
  return (clients || []).filter((c) => {
    const blob = [
      c.name,
      c.email,
      c.phone,
      c.city,
      ...c.orders.map((o) =>
        [o.order_number, o.session_id, o.id].filter(Boolean).join(" "),
      ),
    ]
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}

export function mailToHref({ email, subject, body }) {
  if (!email) return null;
  // encodeURIComponent → %20 (pas +) : Outlook et plusieurs clients affichent sinon des « + ».
  const parts = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${email}${parts.length ? `?${parts.join("&")}` : ""}`;
}

export function messageTemplatesFr(orderLabel) {
  const ref = orderLabel || "votre commande";
  return [
    {
      id: "question",
      label: "Question concernant une commande",
      subject: `Fourrures Boréales — ${ref}`,
      body: `Bonjour,\n\nJe vous écris au sujet de ${ref}.\n\n\n\nCordialement,\nLucie — Les Fourrures Boréales`,
    },
    {
      id: "mesures",
      label: "Précisions sur les mesures",
      subject: `Fourrures Boréales — mesures · ${ref}`,
      body: `Bonjour,\n\nPour avancer sur ${ref}, j’aurais besoin de précisions sur vos mesures.\n\n\n\nCordialement,\nLucie — Les Fourrures Boréales`,
    },
    {
      id: "preparation",
      label: "Commande en préparation",
      subject: `Fourrures Boréales — en préparation · ${ref}`,
      body: `Bonjour,\n\nVotre commande (${ref}) est en préparation.\n\nCordialement,\nLucie — Les Fourrures Boréales`,
    },
    {
      id: "expediee",
      label: "Commande expédiée",
      subject: `Fourrures Boréales — expédiée · ${ref}`,
      body: `Bonjour,\n\nVotre commande (${ref}) a été expédiée.\n\nCordialement,\nLucie — Les Fourrures Boréales`,
    },
  ];
}
