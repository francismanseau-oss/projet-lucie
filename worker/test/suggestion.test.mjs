import test from "node:test";
import assert from "node:assert/strict";
import {
  detectImageMime,
  validateSuggestionPayload,
  buildSuggestionEmail,
  sendSuggestionEmail,
  handleSuggestion,
  _resetMemoryRateLimit,
  SUGGESTION_MAX_BYTES,
} from "../src/suggestion.js";

function jpegBytes(size = 64) {
  const b = new Uint8Array(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  return b;
}

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function heicBytes() {
  const b = new Uint8Array(20);
  b[4] = 0x66;
  b[5] = 0x74;
  b[6] = 0x79;
  b[7] = 0x70; // ftyp
  b[8] = 0x68;
  b[9] = 0x65;
  b[10] = 0x69;
  b[11] = 0x63; // heic
  return b;
}

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

test("detectImageMime : jpeg / png / heic", () => {
  assert.equal(detectImageMime(jpegBytes()), "image/jpeg");
  assert.equal(detectImageMime(pngBytes()), "image/png");
  assert.equal(detectImageMime(heicBytes()), "image/heic");
});

test("validateSuggestionPayload : champs requis + honeypot", () => {
  assert.throws(() => validateSuggestionPayload({ name: "", email: "a@b.c", message: "hello world!" }), /Nom/);
  assert.throws(
    () =>
      validateSuggestionPayload({
        name: "A",
        email: "a@b.c",
        message: "hello world!",
        website: "http://spam",
      }),
    /refusée/,
  );
  const ok = validateSuggestionPayload({
    name: "Marie",
    email: "marie@example.com",
    message: "J’aimerais des mitaines plus longues pour l’hiver.",
  });
  assert.equal(ok.images.length, 0);
});

test("validateSuggestionPayload : refuse HEIC serveur + taille", () => {
  assert.throws(
    () =>
      validateSuggestionPayload({
        name: "Marie",
        email: "marie@example.com",
        message: "Une idée avec photo HEIC encore non convertie.",
        images: [{ filename: "x.heic", data_base64: b64(heicBytes()) }],
      }),
    /HEIC/,
  );

  const big = jpegBytes(SUGGESTION_MAX_BYTES + 10);
  assert.throws(
    () =>
      validateSuggestionPayload({
        name: "Marie",
        email: "marie@example.com",
        message: "Photo trop lourde après traitement.",
        images: [{ filename: "big.jpg", data_base64: b64(big) }],
      }),
    /5 Mo/,
  );
});

test("validateSuggestionPayload : accepte JPEG réel", () => {
  const ok = validateSuggestionPayload({
    name: "Marie",
    email: "marie@example.com",
    message: "Voici une photo de référence pour mon idée.",
    images: [
      {
        filename: "ref.jpg",
        content_type: "image/jpeg",
        data_base64: b64(jpegBytes(128)),
      },
    ],
  });
  assert.equal(ok.images.length, 1);
  assert.equal(ok.images[0].contentType, "image/jpeg");
});

test("buildSuggestionEmail : destinataire Lucie + reply_to client", () => {
  const payload = validateSuggestionPayload({
    name: "Marie",
    email: "marie@example.com",
    message: "Idée de foulard en castor.",
  });
  const mail = buildSuggestionEmail(payload, {
    SUGGESTION_TO_EMAIL: "luciegosselin852@gmail.com",
    SUGGESTION_FROM_EMAIL: "ideas@mail.example.com",
  });
  assert.deepEqual(mail.to, ["luciegosselin852@gmail.com"]);
  assert.equal(mail.reply_to, "marie@example.com");
  assert.match(mail.subject, /PROPOSITION D'IDÉE/);
  assert.match(mail.subject, /Marie/);
  assert.match(mail.html, /Proposition d'idée/);
  assert.match(mail.html, /pas une commande/);
  assert.match(mail.text, /PROPOSITION D'IDÉE/);
  assert.match(mail.text, /cliquez sur « Répondre »/);
});

test("sendSuggestionEmail : mock sans clé Resend", async () => {
  const payload = validateSuggestionPayload({
    name: "Marie",
    email: "marie@example.com",
    message: "Test local sans compte Resend.",
  });
  const r = await sendSuggestionEmail({ SUGGESTION_MOCK: "true" }, payload, async () => {
    throw new Error("ne doit pas appeler le réseau");
  });
  assert.equal(r.mocked, true);
  assert.equal(r.ok, true);
});

test("sendSuggestionEmail : appelle Resend si clé présente", async () => {
  const payload = validateSuggestionPayload({
    name: "Marie",
    email: "marie@example.com",
    message: "Test avec mock fetch Resend.",
    images: [{ filename: "a.jpg", data_base64: b64(jpegBytes()) }],
  });
  let called = false;
  const r = await sendSuggestionEmail(
    {
      RESEND_API_KEY: "re_test_fake",
      SUGGESTION_FROM_EMAIL: "ideas@mail.example.com",
      SUGGESTION_TO_EMAIL: "luciegosselin852@gmail.com",
    },
    payload,
    async (url, init) => {
      called = true;
      assert.match(url, /api\.resend\.com/);
      const body = JSON.parse(init.body);
      assert.equal(body.attachments.length, 1);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "email_123" }),
      };
    },
  );
  assert.equal(called, true);
  assert.equal(r.mocked, false);
  assert.equal(r.id, "email_123");
});

test("handleSuggestion : rate limit après N envois", async () => {
  _resetMemoryRateLimit();
  const env = { SUGGESTION_MOCK: "true" };
  const mkReq = () =>
    new Request("http://localhost/api/suggestion", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: JSON.stringify({
        name: "Marie",
        email: "marie@example.com",
        message: "Suggestion pour tester la limite antispam horaire.",
      }),
    });

  for (let i = 0; i < 5; i++) {
    const out = await handleSuggestion(env, mkReq());
    assert.equal(out.ok, true);
  }
  await assert.rejects(() => handleSuggestion(env, mkReq()), /Trop de suggestions/);
  _resetMemoryRateLimit();
});
