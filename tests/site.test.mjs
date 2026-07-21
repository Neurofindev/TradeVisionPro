import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

async function builtBasePath() {
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  return home.match(/data-base-path="([^"]+)"/)?.[1] || "/";
}

async function htmlFiles(directory = DIST) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(absolute)));
    else if (entry.name.endsWith(".html")) files.push(absolute);
  }
  return files;
}

test("all expected pages are built", () => {
  for (const relative of [
    "index.html",
    "volumes/index.html",
    "recherche/index.html",
    "volumes/1-fondations-et-analyses/index.html",
    "volumes/2-dossiers-historiques/index.html",
    "volumes/3-analyse-technique/index.html",
  ]) {
    assert.ok(existsSync(path.join(DIST, relative)), relative);
  }
});

test("TradeVisionPro identity and icon assets are published", async () => {
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  const basePath = await builtBasePath();
  assert.ok(home.includes("TradeVisionPro"));
  assert.ok(home.includes(`${basePath}brand/tradevisionpro-mark-256.png`));
  assert.ok(home.includes(`${basePath}brand/tradevisionpro-favicon.ico`));
  for (const asset of [
    "tradevisionpro-mark-256.png",
    "tradevisionpro-favicon-32.png",
    "tradevisionpro-favicon-64.png",
    "tradevisionpro-apple-touch-icon.png",
    "tradevisionpro-favicon.ico",
  ]) {
    assert.ok(existsSync(path.join(DIST, "brand", asset)), asset);
  }
});

test("home accompaniment and dark primary action stay complete and legible", async () => {
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const methodGrid = home.match(/<div class="method-grid">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.equal((methodGrid.match(/<article>/g) || []).length, 4);
  for (const heading of ["Cours théoriques", "Cours pratiques", "Sources d’apprentissage", "Échanges constructifs"]) {
    assert.ok(methodGrid.includes(heading), heading);
  }
  assert.match(styles, /:root\[data-theme="dark"\] \.button--primary\s*\{[^}]*color:\s*#17131a/s);
});

test("volume two renders every specialist component", async () => {
  const html = await readFile(path.join(DIST, "volumes/2-dossiers-historiques/index.html"), "utf8");
  assert.equal((html.match(/class="case-header"/g) || []).length, 5);
  assert.equal((html.match(/class="stat-row breakout"/g) || []).length, 5);
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 3);
  assert.ok(html.includes("LEÇON DU CAS"));
  assert.ok(html.includes("class=\"callout callout--summary\""));
  assert.ok(!html.includes("Unsupported content block"));
});

test("volume three renders the complete multi-timeframe chapter", async () => {
  const html = await readFile(path.join(DIST, "volumes/3-analyse-technique/index.html"), "utf8");
  assert.ok(html.includes("L’analyse technique"));
  assert.ok(html.includes("L’art du timing, un outil essentiel."));
  assert.ok(html.includes("📆 Multi-timeframe confluence"));
  assert.equal((html.match(/class="lesson-note /g) || []).length, 5);
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 2);
  assert.ok(html.includes("class=\"chapter-highlights\""));
  assert.ok(html.includes("class=\"chapter-conclusion\""));
  assert.ok(html.includes("Ces timefraime offrent de nouvelles confluences"));
  assert.ok(!html.includes("Unsupported content block"));
});

test("search index covers all volumes and figure captions", async () => {
  const index = JSON.parse(await readFile(path.join(DIST, "search-index.json"), "utf8"));
  assert.ok(index.some((entry) => entry.volume === "Volume 1" && /PER/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 2" && /Archegos/i.test(entry.text)));
  assert.ok(index.some((entry) => /Figure 2.+Enron/is.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /Multi-timeframe confluence/i.test(entry.text)));
});

test("generated internal links resolve", async () => {
  const basePath = await builtBasePath();
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
      const urlPath = match[1].split("#")[0].split("?")[0];
      if (!urlPath) continue;
      assert.ok(urlPath.startsWith(basePath), `${match[1]} is outside ${basePath}`);
      const deploymentPath = `/${urlPath.slice(basePath.length)}`;
      let target = path.join(DIST, deploymentPath);
      if (deploymentPath.endsWith("/")) target = path.join(target, "index.html");
      assert.ok(existsSync(target), `${match[1]} referenced by ${path.relative(DIST, file)}`);
    }
  }
});

test("every rendered image is described or explicitly decorative", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
      const hasDescription = /alt="[^"]+"/.test(match[0]);
      const isDecorative = /alt=""/.test(match[0]) && /aria-hidden="true"/.test(match[0]);
      assert.ok(hasDescription || isDecorative, match[0]);
    }
  }
});
