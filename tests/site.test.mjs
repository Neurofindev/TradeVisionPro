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
    "profil/index.html",
    "volumes/1-fondations-et-analyses/index.html",
    "volumes/2-dossiers-historiques/index.html",
    "volumes/3-analyse-technique/index.html",
    "volumes/4-analyse-macroeconomique/index.html",
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

test("HTML automatically refreshes versioned frontend assets", async () => {
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  const styleVersion = home.match(/assets\/styles\.css\?v=([a-f0-9]{12})/)?.[1];
  const clientVersion = home.match(/assets\/client\.js\?v=([a-f0-9]{12})/)?.[1];
  assert.ok(styleVersion, "version CSS absente");
  assert.equal(clientVersion, styleVersion);
});

test("every page is protected by the access gate without exposing the code", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    assert.match(html, /<html lang="fr" class="access-locked"/);
    assert.ok(html.includes("data-access-gate"), path.relative(DIST, file));
    assert.ok(html.includes("data-access-form"), path.relative(DIST, file));
    assert.ok(html.includes("data-access-input"), path.relative(DIST, file));
  }

  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.ok(client.includes("9c6e9172266f90a10de4d8cc2a767e9815488ae926d39ee68b1fab34091d4235"));
  assert.ok(client.includes('name: "Aedan De Chavigny"'));
  assert.ok(!client.includes("Aedan Dechavigny"));
  assert.ok(client.includes("e5af42e35c3fb1fe989dee4acf652b81ef0dc956753926d6b22b705d110b01fc"));
  assert.ok(client.includes("4f8c5f5a97c0bbf84c176fda321365057b68cd8a135eaf003eae6584af3f77ba"));
  assert.ok(client.includes('tradevisionpro-access-session-v3'));
  assert.ok(!client.includes("fa5d171c9280388b26a2569e9fccc7683ab3ec70b685b3f9cde7066eee987263"));
  assert.ok(!client.includes("tradevisionpro-access-session-v2"));
  assert.ok(!client.includes("tradevisionpro-access-session-v1"));
  assert.ok(client.includes('crypto.subtle.digest("SHA-256"'));
  assert.ok(!client.includes("110930"));
  assert.ok(!client.includes("020926"));
  assert.ok(!client.includes("251126"));
  assert.ok(!client.includes("300402"));
  assert.match(styles, /html\.access-locked body > :not\(\.access-gate\)/);
});

test("every course stage has a ten-question exercise and an enriching correction", async () => {
  const quizzes = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"));
  const slugs = ["1-fondations-et-analyses", "2-dossiers-historiques", "3-analyse-technique", "4-analyse-macroeconomique"];
  for (const [index, slug] of slugs.entries()) {
    const quiz = quizzes[slug];
    const quizStages = quiz.parts || [quiz];
    for (const stage of quizStages) {
      assert.equal(stage.questions.length, 10, `${slug} · ${stage.title}`);
      for (const question of stage.questions) {
        assert.equal(question.options.length, 4, question.id);
        assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, question.id);
        assert.ok(question.explanation.length >= 40, question.id);
      }
    }

    const html = await readFile(path.join(DIST, `volumes/${slug}/index.html`), "utf8");
    assert.ok(html.includes('data-volume-tab="course"'), slug);
    assert.ok(html.includes('data-volume-tab="exercises"'), slug);
    assert.ok(html.includes(`data-volume-order="${index + 1}"`), slug);
    assert.equal((html.match(/class="quiz-question"/g) || []).length, 10 * quizStages.length, slug);
    assert.equal((html.match(/data-quiz-feedback/g) || []).length, 20 * quizStages.length, slug);
    assert.ok(html.includes("8/10"), slug);
    assert.ok(html.includes("data-quiz-review"), slug);
    assert.ok(html.includes("data-quiz-retry"), slug);
    assert.ok(html.includes("data-quiz-restart-inline"), slug);
    assert.ok(html.includes("Recommencer le QCM"), slug);
  }
});

test("quiz results use a dedicated responsive screen and can be restarted", async () => {
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.ok(client.includes("quizForm.hidden = true"));
  assert.ok(client.includes("function resetQuiz()"));
  assert.ok(client.includes('querySelector("[data-quiz-review]")'));
  assert.match(styles, /\.quiz-workspace\.is-result-mode/);
  assert.match(styles, /\.quiz-result\s*\{[^}]*width:\s*min\(52rem,/s);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*?\.quiz-result\s*\{[^}]*width:\s*calc\(100% - 1\.7rem\)/);
});

test("course progression is isolated by profile while admin access bypasses locks", async () => {
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  const volumeTwo = await readFile(path.join(DIST, "volumes/2-dossiers-historiques/index.html"), "utf8");
  assert.ok(client.includes("const passingScore = 8"));
  assert.ok(client.includes('root.dataset.accessRole === "admin"'));
  assert.ok(client.includes("tradevisionpro-course-progress-v2"));
  assert.ok(client.includes("${courseProgressPrefix}:${profile.id}"));
  assert.ok(client.includes("Math.max(Number(progressData[volumeKey]) || 0, score)"));
  assert.ok(client.includes("score >= passingScore"));
  assert.ok(client.includes('parsed["1-part-1"] = parsed["1"]'));
  assert.ok(client.includes('parsed["1-part-2"] = parsed["1"]'));
  assert.ok(client.includes('parsed["3-part-1"] = parsed["3"]'));
  assert.ok(client.includes("isPartUnlocked"));
  assert.ok(client.includes("completesVolume"));
  assert.equal((home.match(/data-volume-card/g) || []).length, 4);
  assert.ok(volumeTwo.includes("data-volume-lock"));
  assert.ok(volumeTwo.includes("Ce volume est encore verrouillé"));
  assert.ok(volumeTwo.includes("Passer le QCM du Volume 1"));
});

test("locked volume layout stays readable on desktop", async () => {
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.match(styles, /@media \(min-width: 60\.01rem\)[\s\S]*?\.volume-page\.is-locked \.volume-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.volume-page\.is-locked \.course-content\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(22rem, 0\.8fr\)/s);
  assert.match(styles, /\.volume-page\.is-locked \.volume-lock\s*\{[^}]*width:\s*100%[^}]*grid-column:\s*2/s);
  assert.match(styles, /@media \(max-width: 60rem\)[\s\S]*?\.volume-shell\s*\{[^}]*display:\s*block/);
});

test("profile page presents identity, useful progress and account controls", async () => {
  const profile = await readFile(path.join(DIST, "profil/index.html"), "utf8");
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.ok(profile.includes('aria-current="page">Profil</a>'));
  assert.ok(profile.includes("data-profile-name"));
  assert.ok(profile.includes("data-profile-role"));
  assert.ok(profile.includes("data-profile-logout"));
  assert.ok(profile.includes("Progression enregistrée sur cet appareil"));
  assert.equal((profile.match(/data-profile-volume data-volume-order=/g) || []).length, 4);
  assert.ok(profile.includes("data-profile-next-title"));
  assert.ok(profile.includes("data-profile-progress-bar"));
  assert.ok(profile.includes('data-profile-achievement="complete"'));
  assert.ok(client.includes('sessionStorage.removeItem(accessSessionKey)'));
  assert.ok(client.includes('profile.role === "admin" ? "Administrateur · accès intégral"'));
  assert.match(styles, /\.profile-dashboard\s*\{/);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*?\.profile-stats,/);
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

test("volume one presents two progressive parts and a detailed asset panorama", async () => {
  const html = await readFile(path.join(DIST, "volumes/1-fondations-et-analyses/index.html"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const quizzes = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["1-fondations-et-analyses"].parts;
  assert.ok(html.includes("Deux parties, deux validations"));
  assert.ok(html.includes("Comprendre l’investissement"));
  assert.ok(html.includes("Choisir un actif et l’analyser"));
  assert.ok(html.includes("Panorama des principales familles d’actifs financiers"));
  assert.ok(html.includes("Neuf expositions à ne pas confondre"));
  assert.ok(html.includes("Validez la Partie 1 pour continuer"));
  for (const criterion of ["Rôle", "Horizon", "Perte acceptable", "Liquidité et coûts", "Corrélation"]) {
    assert.ok(html.includes(`<strong>${criterion} :</strong>`), criterion);
  }
  assert.doesNotMatch(html, /<ul class="course-list">\s*(?:<li>\s*<\/li>\s*)+<\/ul>/);
  assert.equal((html.match(/class="volume-part"/g) || []).length, 2);
  assert.equal((html.match(/class="asset-card"/g) || []).length, 9);
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 2);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 20);
  assert.equal((html.match(/data-completes-volume="false"/g) || []).length, 1);
  assert.equal((html.match(/data-completes-volume="true"/g) || []).length, 1);
  assert.equal(quizzes[0].questions.length, 10);
  assert.equal(quizzes[1].questions.length, 10);
  assert.doesNotMatch(JSON.stringify(quizzes[0]), /ETF|Forex|cryptoactif|produit dérivé/i);
  assert.match(JSON.stringify(quizzes[1]), /action|obligation|ETF|EUR\/USD|cryptoactif|dérivé/i);
  assert.match(styles, /\.asset-grid__items\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /@media \(max-width: 40rem\)[\s\S]*?\.asset-grid__items\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.ok(!html.includes("Unsupported content block"));
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

test("volume three renders three distinct progressive parts", async () => {
  const html = await readFile(path.join(DIST, "volumes/3-analyse-technique/index.html"), "utf8");
  const quizzes = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["3-analyse-technique"].parts;
  assert.ok(html.includes("L’analyse technique"));
  assert.ok(html.includes("L’art du timing, un outil essentiel."));
  assert.ok(html.includes("📆 Multi-timeframe confluence"));
  assert.ok(html.includes("🔥 Les supports et résistances"));
  assert.ok(html.includes("🚨 Les tendances boursières"));
  assert.ok(html.includes("Trois parties, trois validations"));
  assert.ok(html.includes("Contexte, niveaux et timing"));
  assert.ok(html.includes("L’essentiel des bougies japonaises"));
  assert.ok(html.includes("Les indicateurs techniques"));
  assert.ok(html.includes("RSI · MACD · moyennes mobiles · volume"));
  assert.ok(html.includes("Du dessin à la décision"));
  assert.ok(html.includes("Validez la Partie 1 pour continuer"));
  assert.ok(html.includes("Validez la Partie 2 pour continuer"));
  assert.ok(html.includes("Trois QCM indépendants"));
  assert.ok(html.includes("10 questions dans chaque QCM"));
  assert.ok(html.includes("QCM de la Partie 1 — Contexte, niveaux et timing"));
  assert.ok(html.includes("QCM de la Partie 2 — Bougies japonaises"));
  assert.ok(html.includes("QCM de la Partie 3 — Indicateurs techniques"));
  assert.ok(!html.includes("20 questions"));
  assert.ok(!html.includes("30 questions"));
  assert.equal((html.match(/class="volume-part"/g) || []).length, 3);
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 3);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 30);
  assert.equal((html.match(/data-completes-volume="false"/g) || []).length, 2);
  assert.equal((html.match(/data-completes-volume="true"/g) || []).length, 1);
  assert.equal((html.match(/data-awaits-next-part="true"/g) || []).length, 0);
  assert.equal((html.match(/data-awaits-future-volume="true"/g) || []).length, 0);
  assert.equal(quizzes[0].questions.length, 10);
  assert.equal(quizzes[1].questions.length, 10);
  assert.equal(quizzes[2].questions.length, 10);
  assert.doesNotMatch(JSON.stringify(quizzes[0]), /Doji|Marteau|Avalement|bougies japonaises/i);
  assert.doesNotMatch(JSON.stringify(quizzes[1].questions.map((question) => question.question)), /RSI|MACD|moyenne mobile/i);
  assert.doesNotMatch(JSON.stringify(quizzes[2]), /Doji|Marteau|Avalement/i);
  assert.equal((html.match(/class="lesson-note /g) || []).length, 13);
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 30);
  assert.equal((html.match(/class="data-table breakout"/g) || []).length, 21);
  assert.ok(html.includes("class=\"chapter-highlights\""));
  assert.ok(html.includes("class=\"chapter-conclusion\""));
  assert.ok(html.includes("Ces timefraime offrent de nouvelles confluences"));
  assert.ok(html.includes("sur le titre AMAZON, on peut observer"));
  assert.ok(html.includes("Prenons l’exemple du titre NVIDIA :"));
  assert.ok(html.includes("le cours de l’action GOOGLE affiche une progression continue"));
  assert.ok(html.includes("l’évolution récente du Bitcoin (BTC) illustre une tendance baissière"));
  assert.ok(html.includes("l’action C3.AI oscille entre 14,80 $ et 19,21 $"));
  assert.ok(html.includes("Google — exemple de tendance haussière."));
  assert.ok(html.includes("Bitcoin — exemple de tendance baissière sur l’unité 4 heures."));
  assert.ok(html.includes("C3.AI — phase de range entre 14,80 $ et 19,21 $."));
  assert.ok(!html.includes("(image 1)"));
  assert.ok(!html.includes("(image 2)"));
  assert.ok(!html.includes("(image 3)"));
  assert.ok(html.includes("Volume 4"));
  assert.match(html, /href="[^"]*\/volumes\/4-analyse-macroeconomique\//);
  assert.ok(!html.includes("Le Volume 3 ajoute RSI"));
  assert.ok(html.includes("Un indicateur ne prédit pas le marché"));
  assert.ok(html.includes("Figure 5 — NVIDIA : SMA 9, volume, MACD 12-26-9 et RSI 14"));
  assert.ok(!html.includes("Unsupported content block"));

  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  assert.ok(client.includes("il permettra d’accéder au Volume"));
  assert.ok(client.includes('parsed["3"] && !parsed["3-part-3"]'));
});

test("volume four integrates a clear progressive macroeconomic part", async () => {
  const html = await readFile(path.join(DIST, "volumes/4-analyse-macroeconomique/index.html"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const quiz = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["4-analyse-macroeconomique"].parts[0];
  assert.ok(html.includes("L’analyse macroéconomique"));
  assert.ok(html.includes("Les fondements de l’analyse macroéconomique"));
  assert.ok(html.includes("Une partie, une validation"));
  assert.ok(html.includes("Un QCM indépendant"));
  assert.ok(html.includes("QCM de la Partie 1 — Fondements macroéconomiques"));
  assert.ok(html.includes("Pourquoi le consensus domine souvent la première réaction"));
  assert.ok(html.includes("L’inflation : CPI, Core CPI, PCE et Core PCE"));
  assert.ok(html.includes("6. L’emploi : NFP, chômage, jobless claims et JOLTS"));
  assert.ok(html.includes("Figure 8 — Ventes au détail américaines, variation mensuelle"));
  assert.equal((html.match(/class="volume-part"/g) || []).length, 1);
  assert.equal((html.match(/class="volume-part__hero volume-part__hero--compact"/g) || []).length, 1);
  assert.match(styles, /\.volume-part__hero--compact h2\s*\{[^}]*font-size:\s*clamp\(1\.8rem, 3\.45vw, 2\.85rem\)/s);
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 1);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 10);
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 8);
  assert.equal((html.match(/class="data-table breakout"/g) || []).length, 20);
  assert.ok(html.includes('data-completes-volume="false"'));
  assert.ok(html.includes('data-awaits-next-part="true"'));
  assert.equal(quiz.questions.length, 10);
  assert.ok(new Set(quiz.questions.map((question) => question.answer)).size >= 3);
  assert.match(JSON.stringify(quiz), /consensus|Core PCE|PIB réel|NFP|JOLTS|ventes au détail/i);
  assert.doesNotMatch(JSON.stringify(quiz.questions.map((question) => question.question)), /Doji|MACD|moyenne mobile/i);
  assert.ok(!html.includes("Volume 5"));
  assert.ok(!html.includes("Unsupported content block"));
});

test("volume three part headers stay compact and homogeneous on desktop", async () => {
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.match(styles, /\.volume-part__hero\s*\{[^}]*padding:\s*clamp\(1\.35rem, 3vw, 2\.1rem\)/s);
  assert.match(styles, /\.volume-part__hero h2\s*\{[^}]*font-size:\s*clamp\(2rem, 4\.5vw, 3\.65rem\)/s);
  assert.match(styles, /\.volume-part__index\s*\{[^}]*font-size:\s*clamp\(2\.8rem, 6vw, 4\.65rem\)/s);
});

test("search index covers all volumes and figure captions", async () => {
  const index = JSON.parse(await readFile(path.join(DIST, "search-index.json"), "utf8"));
  assert.ok(index.some((entry) => entry.volume === "Volume 1" && /PER/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 1" && /ETF|cryptoactifs|produits dérivés/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 2" && /Archegos/i.test(entry.text)));
  assert.ok(index.some((entry) => /Figure 2.+Enron/is.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /Multi-timeframe confluence/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /tendances boursières/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /bougies japonaises/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /Trois méthodes ascendantes/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /Relative Strength Index|RSI/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 3" && /MACD 12-26-9/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 4" && /consensus/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 4" && /Core PCE/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 4" && /JOLTS/i.test(entry.text)));
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
