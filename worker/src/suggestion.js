/**
 * Suggestions « idée de création » — validation + envoi Resend.
 * Aucune clé exposée au navigateur. Mock local si pas de RESEND_API_KEY.
 */

import { httpError } from "./logic.js";

export const SUGGESTION_MAX_IMAGES = 3;
export const SUGGESTION_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo après traitement
export const SUGGESTION_MAX_NAME = 120;
export const SUGGESTION_MAX_EMAIL = 200;
export const SUGGESTION_MAX_MESSAGE = 4000;
export const SUGGESTION_RATE_LIMIT = 5; // par IP / fenêtre
export const SUGGESTION_RATE_WINDOW_SEC = 60 * 60; // 1 h

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Détection type réel (magic bytes). HEIC/HEIF refusés côté serveur (conversion client obligatoire). */
export function detectImageMime(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // WEBP : RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF : ....ftyp + marqueur
  const ftyp = String.fromCharCode(...bytes.slice(4, 8));
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (
      brand.startsWith("heic") ||
      brand.startsWith("heif") ||
      brand.startsWith("mif1") ||
      brand.startsWith("msf1")
    ) {
      return "image/heic";
    }
  }
  return null;
}

export function decodeBase64ToBytes(b64) {
  const cleaned = String(b64 || "").replace(/\s/g, "");
  if (!cleaned || cleaned.length > SUGGESTION_MAX_BYTES * 2) {
    throw httpError("Image trop volumineuse ou invalide", 400);
  }
  try {
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) {
    throw httpError("Image en base64 invalide", 400);
  }
}

function isValidEmail(email) {
  if (!email || email.length > SUGGESTION_MAX_EMAIL) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valide le corps de suggestion (sans envoi).
 * @returns {{ name, email, message, images: { filename, contentType, bytes }[] }}
 */
export function validateSuggestionPayload(raw) {
  if (!raw || typeof raw !== "object") throw httpError("Requête invalide", 400);

  // Honeypot antispam — doit rester vide
  if (raw.website || raw.company || raw.url_trap) {
    throw httpError("Requête refusée", 400, { spam: true });
  }

  const name = String(raw.name || "").trim();
  const email = String(raw.email || "").trim().toLowerCase();
  const message = String(raw.message || raw.description || "").trim();

  if (!name || name.length > SUGGESTION_MAX_NAME) {
    throw httpError("Nom requis (max 120 caractères)", 400);
  }
  if (!isValidEmail(email)) throw httpError("Adresse courriel invalide", 400);
  if (!message || message.length < 10) {
    throw httpError("Description trop courte (minimum 10 caractères)", 400);
  }
  if (message.length > SUGGESTION_MAX_MESSAGE) {
    throw httpError("Description trop longue", 400);
  }

  const imagesIn = Array.isArray(raw.images) ? raw.images : [];
  if (imagesIn.length > SUGGESTION_MAX_IMAGES) {
    throw httpError("Maximum 3 images", 400);
  }

  const images = [];
  for (let i = 0; i < imagesIn.length; i++) {
    const img = imagesIn[i] || {};
    const data = img.data_base64 || img.dataBase64 || img.content;
    if (!data) throw httpError(`Image ${i + 1} manquante`, 400);
    const bytes = decodeBase64ToBytes(data);
    if (bytes.byteLength > SUGGESTION_MAX_BYTES) {
      throw httpError(`Image ${i + 1} dépasse 5 Mo`, 400);
    }
    const mime = detectImageMime(bytes);
    if (!mime) throw httpError(`Image ${i + 1} : format non reconnu`, 400);
    if (mime === "image/heic") {
      throw httpError(
        `Image ${i + 1} : HEIC/HEIF non accepté côté serveur — convertissez en JPEG/PNG/WEBP`,
        400,
      );
    }
    if (!ALLOWED_MIME.has(mime)) {
      throw httpError(`Image ${i + 1} : type refusé (${mime})`, 400);
    }
    const claimed = String(img.content_type || img.contentType || "").toLowerCase();
    if (claimed && claimed !== mime && !(claimed === "image/jpg" && mime === "image/jpeg")) {
      // le type déclaré ne correspond pas au contenu réel
      throw httpError(`Image ${i + 1} : type déclaré incohérent`, 400);
    }
    let filename = String(img.filename || `photo-${i + 1}`).replace(/[^\w.\-]+/g, "_").slice(0, 80);
    if (mime === "image/jpeg" && !/\.jpe?g$/i.test(filename)) filename += ".jpg";
    if (mime === "image/png" && !/\.png$/i.test(filename)) filename += ".png";
    if (mime === "image/webp" && !/\.webp$/i.test(filename)) filename += ".webp";
    images.push({ filename, contentType: mime, bytes });
  }

  return { name, email, message, images };
}

function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

const memoryRate = new Map();

export async function assertSuggestionRateLimit(env, request) {
  const ip = clientIp(request);
  const key = `suggest-rl:${ip}`;
  const now = Date.now();

  if (env.ORDERS) {
    const raw = await env.ORDERS.get(key);
    let data = { count: 0, start: now };
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (_) {
        /* reset */
      }
    }
    if (now - data.start > SUGGESTION_RATE_WINDOW_SEC * 1000) {
      data = { count: 0, start: now };
    }
    data.count += 1;
    if (data.count > SUGGESTION_RATE_LIMIT) {
      throw httpError("Trop de suggestions. Réessayez plus tard.", 429);
    }
    await env.ORDERS.put(key, JSON.stringify(data), {
      expirationTtl: SUGGESTION_RATE_WINDOW_SEC,
    });
    return;
  }

  // Fallback local sans KV
  let data = memoryRate.get(key) || { count: 0, start: now };
  if (now - data.start > SUGGESTION_RATE_WINDOW_SEC * 1000) {
    data = { count: 0, start: now };
  }
  data.count += 1;
  memoryRate.set(key, data);
  if (data.count > SUGGESTION_RATE_LIMIT) {
    throw httpError("Trop de suggestions. Réessayez plus tard.", 429);
  }
}

/** Exposé pour tests */
export function _resetMemoryRateLimit() {
  memoryRate.clear();
}

function bytesToBase64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Corps texte + HTML chaleureux pour Lucie (français, gros titres, peu de technique). */
export function buildSuggestionEmail({ name, email, message, images }, env) {
  const to = env.SUGGESTION_TO_EMAIL || "luciegosselin852@gmail.com";
  const from =
    env.SUGGESTION_FROM_EMAIL ||
    "Les Fourrures Boréales <onboarding@resend.dev>";
  const subject = `PROPOSITION D'IDÉE — ${name}`;
  const photoCount = images.length;
  const photoLine =
    photoCount === 0
      ? "Aucune photo jointe."
      : photoCount === 1
        ? "1 photo est jointe à ce message (ouvrez la pièce jointe)."
        : `${photoCount} photos sont jointes à ce message (ouvrez les pièces jointes).`;

  const text = [
    "Bonjour Lucie,",
    "",
    "Type : PROPOSITION D'IDÉE (pas une commande payée).",
    "",
    "Une personne vous a écrit une idée de création depuis votre site.",
    "",
    "Qui a écrit ?",
    `  ${name}`,
    "",
    "Son adresse courriel :",
    `  ${email}`,
    "",
    "Son idée :",
    message,
    "",
    photoLine,
    "",
    "Pour lui répondre : cliquez sur « Répondre » dans Gmail.",
    "Votre réponse ira directement à cette personne.",
    "",
    "Les Fourrures Boréales",
  ].join("\n");

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const photoHtml =
    photoCount === 0
      ? "<p style=\"font-size:18px;color:#5c4f44;margin:0;\">Aucune photo jointe.</p>"
      : `<p style="font-size:18px;color:#5c4f44;margin:0 0 8px;">${
          photoCount === 1
            ? "1 photo est jointe à ce courriel."
            : `${photoCount} photos sont jointes à ce courriel.`
        }</p>
         <p style="font-size:16px;color:#7a6a5c;margin:0;">Dans Gmail, regardez en bas du message (trombone / pièces jointes) et ouvrez la ou les photos.</p>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3ebe3;font-family:Georgia,'Times New Roman',serif;color:#2b2420;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3ebe3;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffcf8;border:1px solid #e5d8c8;border-radius:12px;">
        <tr><td style="padding:28px 28px 8px;text-align:center;">
          <p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#965035;">Les Fourrures Boréales</p>
          <p style="margin:10px 0 0;display:inline-block;background:#f4ebe3;color:#965035;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:4px;">Proposition d'idée — pas une commande</p>
          <h1 style="margin:12px 0 0;font-size:28px;font-weight:400;line-height:1.25;color:#2a221c;">Proposition d'idée</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;">
          <p style="margin:0;font-size:18px;line-height:1.5;color:#5c4f44;">Bonjour Lucie,</p>
          <p style="margin:12px 0 0;font-size:18px;line-height:1.55;color:#5c4f44;">Une personne vous a écrit une idée depuis votre site (sans paiement). Voici les détails :</p>
        </td></tr>
        <tr><td style="padding:0 28px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1ea;border-radius:8px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Qui a écrit ?</p>
              <p style="margin:0;font-size:22px;line-height:1.35;color:#2a221c;">${safeName}</p>
              <p style="margin:16px 0 6px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Son courriel</p>
              <p style="margin:0;font-size:20px;line-height:1.35;color:#2a221c;"><a href="mailto:${safeEmail}" style="color:#965035;text-decoration:underline;">${safeEmail}</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 20px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Son idée</p>
          <p style="margin:0;font-size:20px;line-height:1.55;color:#2a221c;">${safeMessage}</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#965035;">Photos</p>
          ${photoHtml}
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2a221c;border-radius:8px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0;font-size:20px;line-height:1.4;color:#fff;">Pour lui répondre</p>
              <p style="margin:10px 0 0;font-size:17px;line-height:1.5;color:#f3ebe3;">Dans Gmail, cliquez sur <strong style="color:#fff;">Répondre</strong>. Votre message ira directement à ${safeName}.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const attachments = images.map((img) => ({
    filename: img.filename,
    content: bytesToBase64(img.bytes),
    content_type: img.contentType,
  }));

  return {
    from,
    to: [to],
    reply_to: email,
    subject,
    text,
    html,
    attachments: attachments.length ? attachments : undefined,
  };
}

/**
 * Envoie via Resend, ou mock si SUGGESTION_MOCK=true / pas de clé.
 */
export async function sendSuggestionEmail(env, payload, fetchImpl = fetch) {
  const body = buildSuggestionEmail(payload, env);
  const mock =
    env.SUGGESTION_MOCK === "true" ||
    !env.RESEND_API_KEY ||
    String(env.RESEND_API_KEY).includes("REMPLACER");

  if (mock) {
    return {
      ok: true,
      mocked: true,
      id: `mock_${Date.now()}`,
      to: body.to,
      attachment_count: payload.images.length,
    };
  }

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    /* ignore */
  }

  if (!res.ok) {
    throw httpError(
      data?.message || data?.error || "Échec d’envoi du courriel",
      res.status >= 400 && res.status < 600 ? res.status : 502,
      { resend: data },
    );
  }

  return { ok: true, mocked: false, id: data.id || null, to: body.to };
}

export async function handleSuggestion(env, request, fetchImpl = fetch) {
  await assertSuggestionRateLimit(env, request);
  let raw;
  try {
    raw = await request.json();
  } catch (_) {
    throw httpError("JSON invalide", 400);
  }
  const payload = validateSuggestionPayload(raw);
  const sent = await sendSuggestionEmail(env, payload, fetchImpl);
  return {
    ok: true,
    mocked: !!sent.mocked,
    message_fr: sent.mocked
      ? "Suggestion acceptée (mode local — courriel non envoyé)."
      : "Merci ! Votre suggestion a été envoyée à Lucie.",
    message_en: sent.mocked
      ? "Suggestion accepted (local mode — email not sent)."
      : "Thank you! Your suggestion was sent to Lucie.",
  };
}
