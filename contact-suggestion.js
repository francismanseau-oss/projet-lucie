(() => {
  "use strict";

  const MAX_IMAGES = 3;
  const MAX_BYTES = 5 * 1024 * 1024;
  const ACCEPT_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
  const HEIC_MIME = /image\/(heic|heif)/i;

  const eng = () => document.documentElement.lang.startsWith("en");
  const t = (fr, en) => (eng() ? en : fr);

  const form = document.getElementById("idea-form");
  if (!form) return;

  const els = {
    name: document.getElementById("idea-name"),
    email: document.getElementById("idea-email"),
    message: document.getElementById("idea-message"),
    file: document.getElementById("idea-files"),
    pick: document.getElementById("idea-pick"),
    photoCount: document.getElementById("idea-photo-count"),
    previews: document.getElementById("idea-previews"),
    submit: document.getElementById("idea-submit"),
    msg: document.getElementById("idea-msg"),
    honeypot: document.getElementById("idea-website"),
  };

  /** @type {{ file: File, blob: Blob, previewUrl: string, name: string, type: string }[]} */
  let images = [];

  function apiBase() {
    const cfg = window.BOREALES_CHECKOUT || {};
    return String(cfg.apiBase || "").replace(/\/$/, "");
  }

  function showMsg(kind, fr, en) {
    els.msg.hidden = false;
    els.msg.className = "idea-msg " + (kind === "ok" ? "is-ok" : "is-err");
    els.msg.textContent = t(fr, en);
  }

  function clearMsg() {
    els.msg.hidden = true;
    els.msg.textContent = "";
    els.msg.className = "idea-msg";
  }

  function loadHeic2Any() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.async = true;
      s.onload = () =>
        window.heic2any ? resolve(window.heic2any) : reject(new Error("heic2any"));
      s.onerror = () => reject(new Error("heic2any_cdn"));
      document.head.appendChild(s);
    });
  }

  function isHeicFile(file) {
    return HEIC_MIME.test(file.type) || /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
  }

  async function convertHeic(file) {
    try {
      const heic2any = await loadHeic2Any();
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const blob = Array.isArray(out) ? out[0] : out;
      if (!(blob instanceof Blob)) throw new Error("empty");
      return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch (_) {
      throw new Error("HEIC_FAIL");
    }
  }

  function readAsImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode"));
      };
      img.src = url;
    });
  }

  async function compressImage(file) {
    let working = file;
    if (isHeicFile(file)) {
      working = await convertHeic(file);
    }

    if (!/^image\/(jpeg|png|webp)$/i.test(working.type) && !ACCEPT_EXT.test(working.name)) {
      throw new Error("TYPE");
    }

    // Déjà petit JPEG/PNG/WEBP sous la limite → garder si possible
    if (working.size <= MAX_BYTES && /^image\/(jpeg|png|webp)$/i.test(working.type)) {
      // Re-compress mildly for PNG that might be huge after? only if over later
      const { img, url } = await readAsImage(working);
      URL.revokeObjectURL(url);
      return { blob: working, name: working.name, type: working.type || "image/jpeg", width: img.width };
    }

    const { img, url } = await readAsImage(working);
    try {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const maxEdge = 2000;
      if (w > maxEdge || h > maxEdge) {
        const r = Math.min(maxEdge / w, maxEdge / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.85;
      let blob = null;
      for (let i = 0; i < 8; i++) {
        blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
        if (!blob) break;
        if (blob.size <= MAX_BYTES) break;
        quality -= 0.1;
        if (quality < 0.45) {
          // shrink dimensions further
          w = Math.round(w * 0.85);
          h = Math.round(h * 0.85);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          quality = 0.75;
        }
      }
      if (!blob || blob.size > MAX_BYTES) throw new Error("SIZE");
      const base = (working.name || "photo").replace(/\.[^.]+$/, "");
      return {
        blob,
        name: base + ".jpg",
        type: "image/jpeg",
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function updatePhotoCount() {
    if (!els.photoCount) return;
    const n = images.length;
    els.photoCount.textContent = t(
      n + " / 3 photo" + (n > 1 ? "s" : ""),
      n + " / 3 photo" + (n === 1 ? "" : "s"),
    );
    els.photoCount.classList.toggle("is-full", n >= MAX_IMAGES);
    if (els.pick) els.pick.disabled = n >= MAX_IMAGES;
  }

  function renderPreviews() {
    els.previews.innerHTML = "";
    updatePhotoCount();
    images.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "idea-preview";
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = item.name;
      const meta = document.createElement("p");
      meta.className = "idea-preview-meta";
      meta.textContent =
        item.name + " · " + (item.blob.size / 1024).toFixed(0) + " Ko";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "idea-preview-remove";
      rm.setAttribute("aria-label", t("Retirer l’image", "Remove image"));
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        URL.revokeObjectURL(item.previewUrl);
        images.splice(index, 1);
        renderPreviews();
      });
      card.appendChild(img);
      card.appendChild(meta);
      card.appendChild(rm);
      els.previews.appendChild(card);
    });
  }

  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  if (els.pick && els.file) {
    els.pick.addEventListener("click", () => els.file.click());
  }
  updatePhotoCount();

  els.file.addEventListener("change", async () => {
    clearMsg();
    const files = Array.from(els.file.files || []);
    els.file.value = "";
    for (const file of files) {
      if (images.length >= MAX_IMAGES) {
        showMsg("err", "Maximum 3 images.", "Maximum 3 images.");
        break;
      }
      if (!ACCEPT_EXT.test(file.name) && !/^image\//i.test(file.type)) {
        showMsg(
          "err",
          "Format non accepté. Utilisez JPG, PNG, WEBP ou HEIC.",
          "Unsupported format. Use JPG, PNG, WEBP or HEIC.",
        );
        continue;
      }
      try {
        els.submit.disabled = true;
        const processed = await compressImage(file);
        if (processed.blob.size > MAX_BYTES) throw new Error("SIZE");
        const previewUrl = URL.createObjectURL(processed.blob);
        images.push({
          blob: processed.blob,
          previewUrl,
          name: processed.name,
          type: processed.type,
        });
        renderPreviews();
      } catch (e) {
        if (String(e.message) === "HEIC_FAIL") {
          showMsg(
            "err",
            "Impossible de convertir cette photo HEIC. Sur iPhone : Photos → photo → Partager → Enregistrer en JPEG, ou choisissez une autre image JPG/PNG.",
            "Could not convert this HEIC photo. On iPhone: Photos → Share → Save as JPEG, or choose a JPG/PNG instead.",
          );
        } else if (String(e.message) === "SIZE") {
          showMsg(
            "err",
            "Image trop lourde même après compression (max 5 Mo).",
            "Image still too large after compression (max 5 MB).",
          );
        } else {
          showMsg(
            "err",
            "Impossible de lire cette image.",
            "Could not read this image.",
          );
        }
      } finally {
        els.submit.disabled = false;
      }
    }
  });

  function syncPlaceholders() {
    const ta = els.message;
    if (!ta) return;
    const fr = ta.getAttribute("data-fr-placeholder");
    const enPh = ta.getAttribute("data-en-placeholder");
    if (fr && enPh) ta.placeholder = eng() ? enPh : fr;
  }
  document.querySelectorAll("[data-set-lang]").forEach((b) => {
    b.addEventListener("click", () => setTimeout(syncPlaceholders, 0));
  });
  syncPlaceholders();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsg();

    if (els.honeypot && els.honeypot.value) {
      // Bot : message neutre — ne jamais prétendre qu’un vrai courriel a été envoyé.
      showMsg(
        "ok",
        "Merci. Votre demande a été reçue.",
        "Thank you. Your request was received.",
      );
      form.reset();
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      images = [];
      renderPreviews();
      return;
    }

    const name = (els.name.value || "").trim();
    const email = (els.email.value || "").trim();
    const message = (els.message.value || "").trim();
    if (!name || !email || message.length < 10) {
      showMsg(
        "err",
        "Veuillez remplir le nom, le courriel et une description (10 caractères min.).",
        "Please fill in name, email and a description (min. 10 characters).",
      );
      return;
    }

    const base = apiBase();
    if (!base) {
      showMsg(
        "err",
        "Configuration manquante (adresse du serveur). Contactez Lucie par courriel pour l’instant.",
        "Missing server URL. Please email Lucie for now.",
      );
      return;
    }

    els.submit.disabled = true;
    showMsg("ok", "Envoi en cours…", "Sending…");

    try {
      const payloadImages = [];
      for (const item of images) {
        payloadImages.push({
          filename: item.name,
          content_type: item.type,
          data_base64: await blobToBase64(item.blob),
        });
      }

      const res = await fetch(base + "/api/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          website: els.honeypot ? els.honeypot.value : "",
          images: payloadImages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      // Préférer les messages serveur (mock = courriel non envoyé ; réel = envoyé).
      const okFr =
        data.message_fr ||
        (data.mocked
          ? "Suggestion acceptée (mode local — courriel non envoyé)."
          : "Merci ! Votre suggestion a été transmise.");
      const okEn =
        data.message_en ||
        (data.mocked
          ? "Suggestion accepted (local mode — email not sent)."
          : "Thank you! Your suggestion was submitted.");
      showMsg("ok", okFr, okEn);
      form.reset();
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      images = [];
      renderPreviews();
    } catch (err) {
      const m = String(err && err.message ? err.message : err);
      showMsg(
        "err",
        "Envoi impossible : " + m + " Vous pouvez aussi écrire à luciegosselin852@gmail.com.",
        "Could not send: " + m + " You can also email luciegosselin852@gmail.com.",
      );
    } finally {
      els.submit.disabled = false;
    }
  });
})();
