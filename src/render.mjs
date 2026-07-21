const SITE_NAME = "TradeVisionPro";
const SITE_TAGLINE = "Financial Training";
let SITE_BASE_PATH = "/";

export function configureSite({ basePath = "/" } = {}) {
  const normalized = `/${String(basePath).trim().replace(/^\/+|\/+$/g, "")}/`;
  SITE_BASE_PATH = normalized === "//" ? "/" : normalized;
  return SITE_BASE_PATH;
}

export function sitePath(value = "/") {
  const pathname = `/${String(value).replace(/^\/+/, "")}`;
  if (SITE_BASE_PATH === "/") return pathname;
  return `${SITE_BASE_PATH}${pathname.slice(1)}`;
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHref(value = "") {
  const href = String(value).trim();
  if (/^(?:https?:\/\/|mailto:|#)/i.test(href)) return href;
  return href.startsWith("/") ? sitePath(href) : "#";
}

function externalAttributes(href) {
  return /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
}

export function linkifyText(value = "") {
  const expression = /(https?:\/\/[^\s<]+[^\s<.,;:!?\])}])/giu;
  let cursor = 0;
  let html = "";
  for (const match of String(value).matchAll(expression)) {
    html += escapeHtml(String(value).slice(cursor, match.index));
    const href = safeHref(match[0]);
    html += `<a href="${escapeHtml(href)}"${externalAttributes(href)}>${escapeHtml(match[0])}</a>`;
    cursor = Number(match.index) + match[0].length;
  }
  return html + escapeHtml(String(value).slice(cursor)).replaceAll("\n", "<br>");
}

export function renderSegments(segments = [], fallback = "") {
  if (!segments.length) return linkifyText(fallback);
  return segments
    .map((segment) => {
      let content = linkifyText(segment.text || "");
      if (segment.bold) content = `<strong>${content}</strong>`;
      if (segment.italic) content = `<em>${content}</em>`;
      if (segment.underline) content = `<span class="text-underline">${content}</span>`;
      if (segment.href) {
        const href = safeHref(segment.href);
        content = `<a href="${escapeHtml(href)}"${externalAttributes(href)}>${content}</a>`;
      }
      return content;
    })
    .join("");
}

export function blockPlainText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockPlainText).join(" ");
  if (!value || typeof value !== "object") return "";
  const ignored = new Set([
    "type",
    "id",
    "src",
    "href",
    "variant",
    "sourceFill",
    "originalName",
    "schemaVersion",
    "segments",
    "links",
    "sourceLinks",
    "width",
    "height",
    "optimized",
    "ordered",
    "scope",
  ]);
  return Object.entries(value)
    .filter(([key]) => !ignored.has(key))
    .map(([, child]) => blockPlainText(child))
    .join(" ");
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value || 0);
}

function renderDefinitionItem(item) {
  const text = item.text || "";
  const match = text.match(/^([^:\n]{1,70})\s*:\s+(.+)$/s);
  if (match) {
    return `<li><strong>${escapeHtml(match[1])} :</strong> ${linkifyText(match[2])}</li>`;
  }
  return `<li>${renderSegments(item.segments, text)}</li>`;
}

const CALLOUT_ICONS = {
  info: "i",
  principle: "◆",
  warning: "!",
  mnemonic: "ƒ",
  summary: "✓",
  disclaimer: "§",
  note: "•",
  default: "·",
};

function renderCallout(block) {
  const variant = block.variant || "default";
  return `<aside class="callout callout--${escapeHtml(variant)}" role="note">
    <div class="callout__icon" aria-hidden="true">${CALLOUT_ICONS[variant] || CALLOUT_ICONS.default}</div>
    <div><p class="callout__label">${escapeHtml(block.label || "À noter")}</p>
    <p class="callout__body">${linkifyText(block.text || "")}</p></div>
  </aside>`;
}

function renderStatRow(block) {
  return `<section class="stat-row breakout" aria-label="Chiffres clés">
    ${block.stats
      .map(
        (stat) => `<div class="stat-row__item"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(
          stat.label,
        )}</span></div>`,
      )
      .join("")}
  </section>`;
}

function renderDataTable(block) {
  const headers = block.headers || [];
  return `<div class="data-table breakout" role="region" aria-label="Tableau de données" tabindex="0">
    <table>
      <thead><tr>${headers.map((header) => `<th scope="col">${linkifyText(header)}</th>`).join("")}</tr></thead>
      <tbody>${(block.rows || [])
        .map(
          (row) => `<tr>${row
            .map(
              (cell, index) => `<td data-label="${escapeHtml(headers[index] || "Valeur")}">${linkifyText(cell)}</td>`,
            )
            .join("")}</tr>`,
        )
        .join("")}</tbody>
    </table>
  </div>`;
}

function appendSourceLinks(text, links = []) {
  const uniqueLinks = [...new Set(links)].filter((href) => href && !String(text).includes(href));
  if (!uniqueLinks.length) return "";
  return `<span class="source-links">${uniqueLinks
    .map((href, index) => {
      const safe = safeHref(href);
      return `<a href="${escapeHtml(safe)}"${externalAttributes(safe)}>Source${
        uniqueLinks.length > 1 ? ` ${index + 1}` : ""
      } <span aria-hidden="true">↗</span></a>`;
    })
    .join("")}</span>`;
}

function renderFigure(block) {
  return `<figure class="course-figure breakout">
    <div class="course-figure__frame"><img src="${escapeHtml(sitePath(block.src))}" alt="${escapeHtml(
      block.alt || block.caption || "Illustration du cours",
    )}"${block.width ? ` width="${Number(block.width)}"` : ""}${
      block.height ? ` height="${Number(block.height)}"` : ""
    } loading="lazy" decoding="async"></div>
    ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}
    ${
      block.source
        ? `<p class="figure-source"><span>Sources</span> ${linkifyText(block.source)}${appendSourceLinks(
            block.source,
            block.sourceLinks,
          )}</p>`
        : ""
    }
  </figure>`;
}

function renderSources(block) {
  const label = block.scope === "local" ? "Références du dossier" : "Références";
  return `<section class="sources-list" aria-label="${label}">
    <p class="sources-list__label">${label}</p>
    <ol>${(block.entries || [])
      .map(
        (entry) => `<li>${linkifyText(entry.text)}${appendSourceLinks(entry.text, entry.links)}</li>`,
      )
      .join("")}</ol>
  </section>`;
}

export function renderBlock(block) {
  switch (block.type) {
    case "heading": {
      const tag = `h${Math.min(6, Number(block.level || 1) + 1)}`;
      return `<${tag} id="${escapeHtml(block.id)}" class="course-heading course-heading--${Number(
        block.level || 1,
      )}">${escapeHtml(block.text)}</${tag}>`;
    }
    case "paragraph":
      return `<p>${renderSegments(block.segments, block.text)}</p>`;
    case "list":
      return `<ul class="course-list">${(block.items || []).map(renderDefinitionItem).join("")}</ul>`;
    case "callout":
      return renderCallout(block);
    case "stat_row":
      return renderStatRow(block);
    case "table":
      return renderDataTable(block);
    case "figure":
      return renderFigure(block);
    case "sources":
      return renderSources(block);
    case "case_dossier_header":
      return `<header class="case-header" id="${escapeHtml(block.id)}">
        <p class="case-header__kicker">${escapeHtml(block.kicker)}</p>
        <h2>${escapeHtml(block.title)}</h2>
        <p>${escapeHtml(block.question)}</p>
      </header>`;
    default:
      return `<!-- Unsupported content block: ${escapeHtml(block.type || "unknown")} -->`;
  }
}

export function buildToc(blocks) {
  const hasCases = blocks.some((block) => block.type === "case_dossier_header");
  let inCase = false;
  const items = [];
  for (const block of blocks) {
    if (block.type === "case_dossier_header") {
      inCase = true;
      items.push({ id: block.id, title: block.title, kicker: block.kicker, depth: 1 });
    } else if (block.type === "heading") {
      const depth = hasCases && inCase ? Math.min(3, Number(block.level) + 1) : Math.min(3, Number(block.level));
      items.push({ id: block.id, title: block.text, depth });
    } else if (block.type === "sources" && block.scope === "local") {
      inCase = false;
    }
  }
  return items;
}

function sectionGroups(blocks) {
  const hasCases = blocks.some((block) => block.type === "case_dossier_header");
  const boundaries = [];
  let inCase = false;
  blocks.forEach((block, index) => {
    if (block.type === "case_dossier_header") {
      inCase = true;
      boundaries.push({ index, id: block.id, title: block.title, kicker: block.kicker });
    } else if (block.type === "heading" && block.level === 1 && (!hasCases || !inCase)) {
      boundaries.push({ index, id: block.id, title: block.text });
    } else if (block.type === "sources" && block.scope === "local") {
      inCase = false;
    }
  });
  if (!boundaries.length || boundaries[0].index > 0) {
    boundaries.unshift({ index: 0, id: "introduction", title: "Introduction" });
  }
  return boundaries.map((boundary, index) => ({
    ...boundary,
    blocks: blocks.slice(boundary.index, boundaries[index + 1]?.index ?? blocks.length),
  }));
}

function renderPrevNext(groups, index) {
  const previous = groups[index - 1];
  const next = groups[index + 1];
  if (!previous && !next) return "";
  return `<nav class="prev-next" aria-label="Navigation entre les sections">
    ${
      previous
        ? `<a class="prev-next__previous" href="#${escapeHtml(previous.id)}"><span>Section précédente</span><strong>← ${escapeHtml(
            previous.title,
          )}</strong></a>`
        : "<span></span>"
    }
    ${
      next
        ? `<a class="prev-next__next" href="#${escapeHtml(next.id)}"><span>Section suivante</span><strong>${escapeHtml(
            next.title,
          )} →</strong></a>`
        : "<span></span>"
    }
  </nav>`;
}

function volumeLabel(volume) {
  return volume.metadata.volumeNumber ? `Volume ${volume.metadata.volumeNumber}` : "Volume";
}

export function renderVolumeCard(volume, featured = false) {
  const metadata = volume.metadata;
  const count = volume.stats.dossierCount
    ? `${volume.stats.dossierCount} dossiers`
    : `${volume.stats.chapterCount} chapitres`;
  return `<article class="volume-card${featured ? " volume-card--featured" : ""}">
    <div class="volume-card__top"><span>${volumeLabel(volume)}</span><span>${escapeHtml(volume.archetype === "case_dossiers" ? "Cas historiques" : "Fondations")}</span></div>
    <h3><a href="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}">${escapeHtml(metadata.title)}</a></h3>
    <p class="volume-card__subtitle">${escapeHtml(metadata.subtitle || "")}</p>
    <p>${escapeHtml(metadata.description || "")}</p>
    <div class="volume-card__meta"><span>${count}</span><span>${volume.stats.readingMinutes} min de lecture</span></div>
    <a class="text-link" href="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}">Explorer le volume <span aria-hidden="true">→</span></a>
  </article>`;
}

function globalNav(volumes, activePage, showToc) {
  return `<header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="${sitePath("/")}" aria-label="${SITE_NAME}, accueil"><span class="brand__mark"><img src="${sitePath("/brand/tradevisionpro-mark-256.png")}" alt="Symbole TradeVisionPro" width="256" height="256"></span><span><strong>${SITE_NAME}</strong><small>${SITE_TAGLINE}</small></span></a>
      <nav class="main-nav" aria-label="Navigation principale">
        <a href="${sitePath("/")}"${activePage === "home" ? ' aria-current="page"' : ""}>Accueil</a>
        <a href="${sitePath("/volumes/")}"${activePage === "volumes" ? ' aria-current="page"' : ""}>Volumes</a>
        ${volumes
          .map(
            (volume) => `<a class="nav-volume" href="${escapeHtml(sitePath(`/volumes/${volume.metadata.slug}/`))}"${
              activePage === volume.metadata.slug ? ' aria-current="page"' : ""
            }>V${volume.metadata.volumeNumber || volume.metadata.order}</a>`,
          )
          .join("")}
      </nav>
      <div class="header-actions">
        ${showToc ? '<button class="icon-button toc-toggle" type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span aria-hidden="true">☰</span><span class="sr-only">Ouvrir le sommaire</span></button>' : ""}
        <a class="icon-button" href="${sitePath("/recherche/")}" aria-label="Rechercher"><span aria-hidden="true">⌕</span></a>
        <button class="icon-button" type="button" data-theme-toggle aria-label="Changer de thème"><span data-theme-icon aria-hidden="true">◐</span></button>
      </div>
    </div>
  </header>`;
}

export function layout({ title, description, body, volumes, activePage, showToc = false, bodyClass = "" }) {
  return `<!doctype html>
<html lang="fr" data-base-path="${escapeHtml(sitePath("/"))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#17151f">
  <title>${escapeHtml(title)} · ${SITE_NAME}</title>
  <script>try{const s=localStorage.getItem('tradevisionpro-theme');const t=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}</script>
  <link rel="icon" href="${sitePath("/brand/tradevisionpro-favicon.ico")}" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="${sitePath("/brand/tradevisionpro-favicon-32.png")}">
  <link rel="icon" type="image/png" sizes="64x64" href="${sitePath("/brand/tradevisionpro-favicon-64.png")}">
  <link rel="apple-touch-icon" href="${sitePath("/brand/tradevisionpro-apple-touch-icon.png")}">
  <link rel="stylesheet" href="${sitePath("/assets/styles.css")}">
  <script src="${sitePath("/assets/client.js")}" defer></script>
</head>
<body class="${escapeHtml(bodyClass)}">
  <a class="skip-link" href="#contenu">Aller au contenu</a>
  <div class="market-ambient" aria-hidden="true"><span></span><span></span><span></span></div>
  ${globalNav(volumes, activePage, showToc)}
  ${body}
  <footer class="site-footer">
    <div class="footer-brand"><img src="${sitePath("/brand/tradevisionpro-mark-256.png")}" alt="" width="256" height="256" aria-hidden="true"><div><strong>${SITE_NAME}</strong><p>Voyez plus loin. Décidez avec méthode.</p></div></div>
    <div><p>Support pédagogique public — pas un conseil en investissement.</p><a href="${sitePath("/volumes/")}">Voir tous les volumes</a></div>
  </footer>
  <div class="drawer-backdrop" data-drawer-backdrop hidden></div>
</body>
</html>`;
}

export function renderHome(volumes) {
  const first = volumes[0];
  return `<main id="contenu">
    <section class="home-hero" data-motion-hero>
      <div class="hero-market-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="home-hero__content">
        <p class="eyebrow">TradeVisionPro · Édition 2026</p>
        <h1>Lire les marchés.<br><em>Comprendre les mécanismes.</em></h1>
        <p class="home-hero__lead">Une formation structurée pour relier analyse fondamentale, comportement des prix et gestion du risque — des fondations jusqu’aux cas qui ont marqué l’histoire financière.</p>
        <div class="hero-actions"><a class="button button--primary" href="${escapeHtml(
          sitePath(`/volumes/${first.metadata.slug}/`),
        )}">Commencer le Volume 1</a><a class="button button--secondary" href="${sitePath("/volumes/")}">Voir le parcours</a></div>
        <div class="trust-row"><span><strong data-counter="${volumes.length}">${volumes.length}</strong> volumes disponibles</span><span><strong data-counter="${volumes.reduce(
          (sum, volume) => sum + volume.stats.wordCount,
          0,
        )}">${formatNumber(volumes.reduce((sum, volume) => sum + volume.stats.wordCount, 0))}</strong> mots de contenu</span><span><strong data-counter="100" data-counter-suffix=" %">100 %</strong> lecture libre</span></div>
      </div>
      <aside class="hero-panel" aria-label="Méthode pédagogique">
        <img class="hero-panel__mark" src="${sitePath("/brand/tradevisionpro-mark-256.png")}" alt="" width="256" height="256" aria-hidden="true">
        <p class="hero-panel__label">La chaîne de décision</p>
        <ol><li><span>01</span><div><strong>Comprendre</strong><small>Ce que l’actif produit réellement</small></div></li><li><span>02</span><div><strong>Évaluer</strong><small>Ce que le prix suppose déjà</small></div></li><li><span>03</span><div><strong>Invalider</strong><small>Ce qui détruirait le scénario</small></div></li><li><span>04</span><div><strong>Dimensionner</strong><small>Le risque que l’on peut porter</small></div></li></ol>
      </aside>
    </section>
    <section class="section-shell section-shell--volumes">
      <div class="section-heading"><div><p class="eyebrow">Le parcours</p><h2>Deux angles, une même discipline</h2></div><p>Chaque volume possède sa propre structure, mais partage un langage visuel et une méthode de lecture cohérents.</p></div>
      <div class="volume-grid">${volumes.map((volume, index) => renderVolumeCard(volume, index === 0)).join("")}</div>
    </section>
    <section class="method-band">
      <div><p class="eyebrow">Un accompagnement complet</p><h2>De la théorie à la pratique, avec les bonnes ressources et les bons échanges.</h2></div>
      <div class="method-grid"><article><span>01</span><h3>Cours théoriques</h3><p>Des notions structurées pour comprendre les marchés, l’investissement, le trading et la gestion du risque.</p></article><article><span>02</span><h3>Cours pratiques</h3><p>Des exercices et des études de cas pour transformer les concepts en décisions concrètes.</p></article><article><span>03</span><h3>Sources d’apprentissage</h3><p>Un accompagnement vers les meilleures ressources pour approfondir chaque sujet avec méthode.</p></article><article><span>04</span><h3>Échanges constructifs</h3><p>Positions, aperçus des marchés, discussions productives et bien d’autres sujets pour progresser ensemble.</p></article></div>
    </section>
  </main>`;
}

export function renderVolumesIndex(volumes) {
  return `<main id="contenu" class="page-shell">
    <header class="index-hero"><p class="eyebrow">Bibliothèque de formation</p><h1>Volumes</h1><p>Progressez des concepts fondamentaux vers l’analyse de situations réelles. Chaque volume est autonome ; leur enchaînement construit une méthode complète.</p></header>
    <section class="volume-grid volume-grid--index" aria-label="Tous les volumes">${volumes
      .map((volume) => renderVolumeCard(volume))
      .join("")}</section>
  </main>`;
}

function renderToc(toc) {
  return `<nav class="volume-toc" aria-label="Sommaire du volume"><p class="volume-toc__title">Dans ce volume</p><div class="reading-progress" aria-hidden="true"><span data-reading-progress></span></div><ol>${toc
    .map(
      (item) => `<li class="toc-depth-${item.depth}"><a href="#${escapeHtml(item.id)}" data-toc-link="${escapeHtml(
        item.id,
      )}">${item.kicker ? `<small>${escapeHtml(item.kicker)}</small>` : ""}<span>${escapeHtml(item.title)}</span></a></li>`,
    )
    .join("")}</ol></nav>`;
}

export function renderVolumePage(volume, volumes) {
  const metadata = volume.metadata;
  const toc = buildToc(volume.blocks);
  const groups = sectionGroups(volume.blocks);
  const countLabel = volume.stats.dossierCount
    ? `${volume.stats.dossierCount} dossiers`
    : `${volume.stats.chapterCount} chapitres`;
  return `<main id="contenu" class="volume-page">
    <div class="volume-shell">
      <aside class="volume-sidebar" id="volume-sidebar" aria-label="Navigation du volume">
        <button class="drawer-close" type="button" data-toc-close><span aria-hidden="true">×</span><span class="sr-only">Fermer le sommaire</span></button>
        ${renderToc(toc)}
      </aside>
      <article class="course-content">
        <nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="${sitePath("/")}">Accueil</a><span>›</span><a href="${sitePath("/volumes/")}">Volumes</a><span>›</span><span aria-current="page">${escapeHtml(
          metadata.title,
        )}</span></nav>
        <header class="volume-hero">
          <p class="eyebrow">${volumeLabel(volume)} · ${escapeHtml(volume.archetype === "case_dossiers" ? "Dossiers historiques" : "Fondations")}</p>
          <h1>${escapeHtml(metadata.title)}</h1>
          <p class="volume-hero__subtitle">${escapeHtml(metadata.subtitle || "")}</p>
          <p class="volume-hero__description">${escapeHtml(metadata.description || "")}</p>
          <div class="volume-hero__meta"><span>${countLabel}</span><span>${volume.stats.readingMinutes} min</span><span>${formatNumber(
            volume.stats.wordCount,
          )} mots</span>${volume.stats.figureCount ? `<span>${volume.stats.figureCount} figures</span>` : ""}</div>
        </header>
        <div class="mobile-toc-card"><button type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span>Ouvrir le sommaire</span><span aria-hidden="true">☰</span></button></div>
        <div class="course-body">${groups
          .map(
            (group, index) => `<section class="course-section" data-course-section="${escapeHtml(group.id)}">${group.blocks
              .map(renderBlock)
              .join("")}${renderPrevNext(groups, index)}</section>`,
          )
          .join("")}</div>
      </article>
    </div>
  </main>`;
}

export function renderSearchPage() {
  return `<main id="contenu" class="page-shell search-page">
    <header class="index-hero"><p class="eyebrow">Recherche globale</p><h1>Trouver une notion, un cas ou une source</h1><p>La recherche couvre les titres, le texte des cours, les tableaux, les dossiers et les légendes de figures.</p></header>
    <section class="search-workspace">
      <label for="global-search">Rechercher dans tous les volumes</label>
      <div class="search-field"><span aria-hidden="true">⌕</span><input id="global-search" type="search" autocomplete="off" placeholder="Ex. liquidité, PER, Archegos…" data-search-input data-search-page-input><kbd>⌘ K</kbd></div>
      <p class="search-status" data-search-status>Commencez à saisir au moins deux caractères.</p>
      <div class="search-results search-results--page" data-search-results aria-live="polite"></div>
    </section>
  </main>`;
}

export function buildSearchEntries(volume) {
  return sectionGroups(volume.blocks).map((group) => {
    const text = blockPlainText(group.blocks).replace(/\s+/g, " ").trim();
    return {
      id: `${volume.metadata.id}-${group.id}`,
      volume: volumeLabel(volume),
      volumeTitle: volume.metadata.title,
      title: group.title,
      kicker: group.kicker || "",
      url: sitePath(`/volumes/${volume.metadata.slug}/#${group.id}`),
      excerpt: text.slice(0, 260),
      text,
    };
  });
}
