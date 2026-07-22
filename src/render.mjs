const SITE_NAME = "TradeVisionPro";
const SITE_TAGLINE = "Financial Training";
let SITE_BASE_PATH = "/";
let SITE_ASSET_VERSION = "";

export function configureSite({ basePath = "/", assetVersion = "" } = {}) {
  const normalized = `/${String(basePath).trim().replace(/^\/+|\/+$/g, "")}/`;
  SITE_BASE_PATH = normalized === "//" ? "/" : normalized;
  SITE_ASSET_VERSION = String(assetVersion).trim().replace(/[^a-z0-9_-]/gi, "");
  return SITE_BASE_PATH;
}

export function sitePath(value = "/") {
  const pathname = `/${String(value).replace(/^\/+/, "")}`;
  if (SITE_BASE_PATH === "/") return pathname;
  return `${SITE_BASE_PATH}${pathname.slice(1)}`;
}

export function assetPath(value) {
  const path = sitePath(value);
  return SITE_ASSET_VERSION ? `${path}?v=${SITE_ASSET_VERSION}` : path;
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
  if (item.term || item.definition) {
    const term = String(item.term || "").trim();
    const definition = String(item.definition || "").trim();
    return `<li>${term ? `<strong>${escapeHtml(term)} :</strong>` : ""}${term && definition ? " " : ""}${linkifyText(definition)}</li>`;
  }
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

function renderLessonNote(block) {
  return `<aside class="lesson-note lesson-note--${escapeHtml(block.variant || "note")}">
    <p>${renderSegments(block.segments, block.text)}</p>
  </aside>`;
}

function renderEditorialConclusion(block) {
  return `<aside class="chapter-conclusion" id="${escapeHtml(block.id)}">
    <p class="chapter-conclusion__eyebrow">À retenir</p>
    <h2>${escapeHtml(block.title || "Conclusion")}</h2>
    <p>${escapeHtml(block.text || "")}</p>
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

function renderAssetGrid(block) {
  return `<section class="asset-grid breakout" aria-label="${escapeHtml(block.ariaLabel || block.title || "Panorama des actifs financiers")}">
    <header class="asset-grid__header"><p class="eyebrow">${escapeHtml(block.eyebrow || "Panorama des marchés")}</p><h3>${escapeHtml(block.title || "Les principales familles d’actifs")}</h3><p>${escapeHtml(block.intro || "")}</p></header>
    <div class="asset-grid__items">${(block.assets || [])
      .map(
        (asset) => `<article class="asset-card">
          <p class="asset-card__tag">${escapeHtml(asset.tag || "Actif financier")}</p>
          <h4>${escapeHtml(asset.name || "")}</h4>
          <p class="asset-card__holding">${escapeHtml(asset.holding || "")}</p>
          <dl><div><dt>Moteur de rendement</dt><dd>${escapeHtml(asset.returnDriver || "")}</dd></div><div><dt>Risques dominants</dt><dd>${escapeHtml(asset.risks || "")}</dd></div></dl>
          <p class="asset-card__example"><strong>Exemple concret</strong>${escapeHtml(asset.example || "")}</p>
        </article>`,
      )
      .join("")}</div>
  </section>`;
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
    case "lesson_note":
      return renderLessonNote(block);
    case "stat_row":
      return renderStatRow(block);
    case "table":
      return renderDataTable(block);
    case "asset_grid":
      return renderAssetGrid(block);
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
    case "editorial_conclusion":
      return renderEditorialConclusion(block);
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
    } else if (block.type === "editorial_conclusion") {
      items.push({ id: block.id, title: block.title, depth: 1 });
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
    } else if (block.type === "editorial_conclusion") {
      boundaries.push({ index, id: block.id, title: block.title });
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

function volumePartGroups(volume) {
  const parts = volume.metadata.parts || [];
  if (!parts.length) return [];
  return parts.map((part, index) => {
    const start = volume.blocks.findIndex((block) => block.id === part.startId);
    const nextStart = parts[index + 1]
      ? volume.blocks.findIndex((block) => block.id === parts[index + 1].startId)
      : volume.blocks.length;
    const blocks = volume.blocks.slice(Math.max(0, start), nextStart < 0 ? volume.blocks.length : nextStart);
    return { ...part, blocks, groups: sectionGroups(blocks) };
  });
}

function buildPartsToc(volume, partGroups) {
  return partGroups.flatMap((part) => {
    const allowedIds = new Set(part.tocIds || []);
    const sections = buildToc(part.blocks)
      .filter((item) => !allowedIds.size || allowedIds.has(item.id))
      .map((item) => ({ ...item, depth: 2 }));
    return [
      {
        id: part.id,
        title: part.title,
        kicker: `Partie ${part.order}`,
        depth: 1,
        partOrder: part.order,
        isPart: true,
      },
      ...sections,
    ];
  });
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
  return `Volume ${volume.metadata.volumeNumber || volume.metadata.order}`;
}

function archetypeLabel(volume) {
  const labels = {
    case_dossiers: "Cas historiques",
    technical_analysis: "Analyse technique",
    macroeconomic_analysis: "Macroéconomie",
    conceptual: "Fondations",
  };
  return labels[volume.archetype] || "Formation";
}

export function renderVolumeCard(volume, featured = false) {
  const metadata = volume.metadata;
  const order = metadata.volumeNumber || metadata.order;
  const count = volume.stats.dossierCount
    ? `${volume.stats.dossierCount} dossiers`
    : `${volume.stats.chapterCount} chapitre${volume.stats.chapterCount > 1 ? "s" : ""}`;
  return `<article class="volume-card${featured ? " volume-card--featured" : ""}" data-volume-card data-volume-order="${order}" data-volume-part-count="${metadata.parts?.length || 1}" data-volume-has-parts="${String(Boolean(metadata.parts?.length))}">
    <div class="volume-card__top"><span>${volumeLabel(volume)}</span><span>${escapeHtml(archetypeLabel(volume))}</span></div>
    <p class="volume-card__state" data-volume-state><span data-volume-state-icon aria-hidden="true">◇</span><span data-volume-state-label>Progression en cours</span></p>
    <h3><a href="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}">${escapeHtml(metadata.title)}</a></h3>
    <p class="volume-card__subtitle">${escapeHtml(metadata.subtitle || "")}</p>
    <p>${escapeHtml(metadata.description || "")}</p>
    <div class="volume-card__meta"><span>${count}</span><span>${volume.stats.readingMinutes} min de lecture</span></div>
    <a class="text-link" data-volume-link data-volume-order="${order}" href="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}">Explorer le volume <span aria-hidden="true">→</span></a>
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
            (volume) => `<a class="nav-volume" data-volume-link data-volume-order="${volume.metadata.volumeNumber || volume.metadata.order}" href="${escapeHtml(sitePath(`/volumes/${volume.metadata.slug}/`))}"${
              activePage === volume.metadata.slug ? ' aria-current="page"' : ""
            }>V${volume.metadata.volumeNumber || volume.metadata.order}</a>`,
          )
          .join("")}
        <a class="profile-nav-link" href="${sitePath("/profil/")}"${activePage === "profile" ? ' aria-current="page"' : ""}>Profil</a>
      </nav>
      <div class="header-actions">
        ${showToc ? '<button class="icon-button toc-toggle" type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span aria-hidden="true">☰</span><span class="sr-only">Ouvrir le sommaire</span></button>' : ""}
        <a class="profile-shortcut" href="${sitePath("/profil/")}" aria-label="Ouvrir mon profil"><span data-profile-initials aria-hidden="true">TV</span></a>
        <a class="icon-button" href="${sitePath("/recherche/")}" aria-label="Rechercher"><span aria-hidden="true">⌕</span></a>
        <button class="icon-button" type="button" data-theme-toggle aria-label="Changer de thème"><span data-theme-icon aria-hidden="true">◐</span></button>
      </div>
    </div>
  </header>`;
}

export function layout({ title, description, body, volumes, activePage, showToc = false, bodyClass = "" }) {
  return `<!doctype html>
<html lang="fr" class="access-locked" data-base-path="${escapeHtml(sitePath("/"))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#17151f">
  <title>${escapeHtml(title)} · ${SITE_NAME}</title>
  <script>try{const s=localStorage.getItem('tradevisionpro-theme');const t=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}try{const p=sessionStorage.getItem('tradevisionpro-access-session-v3');const a={'aedan-dechavigny':'learner','yann':'learner','charly-labbetoul':'admin'};if(a[p]){const r=document.documentElement;r.dataset.accessProfile=p;r.dataset.accessRole=a[p];r.classList.remove('access-locked');r.classList.add('access-granted')}}catch(e){}</script>
  <link rel="icon" href="${sitePath("/brand/tradevisionpro-favicon.ico")}" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="${sitePath("/brand/tradevisionpro-favicon-32.png")}">
  <link rel="icon" type="image/png" sizes="64x64" href="${sitePath("/brand/tradevisionpro-favicon-64.png")}">
  <link rel="apple-touch-icon" href="${sitePath("/brand/tradevisionpro-apple-touch-icon.png")}">
  <link rel="stylesheet" href="${assetPath("/assets/styles.css")}">
  <script src="${assetPath("/assets/client.js")}" defer></script>
</head>
<body class="${escapeHtml(bodyClass)}">
  <section class="access-gate" data-access-gate aria-labelledby="access-title" aria-describedby="access-intro" role="dialog" aria-modal="true">
    <div class="access-gate__ambient" aria-hidden="true"><span></span><span></span><span></span><i></i><i></i><i></i><i></i><i></i></div>
    <div class="access-card" data-access-card>
      <header class="access-brand">
        <span class="access-brand__mark"><img src="${sitePath("/brand/tradevisionpro-mark-256.png")}" alt="" width="256" height="256" aria-hidden="true"></span>
        <span><strong>${SITE_NAME}</strong><small>${SITE_TAGLINE}</small></span>
      </header>
      <div class="access-card__heading">
        <p class="access-eyebrow"><span aria-hidden="true"></span> Accès protégé</p>
        <h1 id="access-title">Entrez votre code d’accès</h1>
        <p id="access-intro">Cette formation est réservée aux personnes disposant de leur code personnel.</p>
      </div>
      <form class="access-form" data-access-form novalidate>
        <label for="access-code">Code à 6 chiffres</label>
        <div class="access-field">
          <input id="access-code" data-access-input type="password" inputmode="numeric" autocomplete="off" minlength="6" maxlength="6" pattern="[0-9]{6}" aria-describedby="access-help access-status" aria-invalid="false" placeholder="••••••" required>
          <button class="access-visibility" data-access-visibility type="button" aria-label="Afficher le code" aria-pressed="false">
            <span data-access-visibility-icon aria-hidden="true">◉</span>
          </button>
        </div>
        <p class="access-help" id="access-help">Saisissez les six chiffres communiqués avec votre accès.</p>
        <button class="access-submit" data-access-submit type="submit"><span>Accéder à la formation</span><span aria-hidden="true">→</span></button>
        <p class="access-status" id="access-status" data-access-status role="status" aria-live="polite">Votre accès restera actif pendant cette session.</p>
      </form>
      <footer class="access-card__footer"><span aria-hidden="true">◆</span> Espace de formation TradeVisionPro</footer>
    </div>
  </section>
  <a class="skip-link" href="#contenu">Aller au contenu</a>
  <div class="market-ambient" aria-hidden="true"><span></span><span></span><span></span></div>
  ${globalNav(volumes, activePage, showToc)}
  ${body}
  <footer class="site-footer">
    <div class="footer-brand"><img src="${sitePath("/brand/tradevisionpro-mark-256.png")}" alt="" width="256" height="256" aria-hidden="true"><div><strong>${SITE_NAME}</strong><p>Voyez plus loin. Décidez avec méthode.</p></div></div>
    <div><p>Espace pédagogique privé — pas un conseil en investissement.</p><a href="${sitePath("/volumes/")}">Voir tous les volumes</a></div>
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
        <p class="home-hero__lead">Une formation structurée pour relier analyse fondamentale, comportement des prix, gestion du risque, timing et macroéconomie — des fondations jusqu’à la lecture des publications économiques.</p>
        <div class="hero-actions"><a class="button button--primary" href="${escapeHtml(
          sitePath(`/volumes/${first.metadata.slug}/`),
        )}" data-volume-link data-volume-order="1">Commencer le Volume 1</a><a class="button button--secondary" href="${sitePath("/volumes/")}">Voir le parcours</a></div>
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
      <div class="section-heading"><div><p class="eyebrow">Le parcours</p><h2>Quatre angles, une même discipline</h2></div><p>Chaque volume possède sa propre structure, mais partage un langage visuel et une méthode de lecture cohérents.</p></div>
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

export function renderProfilePage(volumes) {
  const volumeCards = volumes
    .map((volume) => {
      const metadata = volume.metadata;
      const order = metadata.volumeNumber || metadata.order;
      return `<article class="profile-volume" data-profile-volume data-volume-order="${order}" data-volume-part-count="${metadata.parts?.length || 1}" data-volume-has-parts="${String(Boolean(metadata.parts?.length))}" data-volume-part-ids="${escapeHtml((metadata.parts || []).map((part) => part.id).join(","))}">
        <div class="profile-volume__number" aria-hidden="true">V${order}</div>
        <div class="profile-volume__content">
          <div class="profile-volume__heading"><div><p>${volumeLabel(volume)}</p><h3>${escapeHtml(metadata.title)}</h3></div><span class="profile-status" data-profile-volume-status>Disponible</span></div>
          <p>${escapeHtml(metadata.subtitle || metadata.description || "")}</p>
          <div class="profile-volume__footer"><span>Meilleur score <strong data-profile-volume-score>—</strong></span><a data-profile-volume-link data-profile-volume-url="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}" href="${escapeHtml(sitePath(`/volumes/${metadata.slug}/`))}">Ouvrir le volume <span aria-hidden="true">→</span></a></div>
        </div>
      </article>`;
    })
    .join("");

  return `<main id="contenu" class="page-shell profile-page">
    <nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="${sitePath("/")}">Accueil</a><span>›</span><span aria-current="page">Profil</span></nav>
    <header class="profile-hero">
      <div class="profile-identity">
        <span class="profile-avatar" data-profile-initials aria-hidden="true">TV</span>
        <div><p class="eyebrow">Mon espace</p><p class="profile-welcome">Bonjour,</p><h1 data-profile-name>Votre profil</h1><span class="profile-role" data-profile-role>Compte apprenant</span></div>
      </div>
      <div class="profile-session"><p><span aria-hidden="true">◆</span> Progression enregistrée sur cet appareil</p><button class="button button--secondary" type="button" data-profile-logout>Changer de compte</button></div>
    </header>

    <section class="profile-stats" aria-label="Résumé de votre parcours">
      <article><span>Volumes validés</span><strong><b data-profile-validated>0</b> / ${volumes.length}</strong><small>Objectif : 8/10 par QCM</small></article>
      <article><span>Volumes accessibles</span><strong data-profile-open>1</strong><small data-profile-access-note>Déblocage progressif</small></article>
      <article><span>Meilleur score</span><strong data-profile-best>—</strong><small>Sur l’ensemble des QCM</small></article>
      <article><span>Progression globale</span><strong data-profile-completion>0 %</strong><small>Volumes pédagogiques validés</small></article>
    </section>

    <section class="profile-dashboard">
      <article class="profile-progress-card">
        <div class="profile-section-heading"><div><p class="eyebrow">Votre parcours</p><h2>Progression de la formation</h2></div><strong data-profile-completion>0 %</strong></div>
        <div class="profile-progress-track" role="progressbar" aria-label="Progression de la formation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-profile-progress><i data-profile-progress-bar></i></div>
        <div class="profile-volume-list">${volumeCards}</div>
      </article>

      <aside class="profile-sidebar">
        <article class="profile-next-step">
          <span class="profile-next-step__icon" aria-hidden="true">↗</span><p class="eyebrow">Prochaine étape</p>
          <h2 data-profile-next-title>Commencer le Volume 1</h2>
          <p data-profile-next-text>Découvrez les fondations, puis validez le QCM pour poursuivre.</p>
          <a class="button button--primary" data-profile-next-link href="${escapeHtml(sitePath(`/volumes/${volumes[0]?.metadata.slug || ""}/`))}">Continuer <span aria-hidden="true">→</span></a>
        </article>
        <article class="profile-achievements">
          <p class="eyebrow">Repères</p><h2>Vos accomplissements</h2>
          <ul><li data-profile-achievement="start"><span aria-hidden="true">◆</span><div><strong>Parcours commencé</strong><small>Première étape franchie</small></div></li><li data-profile-achievement="half"><span aria-hidden="true">◆</span><div><strong>Fondations validées</strong><small>Volume 1 réussi</small></div></li><li data-profile-achievement="complete"><span aria-hidden="true">◆</span><div><strong>Parcours complété</strong><small>Tous les volumes validés</small></div></li></ul>
        </article>
        <p class="profile-device-note"><span aria-hidden="true">ⓘ</span><span><strong>Données locales</strong> Vos scores sont liés à ce profil sur ce navigateur. Changer de compte ne supprime pas votre progression.</span></p>
      </aside>
    </section>
  </main>`;
}

function renderVolumeHighlights(highlights = []) {
  if (!highlights.length) return "";
  return `<section class="chapter-highlights" aria-labelledby="chapter-highlights-title">
    <div class="chapter-highlights__intro"><p class="eyebrow">Repères de lecture</p><h2 id="chapter-highlights-title">Du contexte à la décision</h2></div>
    <ol>${highlights
      .map(
        (item) => `<li><span>${escapeHtml(item.number || "")}</span><div><strong>${escapeHtml(
          item.title || "",
        )}</strong><p>${escapeHtml(item.text || "")}</p></div></li>`,
      )
      .join("")}</ol>
  </section>`;
}

function renderToc(toc, volume) {
  const partCount = volume.metadata.parts?.length || 0;
  return `<nav class="volume-toc" aria-label="Sommaire du volume"><p class="volume-toc__title">Dans ce volume</p><div class="reading-progress" aria-hidden="true"><span data-reading-progress></span></div><ol>${toc
    .map(
      (item) => `<li class="toc-depth-${item.depth}${item.isPart ? " volume-toc__part" : ""}"><a href="#${escapeHtml(item.id)}" data-toc-link="${escapeHtml(
        item.id,
      )}"${item.partOrder ? ` data-volume-part-link data-part-order="${item.partOrder}"` : ""}>${item.kicker ? `<small>${escapeHtml(item.kicker)}</small>` : ""}<span>${escapeHtml(item.title)}</span></a></li>`,
    )
    .join("")}<li class="volume-toc__exercise"><button type="button" data-open-exercise><small>Validation</small><span>${partCount ? "QCM par partie" : "Exercices · QCM"}</span><em>${partCount ? "10 questions dans chaque QCM" : "10 questions"} · objectif 8/10</em></button></li></ol></nav>`;
}

function renderQuiz(volume, quiz, volumes, part = null, parts = []) {
  const metadata = volume.metadata;
  const order = metadata.volumeNumber || metadata.order;
  const questions = quiz?.questions || [];
  const nextVolume = volumes.find((candidate) => (candidate.metadata.volumeNumber || candidate.metadata.order) === order + 1);
  const nextPart = part ? parts.find((candidate) => Number(candidate.order) === Number(part.order) + 1) : null;
  const awaitsNextPart = Boolean(part && !nextPart && metadata.partSequenceComplete === false);
  const futureVolumeNumber = Number(metadata.futureVolumeNumber || 0);
  const awaitsFutureVolume = Boolean(
    part && !nextPart && !nextVolume && metadata.partSequenceComplete !== false && futureVolumeNumber === order + 1,
  );
  const nextStep = nextPart
    ? { kind: "part", label: `Partie ${nextPart.order}`, title: nextPart.title, url: `#${nextPart.id}` }
    : awaitsNextPart
      ? { kind: "upcoming-part", label: "", title: "", url: `#${part.id}` }
      : nextVolume
      ? {
          kind: "volume",
          label: `Volume ${order + 1}`,
          title: nextVolume.metadata.title,
          url: sitePath(`/volumes/${nextVolume.metadata.slug}/`),
        }
      : awaitsFutureVolume
        ? {
            kind: "upcoming-volume",
            label: `Volume ${futureVolumeNumber}`,
            title: "À venir",
            url: sitePath("/volumes/"),
          }
      : { kind: "overview", label: "", title: "", url: sitePath("/volumes/") };
  const quizId = part ? `${order}-part-${part.order}` : String(order);
  const contextLabel = part ? `Partie ${part.order} · ${volumeLabel(volume)}` : `Exercices du ${volumeLabel(volume)}`;
  const completesVolume = Boolean(part && !nextPart && !awaitsNextPart);
  if (!questions.length) return "";
  return `<section class="quiz-workspace" aria-labelledby="quiz-title-${quizId}">
    <header class="quiz-intro">
      <div><p class="eyebrow">${escapeHtml(contextLabel)}</p><h2 id="quiz-title-${quizId}">${escapeHtml(quiz.title)}</h2></div>
      <span class="quiz-threshold"><strong>8/10</strong> pour valider</span>
      <p>${escapeHtml(quiz.intro)}</p>
    </header>
    <div class="quiz-guidance" role="note"><span aria-hidden="true">◆</span><p><strong>Votre objectif</strong> Sélectionnez une réponse par question. Après validation, chaque correction sera expliquée et votre meilleur score sera conservé sur cet appareil.</p></div>
    <form class="quiz" data-quiz data-volume-order="${order}" data-part-order="${part?.order || ""}" data-completes-volume="${String(completesVolume)}" data-awaits-next-part="${String(awaitsNextPart)}" data-awaits-future-volume="${String(awaitsFutureVolume)}" data-future-volume-number="${futureVolumeNumber || ""}" data-context-label="${escapeHtml(part ? `Partie ${part.order}` : volumeLabel(volume))}" data-next-step-kind="${nextStep.kind}" data-next-step-label="${escapeHtml(nextStep.label)}" data-next-step-title="${escapeHtml(nextStep.title)}" data-next-step-url="${escapeHtml(nextStep.url)}">
      <div class="quiz-progress" aria-label="Progression dans le questionnaire">
        <div><span data-quiz-progress-text>Question 1 sur ${questions.length}</span><span data-quiz-answered>0 réponse sur ${questions.length}</span></div>
        <span class="quiz-progress__track" aria-hidden="true"><i data-quiz-progress-bar></i></span>
      </div>
      <div class="quiz-questions">${questions
        .map(
          (question, questionIndex) => `<fieldset class="quiz-question" data-quiz-question data-answer="${Number(
            question.answer,
          )}" data-explanation="${escapeHtml(question.explanation)}"${questionIndex ? " hidden" : ""}>
            <legend><span class="quiz-question__number">${String(questionIndex + 1).padStart(2, "0")}</span><span class="quiz-question__difficulty">${escapeHtml(question.difficulty || "Révision")}</span><span class="quiz-question__prompt">${escapeHtml(question.question)}</span></legend>
            <div class="quiz-options">${question.options
              .map(
                (option, optionIndex) => `<label><input type="radio" name="${escapeHtml(
                  question.id,
                )}" value="${optionIndex}"><span class="quiz-option__letter" aria-hidden="true">${String.fromCharCode(
                  65 + optionIndex,
                )}</span><span>${escapeHtml(option)}</span><i aria-hidden="true"></i></label>`,
              )
              .join("")}</div>
            <aside class="quiz-feedback" data-quiz-feedback hidden><strong data-quiz-feedback-title></strong><p>${escapeHtml(
              question.explanation,
            )}</p></aside>
          </fieldset>`,
        )
        .join("")}</div>
      <div class="quiz-navigation">
        <button class="button button--secondary quiz-previous" type="button" data-quiz-previous disabled><span aria-hidden="true">←</span> Précédente</button>
        <button class="button button--primary quiz-next" type="button" data-quiz-next>Question suivante <span aria-hidden="true">→</span></button>
        <button class="button button--primary quiz-submit" type="submit" data-quiz-submit hidden>Valider mes réponses <span aria-hidden="true">✓</span></button>
        <button class="button button--secondary quiz-restart-inline" type="button" data-quiz-restart-inline hidden><span aria-hidden="true">↻</span> Recommencer le QCM</button>
      </div>
      <p class="quiz-navigation__help" data-quiz-help role="status" aria-live="polite">Choisissez une réponse pour poursuivre.</p>
    </form>
    <section class="quiz-result" data-quiz-result hidden tabindex="-1" aria-live="polite">
      <div class="quiz-result__visual"><div class="quiz-result__score"><span data-quiz-result-score>0</span><small>/ 10</small></div><p><span>Seuil de validation</span><strong>8 bonnes réponses</strong></p></div>
      <div class="quiz-result__content"><p class="eyebrow" data-quiz-result-eyebrow>Résultat</p><h2 data-quiz-result-title></h2><p data-quiz-result-message></p><div class="quiz-result__actions"><a class="button button--primary" data-quiz-next-volume data-next-step-kind="${nextStep.kind}" href="${escapeHtml(nextStep.url)}"></a><button class="button button--secondary" type="button" data-quiz-review>Voir mes corrections</button><button class="button button--restart" type="button" data-quiz-retry><span aria-hidden="true">↻</span> Recommencer le QCM</button></div></div>
    </section>
  </section>`;
}

function renderPartNavigation(volume, partGroups) {
  const countWords = { 1: "Une", 2: "Deux", 3: "Trois" };
  const countLabel = countWords[partGroups.length] || String(partGroups.length);
  return `<section class="volume-parts-map" aria-labelledby="volume-parts-title">
    <header><div><p class="eyebrow">Parcours du ${volumeLabel(volume)}</p><h2 id="volume-parts-title">${countLabel} partie${partGroups.length > 1 ? "s" : ""}, ${countLabel.toLowerCase()} validation${partGroups.length > 1 ? "s" : ""}</h2></div><p>Obtenez au moins 8/10 au QCM d’une partie pour ouvrir la suivante.</p></header>
    <ol>${partGroups
      .map(
        (part) => `<li><a href="#${escapeHtml(part.id)}" data-volume-part-link data-part-order="${part.order}">
          <span class="volume-parts-map__number">0${part.order}</span>
          <span class="volume-parts-map__copy"><small>Partie ${part.order}</small><strong>${escapeHtml(part.title)}</strong><em>${escapeHtml(part.subtitle)}</em></span>
          <span class="volume-parts-map__status" data-part-status>${part.order === 1 ? "Disponible" : "À débloquer"}</span>
        </a></li>`,
      )
      .join("")}</ol>
  </section>`;
}

function renderCourseGroups(groups) {
  return groups
    .map(
      (group, index) => `<section class="course-section" data-course-section="${escapeHtml(group.id)}">${group.blocks
        .map(renderBlock)
        .join("")}${renderPrevNext(groups, index)}</section>`,
    )
    .join("");
}

function renderVolumeParts(metadata, partGroups) {
  const volumeNumber = metadata.volumeNumber || metadata.order;
  return `<div class="volume-parts">${partGroups
    .map(
      (part, index) => `<section class="volume-part" id="${escapeHtml(part.id)}" data-volume-part data-part-order="${part.order}">
        <header class="volume-part__hero${part.title.length > 36 ? " volume-part__hero--compact" : ""}">
          <div class="volume-part__index" aria-hidden="true">0${part.order}</div>
          <div><p class="eyebrow">Volume ${volumeNumber} · Partie ${part.order}</p><h2>${escapeHtml(part.title)}</h2><p class="volume-part__subtitle">${escapeHtml(part.subtitle)}</p><p>${escapeHtml(part.description)}</p></div>
          <span class="volume-part__state" data-part-status>${part.order === 1 ? "Disponible" : "À débloquer"}</span>
        </header>
        <section class="volume-part-lock" data-part-lock${part.order === 1 ? " hidden" : ""} aria-labelledby="part-lock-title-${part.order}">
          <span aria-hidden="true">◇</span><div><p class="eyebrow">Progression guidée</p><h3 id="part-lock-title-${part.order}">Validez la Partie ${part.order - 1} pour continuer</h3><p>Le contenu de cette partie s’ouvrira dès que vous aurez obtenu au moins <strong>8/10</strong> au QCM précédent.</p><button class="button button--primary" type="button" data-open-part-quiz data-target-part="${part.order - 1}">Passer le QCM de la Partie ${part.order - 1} <span aria-hidden="true">→</span></button></div>
        </section>
        <div data-part-protected${part.order > 1 ? " hidden" : ""}>
          ${index === 0 ? renderVolumeHighlights(metadata.highlights) : ""}
          <div class="course-body">${renderCourseGroups(part.groups)}</div>
        </div>
      </section>`,
    )
    .join("")}</div>`;
}

function renderPartQuizzes(volume, quiz, volumes, partGroups) {
  const quizzes = quiz?.parts || [];
  const countWords = { 1: "Un", 2: "Deux", 3: "Trois" };
  const countLabel = countWords[partGroups.length] || String(partGroups.length);
  return `<section class="part-quizzes" aria-labelledby="part-quizzes-title">
    <header class="part-quizzes__header"><p class="eyebrow">Validations séparées</p><h2 id="part-quizzes-title">${countLabel} QCM indépendant${partGroups.length > 1 ? "s" : ""}</h2><p>Chaque partie se valide avec son propre questionnaire de 10 questions. Les questions ne sont pas cumulées et chaque meilleur score est conservé séparément.</p></header>
    ${partGroups
      .map((part) => {
        const partQuiz = quizzes.find((candidate) => Number(candidate.order) === Number(part.order));
        return `<section class="part-quiz" id="exercices-partie-${part.order}" data-part-quiz data-part-order="${part.order}">
          <section class="volume-part-lock volume-part-lock--quiz" data-part-quiz-lock${part.order === 1 ? " hidden" : ""} aria-labelledby="part-quiz-lock-title-${part.order}">
            <span aria-hidden="true">◇</span><div><p class="eyebrow">QCM verrouillé</p><h3 id="part-quiz-lock-title-${part.order}">La Partie ${part.order} doit d’abord être accessible</h3><p>Obtenez au moins <strong>8/10</strong> au QCM de la Partie ${part.order - 1} pour ouvrir ce questionnaire.</p></div>
          </section>
          <div data-part-quiz-protected${part.order > 1 ? " hidden" : ""}>${renderQuiz(volume, partQuiz, volumes, part, partGroups)}</div>
        </section>`;
      })
      .join("")}
  </section>`;
}

export function renderVolumePage(volume, volumes, quiz) {
  const metadata = volume.metadata;
  const order = metadata.volumeNumber || metadata.order;
  const previousVolume = volumes.find((candidate) => (candidate.metadata.volumeNumber || candidate.metadata.order) === order - 1);
  const partGroups = volumePartGroups(volume);
  const toc = partGroups.length ? buildPartsToc(volume, partGroups) : buildToc(volume.blocks);
  const groups = sectionGroups(volume.blocks);
  const countLabel = partGroups.length
    ? `${partGroups.length} parties`
    : volume.stats.dossierCount
    ? `${volume.stats.dossierCount} dossiers`
    : `${volume.stats.chapterCount} chapitre${volume.stats.chapterCount > 1 ? "s" : ""}`;
  return `<main id="contenu" class="volume-page" data-volume-page data-volume-order="${order}" data-volume-part-count="${partGroups.length || 1}" data-volume-has-parts="${String(Boolean(partGroups.length))}">
    <div class="volume-shell">
      <aside class="volume-sidebar" id="volume-sidebar" aria-label="Navigation du volume">
        <button class="drawer-close" type="button" data-toc-close><span aria-hidden="true">×</span><span class="sr-only">Fermer le sommaire</span></button>
        ${renderToc(toc, volume)}
      </aside>
      <article class="course-content">
        <nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="${sitePath("/")}">Accueil</a><span>›</span><a href="${sitePath("/volumes/")}">Volumes</a><span>›</span><span aria-current="page">${escapeHtml(
          metadata.title,
        )}</span></nav>
        <header class="volume-hero">
          <p class="eyebrow">${volumeLabel(volume)} · ${escapeHtml(archetypeLabel(volume))}</p>
          <h1>${escapeHtml(metadata.title)}</h1>
          <p class="volume-hero__subtitle">${escapeHtml(metadata.subtitle || "")}</p>
          <p class="volume-hero__description">${escapeHtml(metadata.description || "")}</p>
          <div class="volume-hero__meta"><span>${countLabel}</span><span>${volume.stats.readingMinutes} min</span><span>${formatNumber(
            volume.stats.wordCount,
          )} mots</span>${volume.stats.figureCount ? `<span>${volume.stats.figureCount} figures</span>` : ""}</div>
        </header>
        <div class="mobile-toc-card"><button type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span>Ouvrir le sommaire</span><span aria-hidden="true">☰</span></button></div>
        <section class="volume-lock" data-volume-lock hidden aria-labelledby="volume-lock-title-${order}">
          <span class="volume-lock__icon" aria-hidden="true">◇</span>
          <div><p class="eyebrow">Étape à valider</p><h2 id="volume-lock-title-${order}">Ce volume est encore verrouillé</h2><p>Obtenez au moins <strong>8/10</strong> au QCM du Volume ${Math.max(1, order - 1)} pour poursuivre votre parcours.</p>${
            previousVolume
              ? `<a class="button button--primary" href="${escapeHtml(
                  sitePath(`/volumes/${previousVolume.metadata.slug}/#exercices`),
                )}">Passer le QCM du Volume ${order - 1} <span aria-hidden="true">→</span></a>`
              : ""
          }</div>
        </section>
        <div data-volume-protected>
          <nav class="volume-tabs" role="tablist" aria-label="Cours et exercices">
            <button id="volume-tab-course-${order}" type="button" role="tab" aria-selected="true" aria-controls="volume-pane-course-${order}" data-volume-tab="course"><span aria-hidden="true">▤</span><span><strong>Le cours</strong><small>Lire et réviser</small></span></button>
            <button id="volume-tab-exercises-${order}" type="button" role="tab" aria-selected="false" aria-controls="volume-pane-exercises-${order}" data-volume-tab="exercises"><span aria-hidden="true">✓</span><span><strong>Exercices</strong><small>${partGroups.length ? "QCM propres à chaque partie" : "QCM"} · objectif 8/10</small></span><em data-volume-score>À faire</em></button>
          </nav>
          <section id="volume-pane-course-${order}" class="volume-pane" role="tabpanel" aria-labelledby="volume-tab-course-${order}" data-volume-pane="course">
            ${partGroups.length ? `${renderPartNavigation(volume, partGroups)}${renderVolumeParts(metadata, partGroups)}` : `${renderVolumeHighlights(metadata.highlights)}<div class="course-body">${renderCourseGroups(groups)}</div>`}
          </section>
          <section id="volume-pane-exercises-${order}" class="volume-pane volume-pane--exercises" role="tabpanel" aria-labelledby="volume-tab-exercises-${order}" data-volume-pane="exercises" hidden>
            <span id="exercices" class="anchor-target" aria-hidden="true"></span>
            ${partGroups.length ? renderPartQuizzes(volume, quiz, volumes, partGroups) : renderQuiz(volume, quiz, volumes)}
          </section>
        </div>
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
