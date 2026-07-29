const SITE_NAME = "TradeVisionPro";
const SITE_TAGLINE = "Financial Training";
let SITE_BASE_PATH = "/";
let SITE_ASSET_VERSION = "";
let RANK_CONFIG = {
  version: 1,
  defaultMode: "auto",
  autoFractions: { bronze: 0, silver: 0.2, gold: 0.4, platine: 0.6, elite: 0.8 },
  manualThresholds: { bronze: 0, silver: 1, gold: 2, platine: 3, elite: 4 },
  ranks: [
    { id: "bronze", name: "Bronze" },
    { id: "silver", name: "Silver" },
    { id: "gold", name: "Gold" },
    { id: "platine", name: "Platine" },
    { id: "elite", name: "Elite" },
  ],
};

export function configureSite({ basePath = "/", assetVersion = "" } = {}) {
  const normalized = `/${String(basePath).trim().replace(/^\/+|\/+$/g, "")}/`;
  SITE_BASE_PATH = normalized === "//" ? "/" : normalized;
  SITE_ASSET_VERSION = String(assetVersion).trim().replace(/[^a-z0-9_-]/gi, "");
  return SITE_BASE_PATH;
}

export function configureRanks(config = {}) {
  if (Array.isArray(config.ranks) && config.ranks.length) {
    RANK_CONFIG = {
      ...RANK_CONFIG,
      ...config,
      autoFractions: { ...RANK_CONFIG.autoFractions, ...(config.autoFractions || {}) },
      manualThresholds: { ...RANK_CONFIG.manualThresholds, ...(config.manualThresholds || {}) },
      ranks: config.ranks,
    };
  }
  return RANK_CONFIG;
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

let RANK_EMBLEM_SEQUENCE = 0;

function rankEmblemGeometry(id) {
  const geometries = {
    bronze: {
      aura: ["M120 22 126 34 120 40 114 34Z", "M120 218 126 206 120 200 114 206Z"],
      underlay: ["M120 20 177 51 190 139 120 220 50 139 63 51Z"],
      left: ["M82 67 45 51 18 67 47 88 27 105 77 102Z"],
      right: ["M158 67 195 51 222 67 193 88 213 105 163 102Z"],
      frame: [
        { d: "M120 30 166 58 177 133 120 204 63 133 74 58Z", fill: "metal" },
        { d: "M120 43 154 65 162 128 120 186 78 128 86 65Z", fill: "dark" },
        { d: "M120 54 145 71 150 122 120 169 90 122 95 71Z", fill: "metal" },
      ],
      plates: [
        { d: "M74 58 86 65 78 128 63 133Z", fill: "low" },
        { d: "M166 58 154 65 162 128 177 133Z", fill: "high" },
        { d: "M79 139 120 189 161 139 151 159 120 204 89 159Z", fill: "low" },
      ],
      crown: [],
      core: [
        { d: "M120 64 145 107 134 103 134 147 120 164 106 147 106 103 95 107Z", fill: "light" },
        { d: "M94 124 106 133 106 151 88 138Z", fill: "metal" },
        { d: "M146 124 134 133 134 151 152 138Z", fill: "high" },
      ],
      energy: [{ d: "M120 98 126 108 120 118 114 108Z", fill: "energy" }],
      engravings: ["M83 82 76 118", "M157 82 164 118", "M101 68 120 57 139 68"],
      damage: ["M88 88 96 91", "M76 112 85 109", "M142 151 150 145"],
      texture: "M120 31 165 59 176 133 120 202 64 133 75 59Z",
    },
    silver: {
      aura: ["M120 13 127 28 120 36 113 28Z", "M120 227 127 212 120 204 113 212Z"],
      underlay: ["M120 17 180 48 198 139 120 224 42 139 60 48Z"],
      left: [
        "M86 61 46 39 12 52 46 75 17 91 75 94Z",
        "M76 94 32 101 13 122 68 119 91 105Z",
      ],
      right: [
        "M154 61 194 39 228 52 194 75 223 91 165 94Z",
        "M164 94 208 101 227 122 172 119 149 105Z",
      ],
      frame: [
        { d: "M120 27 169 54 184 132 120 210 56 132 71 54Z", fill: "high" },
        { d: "M120 39 158 62 170 127 120 193 70 127 82 62Z", fill: "dark" },
        { d: "M120 50 149 69 157 122 120 176 83 122 91 69Z", fill: "metal" },
        { d: "M120 59 141 75 147 118 120 161 93 118 99 75Z", fill: "dark" },
      ],
      plates: [
        { d: "M71 54 82 62 70 127 56 132Z", fill: "low" },
        { d: "M169 54 158 62 170 127 184 132Z", fill: "high" },
        { d: "M69 143 120 202 171 143 157 166 120 210 83 166Z", fill: "metal" },
        { d: "M48 77 75 88 68 100 34 91Z", fill: "high" },
        { d: "M192 77 165 88 172 100 206 91Z", fill: "high" },
      ],
      crown: [],
      core: [
        { d: "M120 62 146 107 135 103 135 148 120 166 105 148 105 103 94 107Z", fill: "light" },
        { d: "M91 123 105 133 105 153 84 138Z", fill: "metal" },
        { d: "M149 123 135 133 135 153 156 138Z", fill: "high" },
      ],
      energy: [
        { d: "M120 91 131 108 120 126 109 108Z", fill: "energy" },
        { d: "M120 96 125 108 120 117 115 108Z", fill: "light" },
      ],
      engravings: ["M92 75 81 120", "M148 75 159 120", "M101 63 120 51 139 63", "M80 133 120 182 160 133"],
      damage: ["M67 72 79 76", "M161 150 170 143"],
      texture: "M120 28 168 55 183 132 120 208 57 132 72 55Z",
    },
    gold: {
      aura: [
        "M120 7 128 24 120 34 112 24Z",
        "M120 233 128 216 120 206 112 216Z",
        "M17 120 31 113 39 120 31 127Z",
        "M223 120 209 113 201 120 209 127Z",
      ],
      underlay: ["M120 14 184 44 204 138 120 228 36 138 56 44Z"],
      left: [
        "M88 57 47 31 7 44 44 69 11 82 73 91Z",
        "M75 86 28 91 5 111 66 114 91 101Z",
        "M70 111 26 128 15 151 73 132 96 114Z",
      ],
      right: [
        "M152 57 193 31 233 44 196 69 229 82 167 91Z",
        "M165 86 212 91 235 111 174 114 149 101Z",
        "M170 111 214 128 225 151 167 132 144 114Z",
      ],
      frame: [
        { d: "M120 25 173 51 191 132 120 216 49 132 67 51Z", fill: "high" },
        { d: "M120 38 161 59 176 127 120 199 64 127 79 59Z", fill: "dark" },
        { d: "M120 48 152 66 164 123 120 184 76 123 88 66Z", fill: "metal" },
        { d: "M120 58 143 72 153 118 120 167 87 118 97 72Z", fill: "dark" },
      ],
      plates: [
        { d: "M49 132 64 127 120 199 120 216Z", fill: "low" },
        { d: "M191 132 176 127 120 199 120 216Z", fill: "high" },
        { d: "M67 51 79 59 64 127 49 132Z", fill: "metal" },
        { d: "M173 51 161 59 176 127 191 132Z", fill: "high" },
        { d: "M36 97 73 101 66 114 22 111Z", fill: "high" },
        { d: "M204 97 167 101 174 114 218 111Z", fill: "high" },
      ],
      crown: [
        { d: "M79 52 87 21 107 39 120 8 133 39 153 21 161 52 120 36Z", fill: "light" },
        { d: "M96 43 107 39 120 19 133 39 144 43 120 36Z", fill: "energy" },
      ],
      core: [
        { d: "M120 61 148 107 136 103 136 149 120 169 104 149 104 103 92 107Z", fill: "light" },
        { d: "M89 123 104 134 104 154 81 138Z", fill: "metal" },
        { d: "M151 123 136 134 136 154 159 138Z", fill: "high" },
      ],
      energy: [
        { d: "M120 85 136 108 120 133 104 108Z", fill: "energy" },
        { d: "M120 94 128 108 120 122 112 108Z", fill: "light" },
      ],
      engravings: ["M92 69 79 120", "M148 69 161 120", "M89 133 120 177 151 133", "M57 74 75 81", "M183 74 165 81"],
      damage: ["M67 92 77 95"],
      texture: "M120 26 172 52 190 132 120 214 50 132 68 52Z",
    },
    platine: {
      aura: [
        "M120 3 129 22 120 34 111 22Z",
        "M120 237 129 218 120 206 111 218Z",
        "M7 104 25 98 36 106 20 115Z",
        "M233 104 215 98 204 106 220 115Z",
      ],
      underlay: ["M120 11 188 40 210 137 120 232 30 137 52 40Z"],
      left: [
        "M91 53 50 23 2 34 42 62 5 75 73 88Z",
        "M77 81 25 84 1 104 68 110 94 96Z",
        "M70 105 18 120 3 145 72 128 98 110Z",
        "M74 127 31 157 26 179 83 143 100 119Z",
      ],
      right: [
        "M149 53 190 23 238 34 198 62 235 75 167 88Z",
        "M163 81 215 84 239 104 172 110 146 96Z",
        "M170 105 222 120 237 145 168 128 142 110Z",
        "M166 127 209 157 214 179 157 143 140 119Z",
      ],
      frame: [
        { d: "M120 21 178 47 198 130 120 220 42 130 62 47Z", fill: "high" },
        { d: "M120 34 166 56 182 126 120 204 58 126 74 56Z", fill: "dark" },
        { d: "M120 45 156 64 169 121 120 187 71 121 84 64Z", fill: "metal" },
        { d: "M120 55 146 70 158 117 120 170 82 117 94 70Z", fill: "dark" },
      ],
      plates: [
        { d: "M42 130 58 126 120 204 120 220Z", fill: "low" },
        { d: "M198 130 182 126 120 204 120 220Z", fill: "high" },
        { d: "M62 47 74 56 58 126 42 130Z", fill: "metal" },
        { d: "M178 47 166 56 182 126 198 130Z", fill: "high" },
        { d: "M25 84 73 92 68 110 8 103Z", fill: "light" },
        { d: "M215 84 167 92 172 110 232 103Z", fill: "light" },
        { d: "M24 130 72 118 68 131 11 150Z", fill: "metal" },
        { d: "M216 130 168 118 172 131 229 150Z", fill: "high" },
      ],
      crown: [
        { d: "M77 49 83 17 105 36 120 2 135 36 157 17 163 49 120 32Z", fill: "light" },
        { d: "M103 35 120 10 137 35 120 31Z", fill: "energy" },
      ],
      core: [
        { d: "M120 58 149 106 137 102 137 150 120 172 103 150 103 102 91 106Z", fill: "light" },
        { d: "M87 122 103 134 103 156 78 138Z", fill: "metal" },
        { d: "M153 122 137 134 137 156 162 138Z", fill: "high" },
      ],
      energy: [
        { d: "M120 79 139 107 120 139 101 107Z", fill: "energy" },
        { d: "M120 88 130 107 120 128 110 107Z", fill: "light" },
        { d: "M101 107 120 79 139 107 120 96Z", fill: "high" },
      ],
      engravings: ["M91 66 75 121", "M149 66 165 121", "M86 133 120 181 154 133", "M54 66 75 77", "M186 66 165 77", "M42 118 70 116", "M198 118 170 116"],
      damage: [],
      texture: "M120 22 177 48 197 130 120 218 43 130 63 48Z",
    },
    elite: {
      aura: [
        "M120 0 131 22 120 36 109 22Z",
        "M120 240 131 218 120 204 109 218Z",
        "M0 92 24 87 38 99 14 108Z",
        "M240 92 216 87 202 99 226 108Z",
        "M14 184 34 166 49 171 30 193Z",
        "M226 184 206 166 191 171 210 193Z",
      ],
      underlay: ["M120 8 192 35 216 135 120 236 24 135 48 35Z"],
      left: [
        "M94 48 52 16 0 25 41 55 2 69 73 85Z",
        "M79 76 22 76 0 96 69 106 96 91Z",
        "M70 100 14 113 0 139 71 125 100 106Z",
        "M72 122 22 148 8 178 80 142 103 115Z",
        "M83 145 42 185 44 213 99 157 108 124Z",
      ],
      right: [
        "M146 48 188 16 240 25 199 55 238 69 167 85Z",
        "M161 76 218 76 240 96 171 106 144 91Z",
        "M170 100 226 113 240 139 169 125 140 106Z",
        "M168 122 218 148 232 178 160 142 137 115Z",
        "M157 145 198 185 196 213 141 157 132 124Z",
      ],
      frame: [
        { d: "M120 17 183 42 205 129 120 224 35 129 57 42Z", fill: "high" },
        { d: "M120 30 171 51 188 125 120 208 52 125 69 51Z", fill: "dark" },
        { d: "M120 41 160 59 175 120 120 191 65 120 80 59Z", fill: "metal" },
        { d: "M120 51 150 66 163 116 120 174 77 116 90 66Z", fill: "dark" },
      ],
      plates: [
        { d: "M35 129 52 125 120 208 120 224Z", fill: "low" },
        { d: "M205 129 188 125 120 208 120 224Z", fill: "high" },
        { d: "M57 42 69 51 52 125 35 129Z", fill: "metal" },
        { d: "M183 42 171 51 188 125 205 129Z", fill: "high" },
        { d: "M20 76 75 89 69 106 4 96Z", fill: "energy" },
        { d: "M220 76 165 89 171 106 236 96Z", fill: "energy" },
        { d: "M14 129 71 115 69 129 1 145Z", fill: "metal" },
        { d: "M226 129 169 115 171 129 239 145Z", fill: "high" },
        { d: "M41 172 82 137 78 152 30 194Z", fill: "energy" },
        { d: "M199 172 158 137 162 152 210 194Z", fill: "energy" },
      ],
      crown: [
        { d: "M72 46 78 12 103 33 120 0 137 33 162 12 168 46 145 38 120 27 95 38Z", fill: "light" },
        { d: "M96 36 105 16 120 28 135 16 144 36 120 27Z", fill: "energy" },
        { d: "M112 18 120 1 128 18 120 27Z", fill: "high" },
      ],
      core: [
        { d: "M120 55 151 105 138 101 138 151 120 176 102 151 102 101 89 105Z", fill: "light" },
        { d: "M85 121 102 134 102 158 75 138Z", fill: "metal" },
        { d: "M155 121 138 134 138 158 165 138Z", fill: "high" },
      ],
      energy: [
        { d: "M120 72 143 106 120 145 97 106Z", fill: "energy" },
        { d: "M120 81 133 106 120 134 107 106Z", fill: "light" },
        { d: "M120 88 126 100 140 101 130 111 134 126 120 117 106 126 110 111 100 101 114 100Z", fill: "energy" },
      ],
      engravings: ["M89 62 71 119", "M151 62 169 119", "M82 132 120 186 158 132", "M52 60 75 75", "M188 60 165 75", "M34 113 68 112", "M206 113 172 112", "M53 154 79 135", "M187 154 161 135"],
      damage: [],
      texture: "M120 18 182 43 204 129 120 223 36 129 58 43Z",
    },
  };
  return geometries[id] || geometries.bronze;
}

function renderRankEmblem(rank, { compact = false } = {}) {
  const id = String(rank?.id || "bronze");
  const name = String(rank?.name || id);
  const index = Math.max(0, RANK_CONFIG.ranks.findIndex((candidate) => candidate.id === id));
  const geometry = rankEmblemGeometry(id);
  const prefix = `rank-${id}-${++RANK_EMBLEM_SEQUENCE}`;
  const paint = (surface) => `url(#${prefix}-${surface})`;
  const renderSurfaces = (surfaces = [], fallback = "metal") =>
    surfaces
      .map((surface) => {
        const item = typeof surface === "string" ? { d: surface } : surface;
        return `<path d="${item.d}" fill="${paint(item.fill || fallback)}"></path>`;
      })
      .join("");
  return `<svg class="rank-emblem${compact ? " rank-emblem--compact" : ""}" data-rank="${escapeHtml(id)}" data-rank-tier="${index + 1}" viewBox="0 0 240 240" role="img" aria-labelledby="${prefix}-title ${prefix}-description">
    <title id="${prefix}-title">Emblème du rang ${escapeHtml(name)}</title>
    <desc id="${prefix}-description">Emblème original TradeVisionPro de niveau ${index + 1}, composé de plaques métalliques, de gravures et d’un noyau central.</desc>
    <defs>
      <linearGradient id="${prefix}-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--rank-metal-high)"></stop>
        <stop offset=".18" stop-color="var(--rank-metal-mid)"></stop>
        <stop offset=".46" stop-color="var(--rank-metal-low)"></stop>
        <stop offset=".58" stop-color="var(--rank-metal-high)"></stop>
        <stop offset=".82" stop-color="var(--rank-metal-mid)"></stop>
        <stop offset="1" stop-color="var(--rank-metal-low)"></stop>
      </linearGradient>
      <linearGradient id="${prefix}-high" x1=".15" y1="0" x2=".85" y2="1">
        <stop offset="0" stop-color="var(--rank-edge)"></stop>
        <stop offset=".32" stop-color="var(--rank-metal-high)"></stop>
        <stop offset=".68" stop-color="var(--rank-metal-mid)"></stop>
        <stop offset="1" stop-color="var(--rank-metal-low)"></stop>
      </linearGradient>
      <linearGradient id="${prefix}-low" x1="0" y1="0" x2="1" y2=".2">
        <stop offset="0" stop-color="var(--rank-metal-low)"></stop>
        <stop offset=".5" stop-color="var(--rank-shadow)"></stop>
        <stop offset="1" stop-color="var(--rank-metal-mid)"></stop>
      </linearGradient>
      <linearGradient id="${prefix}-dark" x1=".2" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="var(--rank-dark)"></stop>
        <stop offset=".5" stop-color="var(--rank-shadow)"></stop>
        <stop offset="1" stop-color="var(--rank-metal-low)"></stop>
      </linearGradient>
      <linearGradient id="${prefix}-light" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--rank-edge)"></stop>
        <stop offset=".42" stop-color="var(--rank-light)"></stop>
        <stop offset="1" stop-color="var(--rank-metal-mid)"></stop>
      </linearGradient>
      <radialGradient id="${prefix}-energy" cx="46%" cy="38%" r="68%">
        <stop offset="0" stop-color="#fff"></stop>
        <stop offset=".28" stop-color="var(--rank-light)"></stop>
        <stop offset=".68" stop-color="var(--rank-energy)"></stop>
        <stop offset="1" stop-color="var(--rank-dark)"></stop>
      </radialGradient>
      <pattern id="${prefix}-grain" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
        <path d="M0 1H8M0 6H8" stroke="var(--rank-texture)" stroke-width=".55" opacity=".34"></path>
        <circle cx="2" cy="4" r=".55" fill="var(--rank-edge)" opacity=".2"></circle>
      </pattern>
      <filter id="${prefix}-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="${2.2 + index * 0.45}" result="blur"></feGaussianBlur>
        <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
    </defs>
    <g class="rank-emblem__aura" aria-hidden="true">
      <circle cx="120" cy="120" r="${88 + index * 4}"></circle>
      <circle cx="120" cy="120" r="${75 + index * 3}"></circle>
      ${geometry.aura.map((path) => `<path d="${path}"></path>`).join("")}
    </g>
    <g class="rank-emblem__underlay">${renderSurfaces(geometry.underlay, "dark")}</g>
    <g class="rank-emblem__wings rank-emblem__wings--left">${renderSurfaces(geometry.left)}</g>
    <g class="rank-emblem__wings rank-emblem__wings--right">${renderSurfaces(geometry.right)}</g>
    <g class="rank-emblem__crown">${renderSurfaces(geometry.crown, "light")}</g>
    <g class="rank-emblem__frame">${renderSurfaces(geometry.frame)}</g>
    <g class="rank-emblem__plates">${renderSurfaces(geometry.plates)}</g>
    <path class="rank-emblem__texture" d="${geometry.texture}" fill="${paint("grain")}"></path>
    <g class="rank-emblem__core">${renderSurfaces(geometry.core, "light")}</g>
    <g class="rank-emblem__energy" filter="url(#${prefix}-glow)">${renderSurfaces(geometry.energy, "energy")}</g>
    <g class="rank-emblem__engraving">${geometry.engravings.map((path) => `<path d="${path}"></path>`).join("")}</g>
    <g class="rank-emblem__damage rank-detail--fine">${geometry.damage.map((path) => `<path d="${path}"></path>`).join("")}</g>
    <g class="rank-emblem__shine" aria-hidden="true">
      <path d="M49 60 108 30"></path><path d="M73 150 129 58"></path><path d="M126 183 187 80"></path>
    </g>
    <g class="rank-emblem__micro-particles rank-detail--fine" aria-hidden="true">
      <circle cx="34" cy="48" r="1.4"></circle><circle cx="205" cy="54" r="1.1"></circle><circle cx="23" cy="151" r="1.2"></circle><circle cx="216" cy="160" r="1.5"></circle>
    </g>
  </svg>`;
}

function renderRankEmblemSet(context) {
  return `<div class="rank-emblem-stack" data-rank-emblem-stack="${escapeHtml(context)}">${RANK_CONFIG.ranks
    .map(
      (rank, index) => `<span data-rank-emblem="${escapeHtml(rank.id)}"${index ? " hidden" : ""}>${renderRankEmblem(rank)}</span>`,
    )
    .join("")}</div>`;
}

function serializedRankConfig() {
  return JSON.stringify(RANK_CONFIG).replaceAll("<", "\\u003c");
}

const VOLUME_PREREQUISITES = { 2: 1, 3: 1, 4: 3, 5: 4, 6: 5 };

function prerequisiteVolumeOrder(volumeOrder) {
  return Number(VOLUME_PREREQUISITES[volumeOrder] || Math.max(1, volumeOrder - 1));
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
  const label = String(block.label || "À noter");
  const isFormula = /P\(ruine\)|KELLY|f\*\s*=|Taux d’équilibre\s*=|Taille\s*=\s*risque monétaire/i.test(label);
  return `<aside class="callout callout--${escapeHtml(variant)}${isFormula ? " callout--formula" : ""}" role="note">
    <div class="callout__icon" aria-hidden="true">${isFormula ? "ƒ" : CALLOUT_ICONS[variant] || CALLOUT_ICONS.default}</div>
    <div><p class="callout__label">${escapeHtml(label)}</p>
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
  const variantClass = block.variant ? ` course-figure--${escapeHtml(block.variant)}` : "";
  return `<figure class="course-figure breakout${variantClass}">
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
    case "list": {
      const listTag = block.ordered ? "ol" : "ul";
      return `<${listTag} class="course-list${block.ordered ? " course-list--ordered" : ""}">${(block.items || [])
        .map(renderDefinitionItem)
        .join("")}</${listTag}>`;
    }
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
    trading_psychology: "Psychologie",
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
  return `<article class="volume-card${featured ? " volume-card--featured" : ""}" data-volume-card data-volume-order="${order}" data-volume-part-count="${metadata.parts?.length || 1}" data-volume-has-parts="${String(Boolean(metadata.parts?.length))}" data-volume-optional="${String(Boolean(metadata.optional))}">
    <div class="volume-card__top"><span>${volumeLabel(volume)}</span><span>${metadata.optional ? "Optionnel · " : ""}${escapeHtml(archetypeLabel(volume))}</span></div>
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
            }><span>V${volume.metadata.volumeNumber || volume.metadata.order}</span><span class="nav-volume__lock" data-volume-nav-lock hidden aria-hidden="true">🔒</span></a>`,
          )
          .join("")}
        <a class="profile-nav-link" href="${sitePath("/profil/")}"${activePage === "profile" ? ' aria-current="page"' : ""}>Profil</a>
      </nav>
      <div class="header-actions">
        ${showToc ? '<button class="icon-button toc-toggle" type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span aria-hidden="true">☰</span><span class="sr-only">Ouvrir le sommaire</span></button>' : ""}
        <a class="profile-shortcut" href="${sitePath("/profil/")}" aria-label="Ouvrir mon profil"><span data-profile-initials aria-hidden="true">TV</span><small data-profile-rank-mini>Bronze</small></a>
        <a class="icon-button" href="${sitePath("/recherche/")}" aria-label="Rechercher"><span aria-hidden="true">⌕</span></a>
        <button class="icon-button" type="button" data-theme-toggle aria-label="Changer de thème"><span data-theme-icon aria-hidden="true">◐</span></button>
      </div>
    </div>
  </header>`;
}

function renderRankProgressOverlay() {
  return `<section class="rank-reveal" data-rank-reveal data-rank="bronze" role="dialog" aria-modal="true" aria-labelledby="rank-reveal-title" hidden>
    <div class="rank-reveal__backdrop" aria-hidden="true"></div>
    <div class="rank-reveal__atmosphere" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="rank-reveal__particles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="rank-reveal__controls">
      <button class="rank-reveal__sound" type="button" data-rank-sound-toggle aria-pressed="true" aria-label="Désactiver les bruitages"><span data-rank-sound-icon aria-hidden="true">◖)))</span><span data-rank-sound-label>Son activé</span></button>
      <button class="rank-reveal__skip" type="button" data-rank-reveal-skip>Passer l’animation</button>
    </div>
    <div class="rank-reveal__panel">
      <div class="rank-reveal__stage">
        <div class="rank-reveal__light" aria-hidden="true"></div>
        <div class="rank-reveal__shockwave" aria-hidden="true"><i></i><i></i></div>
        <div class="rank-reveal__impact" aria-hidden="true"></div>
        <div class="rank-reveal__emblem">${renderRankEmblemSet("reveal")}</div>
      </div>
      <div class="rank-reveal__copy">
        <p class="rank-reveal__eyebrow" data-rank-reveal-eyebrow>Volume validé</p>
        <h2 id="rank-reveal-title" data-rank-reveal-title>Progression enregistrée</h2>
        <p class="rank-reveal__volume" data-rank-reveal-volume></p>
        <p class="rank-reveal__message" data-rank-reveal-message></p>
        <div class="rank-reveal__progress">
          <div><span data-rank-reveal-progress-label>Progression</span><strong data-rank-reveal-progress-value>0 / 1</strong></div>
          <span class="rank-reveal__track" role="progressbar" aria-label="Progression vers le prochain rang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-rank-reveal-progress><i data-rank-reveal-progress-bar></i></span>
        </div>
        <p class="rank-reveal__current">Rang actuel <strong data-rank-reveal-current>Bronze</strong></p>
        <button class="button button--primary rank-reveal__continue" type="button" data-rank-reveal-continue>Continuer <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </section>`;
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
  <script id="tradevisionpro-rank-config" type="application/json">${serializedRankConfig()}</script>
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
  ${renderRankProgressOverlay()}
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
        <p class="home-hero__lead">Une formation structurée pour relier analyse fondamentale, comportement des prix, gestion du risque, timing, macroéconomie et psychologie — des fondations jusqu’à la discipline de décision.</p>
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
      <div class="section-heading"><div><p class="eyebrow">Le parcours</p><h2>Cinq angles, une même discipline</h2></div><p>Chaque volume possède sa propre structure, mais partage un langage visuel et une méthode de lecture cohérents.</p></div>
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
  const requiredVolumeCount = volumes.filter((volume) => !volume.metadata.optional).length;
  const rankItems = RANK_CONFIG.ranks
    .map(
      (rank, index) => `<li data-profile-rank-item="${escapeHtml(rank.id)}"${index ? ' data-state="locked"' : ' data-state="current"'}>
        <span class="profile-rank-ladder__emblem">${renderRankEmblem(rank, { compact: true })}</span>
        <span><strong>${escapeHtml(rank.name)}</strong><small data-profile-rank-threshold="${escapeHtml(rank.id)}">${index ? "À débloquer" : "Rang initial"}</small></span>
        <i aria-hidden="true">${index ? "◇" : "✓"}</i>
      </li>`,
    )
    .join("");
  const rankThresholdFields = RANK_CONFIG.ranks
    .filter((rank) => rank.id !== "bronze")
    .map(
      (rank) => `<label><span>${escapeHtml(rank.name)}</span><input type="number" min="1" max="${volumes.length}" step="1" data-rank-threshold-input="${escapeHtml(rank.id)}" value="${Number(RANK_CONFIG.manualThresholds?.[rank.id] || 1)}"></label>`,
    )
    .join("");
  const adminVolumeOptions = volumes
    .map(
      (volume) => `<option value="${volume.metadata.volumeNumber || volume.metadata.order}">${volumeLabel(volume)} — ${escapeHtml(volume.metadata.title)}</option>`,
    )
    .join("");
  const volumeCards = volumes
    .map((volume) => {
      const metadata = volume.metadata;
      const order = metadata.volumeNumber || metadata.order;
      return `<article class="profile-volume" data-profile-volume data-volume-order="${order}" data-volume-part-count="${metadata.parts?.length || 1}" data-volume-has-parts="${String(Boolean(metadata.parts?.length))}" data-volume-optional="${String(Boolean(metadata.optional))}" data-volume-part-ids="${escapeHtml((metadata.parts || []).map((part) => part.id).join(","))}">
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
        <div><p class="eyebrow">Mon espace</p><p class="profile-welcome">Bonjour,</p><h1 data-profile-name>Votre profil</h1><div class="profile-identity__labels"><span class="profile-role" data-profile-role>Compte apprenant</span><span class="profile-rank-inline" data-profile-rank-mini>Bronze</span></div></div>
      </div>
      <div class="profile-session"><p><span aria-hidden="true">◆</span> Progression enregistrée sur cet appareil</p><button class="button button--secondary" type="button" data-profile-logout>Changer de compte</button></div>
    </header>

    <section class="profile-stats" aria-label="Résumé de votre parcours">
      <article><span>Volumes requis validés</span><strong><b data-profile-validated>0</b> / ${requiredVolumeCount}</strong><small>Le Volume 2 reste facultatif</small></article>
      <article><span>Volumes accessibles</span><strong data-profile-open>1</strong><small data-profile-access-note>Déblocage progressif</small></article>
      <article><span>Meilleur score</span><strong data-profile-best>—</strong><small>Sur l’ensemble des QCM</small></article>
      <article><span>Progression globale</span><strong data-profile-completion>0 %</strong><small>Volumes pédagogiques validés</small></article>
    </section>

    <section class="profile-rank-card" data-profile-rank-card data-rank="bronze" aria-labelledby="profile-rank-title">
      <div class="profile-rank-card__current">
        <div class="profile-rank-card__emblem">${renderRankEmblemSet("profile")}</div>
        <div><p class="eyebrow">Classement de progression</p><h2 id="profile-rank-title">Rang actuel : <strong data-profile-rank-name>Bronze</strong></h2><p data-profile-rank-description>Le parcours commence : les premières fondations sont en construction.</p></div>
      </div>
      <div class="profile-rank-card__metrics">
        <p><span>Volumes validés</span><strong><b data-profile-rank-validated>0</b> sur <b data-profile-rank-total>${volumes.length}</b></strong></p>
        <div class="profile-rank-progress">
          <div><span data-profile-rank-next-label>Progression vers Silver</span><strong data-profile-rank-progress-value>0 / 1</strong></div>
          <span role="progressbar" aria-label="Progression vers le prochain rang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-profile-rank-progress><i data-profile-rank-progress-bar></i></span>
        </div>
        <p class="profile-rank-card__remaining" data-profile-rank-remaining>Encore 1 volume avant le rang Silver.</p>
      </div>
      <ol class="profile-rank-ladder" aria-label="Rangs obtenus et verrouillés">${rankItems}</ol>
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

    <section class="profile-admin" data-rank-admin hidden aria-labelledby="profile-admin-title">
      <header><div><p class="eyebrow">Administration locale</p><h2 id="profile-admin-title">Rangs et validations</h2></div><p>Ces réglages s’appliquent aux profils enregistrés dans ce navigateur. Ils n’activent pas de synchronisation entre plusieurs appareils.</p></header>
      <div class="profile-admin__grid">
        <form class="rank-settings" data-rank-settings-form>
          <div><p class="eyebrow">Seuils des rangs</p><h3>Répartition configurable</h3><p>Le mode automatique recalcule les seuils lorsque le nombre de volumes évolue.</p></div>
          <label class="rank-settings__mode"><span>Mode de calcul</span><select data-rank-settings-mode><option value="auto">Automatique selon les volumes</option><option value="manual">Seuils manuels</option></select></label>
          <div class="rank-settings__thresholds">${rankThresholdFields}</div>
          <p class="rank-settings__preview" data-rank-settings-preview></p>
          <div class="rank-settings__actions"><button class="button button--primary" type="submit">Enregistrer les seuils</button><button class="button button--secondary" type="button" data-rank-settings-reset>Valeurs par défaut</button></div>
          <p class="rank-settings__status" data-rank-settings-status role="status" aria-live="polite"></p>
        </form>
        <form class="progress-reset" data-progress-reset-form>
          <div><p class="eyebrow">Recalcul immédiat</p><h3>Dévalider un volume</h3><p>La validation et les scores de toutes les parties du volume seront supprimés pour le profil choisi.</p></div>
          <label><span>Profil</span><select data-progress-reset-profile><option value="aedan-dechavigny">Aedan De Chavigny</option><option value="yann">Yann</option><option value="charly-labbetoul">Charly Labbetoul</option></select></label>
          <label><span>Volume</span><select data-progress-reset-volume>${adminVolumeOptions}</select></label>
          <button class="button button--secondary" type="submit">Dévalider ce volume</button>
          <p data-progress-reset-status role="status" aria-live="polite"></p>
        </form>
      </div>
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
  const complexityLabel = {
    1: "Fondations guidées",
    2: "Consolidation",
    3: "Application",
    4: "Analyse croisée",
    5: "Décision raisonnée",
  }[order] || "Application progressive";
  const completesVolume = Boolean(part && !nextPart && !awaitsNextPart);
  if (!questions.length) return "";
  return `<section class="quiz-workspace" aria-labelledby="quiz-title-${quizId}">
    <header class="quiz-intro">
      <div><p class="eyebrow">${escapeHtml(contextLabel)}</p><h2 id="quiz-title-${quizId}">${escapeHtml(quiz.title)}</h2></div>
      <div class="quiz-intro__levels"><span class="quiz-complexity"><small>Niveau de réflexion</small><strong>${escapeHtml(complexityLabel)}</strong></span><span class="quiz-threshold"><strong>8/10</strong> pour valider</span></div>
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
  const progressionCopy =
    partGroups.length === 1 && volume.metadata.partSequenceComplete === false
      ? "Validez cette première partie avec au moins 8/10. Votre meilleur score sera conservé pour la suite du Volume."
      : "Obtenez au moins 8/10 au QCM d’une partie pour ouvrir la suivante.";
  return `<section class="volume-parts-map" aria-labelledby="volume-parts-title">
    <header><div><p class="eyebrow">Parcours du ${volumeLabel(volume)}</p><h2 id="volume-parts-title">${countLabel} partie${partGroups.length > 1 ? "s" : ""}, ${countLabel.toLowerCase()} validation${partGroups.length > 1 ? "s" : ""}</h2></div><p>${progressionCopy}</p></header>
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
          ${
            part.order > 1
              ? `<section class="volume-part-lock volume-part-lock--quiz" data-part-quiz-lock aria-labelledby="part-quiz-lock-title-${part.order}">
            <span aria-hidden="true">◇</span><div><p class="eyebrow">QCM verrouillé</p><h3 id="part-quiz-lock-title-${part.order}">La Partie ${part.order} doit d’abord être accessible</h3><p>Obtenez au moins <strong>8/10</strong> au QCM de la Partie ${part.order - 1} pour ouvrir ce questionnaire.</p></div>
          </section>`
              : ""
          }
          <div data-part-quiz-protected${part.order > 1 ? " hidden" : ""}>${renderQuiz(volume, partQuiz, volumes, part, partGroups)}</div>
        </section>`;
      })
      .join("")}
  </section>`;
}

export function renderVolumePage(volume, volumes, quiz) {
  const metadata = volume.metadata;
  const order = metadata.volumeNumber || metadata.order;
  const prerequisiteOrder = prerequisiteVolumeOrder(order);
  const prerequisiteVolume = volumes.find((candidate) => (candidate.metadata.volumeNumber || candidate.metadata.order) === prerequisiteOrder);
  const partGroups = volumePartGroups(volume);
  const toc = partGroups.length ? buildPartsToc(volume, partGroups) : buildToc(volume.blocks);
  const groups = sectionGroups(volume.blocks);
  const countLabel = partGroups.length
    ? `${partGroups.length} partie${partGroups.length > 1 ? "s" : ""}`
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
          )} mots</span>${volume.stats.figureCount ? `<span>${volume.stats.figureCount} figure${volume.stats.figureCount > 1 ? "s" : ""}</span>` : ""}</div>
        </header>
        <div class="mobile-toc-card"><button type="button" data-toc-toggle aria-expanded="false" aria-controls="volume-sidebar"><span>Ouvrir le sommaire</span><span aria-hidden="true">☰</span></button></div>
        <section class="volume-lock" data-volume-lock hidden aria-labelledby="volume-lock-title-${order}">
          <span class="volume-lock__icon" aria-hidden="true">◇</span>
          <div><p class="eyebrow">Étape à valider</p><h2 id="volume-lock-title-${order}">Ce volume est encore verrouillé</h2><p>Obtenez au moins <strong>8/10</strong> au QCM du Volume ${prerequisiteOrder} pour poursuivre votre parcours.</p>${
            prerequisiteVolume
              ? `<a class="button button--primary" href="${escapeHtml(
                  sitePath(`/volumes/${prerequisiteVolume.metadata.slug}/#exercices`),
                )}">Passer le QCM du Volume ${prerequisiteOrder} <span aria-hidden="true">→</span></a>`
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
