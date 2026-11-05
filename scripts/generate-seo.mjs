/**
 * Génère SEO local pour Les Fourrures Boréales.
 * Domaine futur : seo/config.json → future_origin (pas encore acheté).
 * N’invente pas de prix / stocks : lit catalog/products.json tel quel.
 * Aucun deploy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "seo/config.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/products.json"), "utf8"));
const ORIGIN = cfg.future_origin.replace(/\/$/, "");

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absUrl(p) {
  if (!p) return ORIGIN + "/";
  if (p.startsWith("http")) return p;
  return ORIGIN + (p.startsWith("/") ? p : "/" + p);
}

function absAsset(rel) {
  if (!rel) return null;
  if (rel.startsWith("http")) return rel;
  return absUrl(rel.replace(/^\.\//, ""));
}

/** Chemins relatifs selon la profondeur (0 = racine, 1 = produits|categories). */
function prefix(depth) {
  return depth > 0 ? "../".repeat(depth) : "";
}

function headerNav(depth = 0) {
  const p = prefix(depth);
  return `<header class="header"><a class="brand" href="${p}index.html"><img src="${p}assets/logo-fourrures-boreales.webp" alt="Les Fourrures Boréales" onerror="this.onerror=null;this.src='${p}assets/logo-fourrures-boreales.png'"><span>LES FOURRURES <strong>BORÉALES</strong></span></a><button class="menu-toggle" aria-expanded="false" aria-controls="main-menu" data-fr="Menu" data-en="Menu">☰ Menu</button><nav id="main-menu" aria-label="Navigation principale"><a href="${p}index.html">Accueil</a><a href="${p}boutique.html">Boutique</a><a href="${p}creations-personnalisees.html">Créations personnalisées</a><a href="${p}creations.html">Nos créations</a><a href="${p}lucie.html">À propos de Lucie</a><a href="${p}contact.html">Contact</a></nav><a class="cart-link" href="${p}panier.html" aria-label="Panier"><span>Panier</span><span id="cart-count" class="cart-count-badge is-empty" data-count="0">0</span></a></header>`;
}

function footerHtml(depth = 0) {
  const p = prefix(depth);
  return `<footer>© <span id="year"></span> Les Fourrures Boréales · <a href="${p}boutique.html">Boutique</a> · <a href="${p}creations-personnalisees.html">Sur mesure</a> · <a href="${p}contact.html">Contact</a></footer><script src="${p}site.js" defer></script>`;
}

function headBlock({ title, description, canonicalPath, ogType = "website", image, jsonLd, noindex = false, depth = 0 }) {
  const canon = absUrl(canonicalPath);
  const img = image ? absAsset(image) : absUrl("/assets/logo-fourrures-boreales.webp");
  const robots = noindex ? "noindex, nofollow" : "index, follow";
  const p = prefix(depth);
  return `<!doctype html>
<html lang="fr-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canon)}">
<meta property="og:locale" content="fr_CA">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="${esc(cfg.site_name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="stylesheet" href="${p}style.css">
<link rel="icon" type="image/png" href="${p}favicon.png" sizes="64x64">
<link rel="apple-touch-icon" href="${p}apple-touch-icon.png">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>`;
}

function patchPublicHead(file, { title, description, canonicalPath, ogImage, jsonLd, noindex = false }) {
  const fp = path.join(root, file);
  let html = fs.readFileSync(fp, "utf8");
  const canon = absUrl(canonicalPath);
  const img = absAsset(ogImage || "assets/logo-fourrures-boreales.webp");
  const robots = noindex ? "noindex, nofollow" : "index, follow";

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  if (/<meta\s+name="description"/i.test(html)) {
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"/i,
      `<meta name="description" content="${esc(description)}"`,
    );
  } else {
    html = html.replace(
      /<meta\s+name="viewport"[^>]*>/i,
      (m) => `${m}\n<meta name="description" content="${esc(description)}">`,
    );
  }

  // robots
  if (/<meta\s+name="robots"/i.test(html)) {
    html = html.replace(/<meta\s+name="robots"\s+content="[^"]*"/i, `<meta name="robots" content="${robots}"`);
  } else {
    html = html.replace(
      /<meta\s+name="description"[^>]*>/i,
      (m) => `${m}\n<meta name="robots" content="${robots}">`,
    );
  }

  // canonical
  if (/rel="canonical"/i.test(html)) {
    html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"/i, `<link rel="canonical" href="${esc(canon)}"`);
  } else {
    html = html.replace(
      /<meta\s+name="robots"[^>]*>/i,
      (m) => `${m}\n<link rel="canonical" href="${esc(canon)}">`,
    );
  }

  // Strip old OG/twitter/json-ld we may re-inject (simple: remove previous generated block markers)
  html = html.replace(/\n?<!-- SEO-GEN-START -->[\s\S]*?<!-- SEO-GEN-END -->\n?/g, "\n");

  const block = `<!-- SEO-GEN-START -->
<meta property="og:locale" content="fr_CA">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.site_name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<!-- SEO-GEN-END -->`;

  html = html.replace(/<link rel="canonical"[^>]*>/i, (m) => `${m}\n${block}`);

  fs.writeFileSync(fp, html);
  return file;
}

/** Ajoute id + data-product-id stables sur chaque carte boutique. */
function patchBoutiqueProducts() {
  const fp = path.join(root, "boutique.html");
  let html = fs.readFileSync(fp, "utf8");
  let patched = 0;
  for (const p of catalog.products) {
    if (html.includes(`id="produit-${p.id}"`)) {
      patched++;
      continue;
    }
    const marker = `data-id="${p.id}"`;
    const btnPos = html.indexOf(marker);
    if (btnPos < 0) continue;
    const artStart = html.lastIndexOf("<article", btnPos);
    if (artStart < 0) continue;
    const tagEnd = html.indexOf(">", artStart);
    if (tagEnd < 0) continue;
    const tag = html.slice(artStart, tagEnd + 1);
    if (tag.includes("id=")) {
      patched++;
      continue;
    }
    const nextTag = tag.replace(
      '<article class="shop-product"',
      `<article class="shop-product" id="produit-${p.id}" data-product-id="${p.id}"`,
    );
    html = html.slice(0, artStart) + nextTag + html.slice(tagEnd + 1);
    patched++;
  }

  // Accueil boutique épuré : pas de nav SEO / intro / bannière réinjectées ici
  // (catégories = sidebar filtres ; SEO = pages categories/*.html)

  fs.writeFileSync(fp, html);
  return patched;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function writeCategoryPages() {
  ensureDir(path.join(root, "categories"));
  const byCat = {};
  for (const p of catalog.products) {
    (byCat[p.category] ||= []).push(p);
  }
  const pages = [];
  for (const [catId, meta] of Object.entries(cfg.categories)) {
    const items = byCat[catId] || [];
    const list = items
      .map((p) => {
        const href = `../produits/${p.id}.html`;
        const img = p.image || "";
        return `<li class="shop-product" style="list-style:none;margin:0 0 1.25rem;">
  <a href="${esc(href)}" style="text-decoration:none;color:inherit;display:grid;gap:.5rem;">
    <img src="../${esc(img)}" alt="${esc(p.name_fr)} — ${esc(p.description_fr || meta.label_fr)}" width="400" height="300" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;">
    <strong>${esc(p.name_fr)}</strong>
    <span>N° ${esc(String(p.product_number))} · ${esc(meta.label_fr)}</span>
  </a>
  <p><a href="../boutique.html#produit-${esc(p.id)}">Voir dans la boutique</a></p>
</li>`;
      })
      .join("\n");

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: absUrl("/") },
            { "@type": "ListItem", position: 2, name: "Boutique", item: absUrl("/boutique") },
            { "@type": "ListItem", position: 3, name: meta.label_fr, item: absUrl(`/categories/${catId}`) },
          ],
        },
        {
          "@type": "CollectionPage",
          name: meta.label_fr,
          description: meta.description,
          url: absUrl(`/categories/${catId}`),
          isPartOf: { "@type": "WebSite", name: cfg.site_name, url: absUrl("/") },
        },
      ],
    };

    const html = `${headBlock({
      title: meta.title,
      description: meta.description,
      canonicalPath: `/categories/${catId}`,
      jsonLd,
      depth: 1,
    })}
<body class="shop-page">
${headerNav(1)}
<main style="padding:1.25rem 1rem 2.5rem;max-width:960px;margin:0 auto;">
  <nav aria-label="Fil d'Ariane" style="font-size:.9rem;margin-bottom:.75rem;"><a href="../index.html">Accueil</a> · <a href="../boutique.html">Boutique</a> · <span>${esc(meta.label_fr)}</span></nav>
  <h1>${esc(meta.label_fr)}</h1>
  <p style="max-width:40rem;line-height:1.55;">${esc(meta.description)} Créations artisanales de Lucie — Les Fourrures Boréales.</p>
  <p><a href="../boutique.html">Toute la boutique</a> · <a href="../creations-personnalisees.html">Articles en fourrure sur mesure</a></p>
  <ul style="display:grid;gap:1rem;padding:0;margin:1.5rem 0 0;">${list || "<li>Aucun article dans cette catégorie pour le moment.</li>"}</ul>
</main>
${footerHtml(1)}
</body></html>`;
    const out = path.join(root, "categories", `${catId}.html`);
    fs.writeFileSync(out, html);
    pages.push(`categories/${catId}.html`);
  }
  return pages;
}

function writeProductPages() {
  ensureDir(path.join(root, "produits"));
  const pages = [];
  for (const p of catalog.products) {
    const cat = cfg.categories[p.category] || { label_fr: p.category, title: p.category };
    const price = Number(p.price_cad);
    const desc =
      `${p.name_fr}. ${p.description_fr || cat.label_fr}. Création artisanale québécoise — Les Fourrures Boréales.`.slice(
        0,
        160,
      );
    const title = `${p.name_fr} | ${cat.label_fr} | Les Fourrures Boréales`;
    const productLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: absUrl("/") },
            { "@type": "ListItem", position: 2, name: "Boutique", item: absUrl("/boutique") },
            {
              "@type": "ListItem",
              position: 3,
              name: cat.label_fr,
              item: absUrl(`/categories/${p.category}`),
            },
            {
              "@type": "ListItem",
              position: 4,
              name: p.name_fr,
              item: absUrl(`/produits/${p.id}`),
            },
          ],
        },
        {
          "@type": "Product",
          name: p.name_fr,
          description: p.description_fr || desc,
          sku: String(p.product_number),
          image: p.image ? [absAsset(p.image)] : undefined,
          brand: { "@type": "Brand", name: "Les Fourrures Boréales" },
          category: cat.label_fr,
          offers: {
            "@type": "Offer",
            url: absUrl(`/produits/${p.id}`),
            priceCurrency: "CAD",
            price: price.toFixed(2),
            availability: "https://schema.org/LimitedAvailability",
          },
        },
      ],
    };

    const html = `${headBlock({
      title,
      description: desc,
      canonicalPath: `/produits/${p.id}`,
      ogType: "product",
      image: p.image,
      jsonLd: productLd,
      depth: 1,
    })}
<body>
${headerNav(1)}
<main style="padding:1.25rem 1rem 2.5rem;max-width:720px;margin:0 auto;">
  <nav aria-label="Fil d'Ariane" style="font-size:.9rem;margin-bottom:.75rem;">
    <a href="../index.html">Accueil</a> · <a href="../boutique.html">Boutique</a> · <a href="../categories/${esc(p.category)}.html">${esc(cat.label_fr)}</a> · <span>${esc(p.name_fr)}</span>
  </nav>
  <article>
    <h1>${esc(p.name_fr)}</h1>
    <p style="color:#666;">N° ${esc(String(p.product_number))} · ${esc(cat.label_fr)}</p>
    ${
      p.image
        ? `<p><img src="../${esc(p.image)}" alt="${esc(p.name_fr)} — ${esc(p.description_fr || cat.label_fr)}" width="800" height="600" style="max-width:100%;height:auto;border-radius:12px;" loading="eager"></p>`
        : ""
    }
    <p style="line-height:1.55;">${esc(p.description_fr || "")}</p>
    <p style="font-size:1.25rem;"><strong>${esc(price.toFixed(2).replace(".", ","))} $</strong> CAD</p>
    <p style="line-height:1.55;">Création artisanale québécoise de Les Fourrures Boréales. Pour une pièce adaptée à vos mesures, voir aussi les <a href="../creations-personnalisees.html">articles en fourrure sur mesure</a>.</p>
    <p style="display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.25rem;">
      <a class="button" href="../boutique.html#produit-${esc(p.id)}">Voir dans la boutique</a>
      <a class="button button-ghost" href="../categories/${esc(p.category)}.html">Autres ${esc(cat.label_fr).toLowerCase()}</a>
      <a class="button button-ghost" href="../contact.html">Contacter Lucie</a>
    </p>
  </article>
</main>
${footerHtml(1)}
</body></html>`;
    fs.writeFileSync(path.join(root, "produits", `${p.id}.html`), html);
    pages.push(`produits/${p.id}.html`);
  }
  return pages;
}

function writeRobots() {
  const body = `# Les Fourrures Boréales — robots.txt (préparé pour ${ORIGIN})
# Domaine : achat prévu — NE PAS soumettre le sitemap à Google tant que le site n'est pas publié officiellement.

User-agent: *
Allow: /
Allow: /boutique
Allow: /categories/
Allow: /produits/
Allow: /creations
Allow: /creations-personnalisees
Allow: /lucie
Allow: /contact
Allow: /assets/

# Pages transactionnelles / privées (robots.txt ≠ authentification)
Disallow: /panier
Disallow: /panier.html
Disallow: /paiement
Disallow: /paiement.html
Disallow: /commande-confirmee
Disallow: /commande-confirmee.html
Disallow: /commande-annulee
Disallow: /commande-annulee.html
Disallow: /inventory/
Disallow: /orders/
Disallow: /worker/
Disallow: /docs/
Disallow: /seo/
Disallow: /scripts/
Disallow: /log/

Sitemap: ${ORIGIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(root, "robots.txt"), body);
}

function writeSitemap(paths) {
  const urls = paths
    .map((p) => {
      let clean = String(p).replace(/\\/g, "/");
      if (clean === "index.html") clean = "/";
      else if (clean.endsWith(".html")) clean = "/" + clean.slice(0, -5);
      else clean = clean.startsWith("/") ? clean : "/" + clean;
      return `  <url>\n    <loc>${esc(absUrl(clean))}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Préparé pour ${ORIGIN}. Ne pas soumettre à Search Console avant publication officielle. Domaine pas encore acheté. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  fs.writeFileSync(path.join(root, "sitemap.xml"), xml);
}

function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: cfg.organization.name,
    alternateName: cfg.organization.alternateName,
    url: absUrl("/"),
    email: cfg.organization.email,
    telephone: cfg.organization.telephone,
    areaServed: cfg.organization.areaServed,
    logo: absUrl("/assets/logo-fourrures-boreales.webp"),
  };
}

function boutiqueItemListLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Boutique Les Fourrures Boréales",
    numberOfItems: catalog.products.length,
    itemListElement: catalog.products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(`/produits/${p.id}`),
      name: p.name_fr,
    })),
  };
}

// ── main ──────────────────────────────────────────────────────────
const patchedCards = patchBoutiqueProducts();
const catPages = writeCategoryPages();
const prodPages = writeProductPages();
writeRobots();

const publicPages = [
  {
    file: "index.html",
    title: "Les Fourrures Boréales | Créations artisanales québécoises",
    description:
      "Les Fourrures Boréales — mitaines en fourrure recyclée, chapeaux, pantoufles, mukluks et créations artisanales québécoises. Boutique et sur mesure.",
    canonicalPath: "/",
    jsonLd: organizationLd(),
  },
  {
    file: "boutique.html",
    title: "Boutique | Mitaines, chapeaux, pantoufles et mukluks | Les Fourrures Boréales",
    description:
      "Boutique Les Fourrures Boréales : mitaines en fourrure recyclée, chapeaux en fourrure, pantoufles, mukluks et accessoires artisanaux québécois.",
    canonicalPath: "/boutique",
    jsonLd: boutiqueItemListLd(),
  },
  {
    file: "creations-personnalisees.html",
    title: "Créations personnalisées et fourrure sur mesure | Les Fourrures Boréales",
    description:
      "Commandez des articles en fourrure sur mesure ou proposez une idée à Lucie — créations artisanales québécoises, Les Fourrures Boréales.",
    canonicalPath: "/creations-personnalisees",
  },
  {
    file: "creations.html",
    title: "Nos créations portées | Les Fourrures Boréales",
    description:
      "Voir les créations artisanales des Fourrures Boréales portées : chaleur, style et savoir-faire québécois.",
    canonicalPath: "/creations",
  },
  {
    file: "lucie.html",
    title: "À propos de Lucie | Artisane des Fourrures Boréales",
    description:
      "Rencontrez Lucie, artisane abitibienne derrière Les Fourrures Boréales — créations en fourrure recyclée faites avec soin.",
    canonicalPath: "/lucie",
  },
  {
    file: "contact.html",
    title: "Contact | Les Fourrures Boréales",
    description:
      "Contactez Les Fourrures Boréales pour une commande, les tailles ou une création sur mesure.",
    canonicalPath: "/contact",
  },
  {
    file: "sur-mesure.html",
    title: "Sur mesure | Les Fourrures Boréales",
    description:
      "Créations sur mesure — redirigé vers les créations personnalisées des Fourrures Boréales.",
    canonicalPath: "/creations-personnalisees#mesure",
  },
];

for (const p of publicPages) patchPublicHead(p.file, p);

// noindex privés — conserver titres existants
for (const file of ["panier.html", "paiement.html", "commande-confirmee.html", "commande-annulee.html"]) {
  const fp = path.join(root, file);
  let html = fs.readFileSync(fp, "utf8");
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  const descM = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  patchPublicHead(file, {
    title: titleM ? titleM[1] : file,
    description: descM ? descM[1] : "Page privée — non indexée.",
    canonicalPath: "/" + file.replace(".html", ""),
    noindex: true,
  });
}

const sitemapPaths = [
  "index.html",
  "boutique.html",
  "creations-personnalisees.html",
  "creations.html",
  "lucie.html",
  "contact.html",
  ...catPages,
  ...prodPages,
];
writeSitemap(sitemapPaths);

// serve.json rewrites for categories + produits
const servePath = path.join(root, "serve.json");
const serve = JSON.parse(fs.readFileSync(servePath, "utf8"));
const needed = [
  { source: "/robots.txt", destination: "/robots.txt" },
  { source: "/sitemap.xml", destination: "/sitemap.xml" },
];
for (const cat of Object.keys(cfg.categories)) {
  needed.push({ source: `/categories/${cat}`, destination: `/categories/${cat}.html` });
}
for (const p of catalog.products) {
  needed.push({ source: `/produits/${p.id}`, destination: `/produits/${p.id}.html` });
}
const existing = new Set((serve.rewrites || []).map((r) => r.source));
for (const r of needed) {
  if (!existing.has(r.source)) serve.rewrites.push(r);
}
fs.writeFileSync(servePath, JSON.stringify(serve, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      ok: true,
      future_origin: ORIGIN,
      indexing_active: cfg.indexing_active,
      domain_status: cfg.domain_status,
      boutique_cards_patched: patchedCards,
      categories: catPages.length,
      products: prodPages.length,
      sitemap_urls: sitemapPaths.length,
    },
    null,
    2,
  ),
);
