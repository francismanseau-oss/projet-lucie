/** Agrégation clients côté navigateur (depuis /api/orders). */

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function cityFromOrder(o) {
  return o?.shipping_address?.city || null;
}

/** Rue + appartement (line2) pour le tableau — une ligne. */
export function streetLineFromAddress(addr) {
  if (!addr || typeof addr !== "object") return null;
  const street = String(addr.line1 || "").trim();
  const apt = String(addr.line2 || "").trim();
  if (!street && !apt) return null;
  if (street && apt) return `${street}, ${apt}`;
  return street || apt;
}

export function buildClientDirectory(orders) {
  const byEmail = new Map();

  for (const o of orders || []) {
    const email = normalizeEmail(o.customer_email);
    if (!email) continue;

    let client = byEmail.get(email);
    if (!client) {
      client = {
        key: email,
        email: o.customer_email,
        client_number: o.client_number ?? null,
        name: o.customer_name || "Non fourni",
        phone: o.customer_phone || null,
        address: streetLineFromAddress(o.shipping_address),
        city: cityFromOrder(o),
        latest_order_at: o.created_at,
        orders: [],
      };
      byEmail.set(email, client);
    }

    client.orders.push(o);
    if (o.client_number != null && client.client_number == null) {
      client.client_number = o.client_number;
    }

    if (String(o.created_at) >= String(client.latest_order_at || "")) {
      client.latest_order_at = o.created_at;
      if (o.customer_name) client.name = o.customer_name;
      if (o.customer_phone) client.phone = o.customer_phone;
      const street = streetLineFromAddress(o.shipping_address);
      if (street) client.address = street;
      if (cityFromOrder(o)) client.city = cityFromOrder(o);
      client.email = o.customer_email || client.email;
      if (o.client_number != null) client.client_number = o.client_number;
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
      c.client_number,
      c.name,
      c.email,
      c.phone,
      c.address,
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

export function telHref(phone) {
  const n = String(phone || "").replace(/[^\d+]/g, "");
  return n ? `tel:${n}` : null;
}

/** Liens cliquables courriel / téléphone (affichage admin). */
export function contactLinksHtml(email, phone, escapeHtml) {
  const mail = email
    ? `<a class="contact-link" href="${escapeHtml(mailToHref({ email }) || "#")}">${escapeHtml(
        email,
      )}</a>`
    : "Non fourni";
  const tel = telHref(phone);
  const phoneHtml = tel
    ? `<a class="contact-link" href="${escapeHtml(tel)}">${escapeHtml(phone)}</a>`
    : "Non fourni";
  return { mail, phone: phoneHtml };
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

export function orderLabel(o) {
  if (o?.order_number) return o.order_number;
  const sid = String(o?.session_id || o?.id || "");
  if (!sid) return "commande";
  if (sid.length > 18) return sid.slice(0, 18) + "…";
  return sid;
}

export function formatAddress(addr) {
  if (!addr || typeof addr !== "object") return "";
  return [addr.line1, addr.line2, [addr.city, addr.state].filter(Boolean).join(", "), addr.postal_code, addr.country]
    .filter((x) => x && String(x).trim())
    .join("\n");
}
