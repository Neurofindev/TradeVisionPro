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
    "volumes/5-psychologie-du-trading/index.html",
    "volumes/6-money-management/index.html",
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
  assert.ok(client.includes("10fa41674c48ed8376b5f82fd8777454fa0023062f1b99b03645d00525dd2065"));
  assert.ok(!client.includes("e5af42e35c3fb1fe989dee4acf652b81ef0dc956753926d6b22b705d110b01fc"));
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
  const slugs = [
    "1-fondations-et-analyses",
    "2-dossiers-historiques",
    "3-analyse-technique",
    "4-analyse-macroeconomique",
    "5-psychologie-du-trading",
    "6-money-management",
  ];
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
  const volumeThree = await readFile(path.join(DIST, "volumes/3-analyse-technique/index.html"), "utf8");
  const volumeFour = await readFile(path.join(DIST, "volumes/4-analyse-macroeconomique/index.html"), "utf8");
  const volumeFive = await readFile(path.join(DIST, "volumes/5-psychologie-du-trading/index.html"), "utf8");
  const volumeSix = await readFile(path.join(DIST, "volumes/6-money-management/index.html"), "utf8");
  assert.ok(client.includes("const passingScore = 8"));
  assert.ok(client.includes('root.dataset.accessRole === "admin"'));
  assert.ok(client.includes("const volumePrerequisites = { 2: 1, 3: 1, 4: 3, 5: 4, 6: 5 }"));
  assert.ok(client.includes("prerequisiteVolumeOrder"));
  assert.ok(client.includes("tradevisionpro-course-progress-v2"));
  assert.ok(client.includes("${courseProgressPrefix}:${profile.id}"));
  assert.ok(client.includes("Math.max(Number(progressData[volumeKey]) || 0, score)"));
  assert.ok(client.includes("score >= passingScore"));
  assert.ok(client.includes('parsed["1-part-1"] = parsed["1"]'));
  assert.ok(client.includes('parsed["1-part-2"] = parsed["1"]'));
  assert.ok(client.includes('parsed["3-part-1"] = parsed["3"]'));
  assert.ok(client.includes("volume4-two-parts-migrated"));
  assert.ok(client.includes('parsed["4-part-2"]'));
  assert.ok(client.includes("volume4-three-parts-migrated"));
  assert.ok(client.includes('parsed["4-part-3"]'));
  assert.ok(client.includes("allPartsPassed"));
  assert.ok(client.includes("isPartUnlocked"));
  assert.ok(client.includes("completesVolume"));
  assert.equal((home.match(/data-volume-card/g) || []).length, 6);
  assert.ok(volumeTwo.includes("data-volume-lock"));
  assert.ok(volumeTwo.includes("Ce volume est encore verrouillé"));
  assert.ok(volumeTwo.includes("Passer le QCM du Volume 1"));
  assert.ok(volumeThree.includes("Passer le QCM du Volume 1"));
  assert.ok(volumeFour.includes("Passer le QCM du Volume 3"));
  assert.ok(volumeFive.includes("Passer le QCM du Volume 4"));
  assert.ok(volumeSix.includes("Passer le QCM du Volume 5"));
  assert.equal((home.match(/data-volume-nav-lock/g) || []).length, 6);
  assert.ok(home.includes('data-volume-optional="true"'));
  assert.ok(home.includes("Optionnel · Cas historiques"));
});

test("locked volume shortcuts display a padlock and volume two stays optional", async () => {
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const profile = await readFile(path.join(DIST, "profil/index.html"), "utf8");
  assert.match(styles, /\.main-nav \.nav-volume\[data-state="locked"\] \.nav-volume__lock\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.nav-volume__lock\s*\{[^}]*position:\s*absolute[^}]*border-radius:\s*50%/s);
  assert.ok(profile.includes("Volumes requis validés"));
  assert.ok(profile.includes("Le Volume 2 reste facultatif"));
  assert.ok(profile.includes('data-volume-order="2"'));
  assert.ok(profile.includes('data-volume-optional="true"'));
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
  assert.equal((profile.match(/data-profile-volume data-volume-order=/g) || []).length, 6);
  assert.ok(profile.includes("data-profile-next-title"));
  assert.ok(profile.includes("data-profile-progress-bar"));
  assert.ok(profile.includes('data-profile-achievement="complete"'));
  assert.ok(client.includes('sessionStorage.removeItem(accessSessionKey)'));
  assert.ok(client.includes('profile.role === "admin" ? "Administrateur · accès intégral"'));
  assert.match(styles, /\.profile-dashboard\s*\{/);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*?\.profile-stats,/);
});

test("ranks depend only on fully validated volumes and use configurable thresholds", async () => {
  const ranks = JSON.parse(await readFile(path.join(ROOT, "config", "ranks.json"), "utf8"));
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  assert.deepEqual(ranks.ranks.map((rank) => rank.id), ["bronze", "silver", "gold", "platine", "elite"]);
  assert.equal(ranks.defaultMode, "auto");
  assert.equal(ranks.countOptionalVolumes, true);
  assert.deepEqual(
    ranks.ranks.map((rank) => Math.ceil(5 * ranks.autoFractions[rank.id])),
    [0, 1, 2, 3, 4],
  );
  assert.ok(client.includes('const rankSettingsKey = "tradevisionpro-rank-settings-v1"'));
  assert.ok(client.includes("function validatedVolumeCount("));
  assert.ok(client.includes('Number(progressData[String(order)] || 0) >= passingScore'));
  assert.ok(client.includes("function rankForValidated("));
  assert.ok(client.includes("function rankProgressState("));
  assert.ok(client.includes("const volumeValidatedNow = !volumeWasValidated && volumeIsNowValidated"));
  assert.ok(!client.includes("rankExperiencePoints"));
  assert.ok(!client.includes("rankAverageScore"));
  assert.ok(!client.includes("rankTimeSpent"));
  assert.ok(!client.includes("isAdminAccess() ? totalAvailableVolumes"));
});

test("profile shows original rank emblems, progression and local admin controls", async () => {
  const profile = await readFile(path.join(DIST, "profil/index.html"), "utf8");
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  assert.ok(profile.includes("Classement de progression"));
  assert.ok(profile.includes("data-profile-rank-card"));
  assert.ok(profile.includes("data-profile-rank-name"));
  assert.ok(profile.includes("data-profile-rank-validated"));
  assert.ok(profile.includes("data-profile-rank-progress"));
  assert.equal((profile.match(/data-profile-rank-item=/g) || []).length, 5);
  for (const rank of ["bronze", "silver", "gold", "platine", "elite"]) {
    assert.ok(profile.includes(`data-profile-rank-item="${rank}"`), rank);
    assert.ok(profile.includes(`data-rank="${rank}"`), rank);
  }
  assert.ok(profile.includes("data-rank-admin"));
  assert.ok(profile.includes("Répartition configurable"));
  assert.ok(profile.includes("Automatique selon les volumes"));
  assert.ok(profile.includes("Dévalider un volume"));
  assert.ok(client.includes("localStorage.setItem(rankSettingsKey"));
  assert.ok(client.includes("key.startsWith(`${volumeOrder}-part-`)"));
  assert.ok(client.includes("updateCourseProgress()"));
  assert.match(styles, /\.profile-rank-card\s*\{/);
  assert.match(styles, /\.rank-emblem__wings path\s*\{/);
  assert.match(styles, /\.profile-admin\s*\{/);
});

test("rank emblems use distinct progressive vector architectures and premium materials", async () => {
  const profile = await readFile(path.join(DIST, "profil/index.html"), "utf8");
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const pathCounts = ["bronze", "silver", "gold", "platine", "elite"].map((rank) => {
    const emblem = profile.match(new RegExp(`<svg class="rank-emblem[^"]*" data-rank="${rank}"[\\s\\S]*?<\\/svg>`))?.[0] || "";
    assert.ok(emblem, `emblème ${rank}`);
    assert.ok(emblem.includes("<linearGradient"), `${rank} : dégradé métallique`);
    assert.ok(emblem.includes("<radialGradient"), `${rank} : noyau énergétique`);
    assert.ok(emblem.includes("<pattern"), `${rank} : texture vectorielle`);
    assert.ok(emblem.includes("rank-emblem__engraving"), `${rank} : gravures`);
    return (emblem.match(/<path/g) || []).length;
  });
  assert.ok(pathCounts.every((count, index) => index === 0 || count > pathCounts[index - 1]), pathCounts.join(" → "));
  assert.ok(client.includes("const reducedRankEffects"));
  assert.ok(client.includes("navigator.hardwareConcurrency"));
  assert.ok(client.includes('card.addEventListener("pointermove"'));
  assert.match(styles, /--rank-metal-high:/);
  assert.match(styles, /--rank-metal-low:/);
  assert.match(styles, /@keyframes rank-surface-scan/);
  assert.match(styles, /@keyframes rank-core-breathe/);
  assert.match(styles, /\.rank-emblem--compact \.rank-detail--fine/);
  assert.match(styles, /\.profile-rank-ladder__emblem \.rank-emblem--compact\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.profile-rank-ladder li\s*\{[^}]*grid-template-columns:\s*2\.7rem minmax\(0,\s*1fr\) 0\.75rem/s);
});

test("volume validation launches responsive rank progress and rank-up animations", async () => {
  const volumeOne = await readFile(path.join(DIST, "volumes/1-fondations-et-analyses/index.html"), "utf8");
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const ranks = JSON.parse(await readFile(path.join(ROOT, "config", "ranks.json"), "utf8"));
  assert.ok(volumeOne.includes("data-rank-reveal"));
  assert.ok(volumeOne.includes("data-rank-reveal-skip"));
  assert.ok(volumeOne.includes("data-rank-reveal-continue"));
  assert.ok(volumeOne.includes("data-rank-reveal-progress"));
  assert.ok(volumeOne.includes("data-rank-sound-toggle"));
  assert.ok(volumeOne.includes("data-rank-sound-label"));
  assert.equal((volumeOne.match(/data-rank-emblem="/g) || []).length, 5);
  assert.ok(client.includes("function showRankProgress("));
  assert.ok(client.includes('rankReveal.classList.add(rankUp ? "is-rank-up" : "is-standard")'));
  assert.ok(client.includes("if (reduceMotion) rankReveal.classList.add"));
  assert.ok(client.includes("showRankProgress({"));
  assert.ok(client.includes("Volume ${volumeOrder} validé ·"));
  assert.ok(client.includes('event.key !== "Tab"'));
  assert.match(styles, /\.rank-reveal\s*\{[^}]*position:\s*fixed/s);
  assert.match(styles, /@keyframes rank-forge-left/);
  assert.match(styles, /@keyframes rank-forge-core/);
  assert.match(styles, /@keyframes rank-forge-underlay/);
  assert.match(styles, /@keyframes rank-forge-plates/);
  assert.match(styles, /@keyframes rank-energy-activate/);
  assert.match(styles, /@keyframes rank-shockwave/);
  assert.match(styles, /@keyframes rank-final-vibration/);
  assert.match(styles, /@keyframes rank-progress-beam/);
  assert.match(styles, /@keyframes rank-counter-increment/);
  assert.match(styles, /@keyframes rank-validation-particle/);
  assert.match(styles, /--forge-copy:\s*3460ms/);
  assert.match(styles, /--continue-delay:\s*4100ms/);
  assert.match(styles, /\.rank-effects-lite \.rank-reveal/);
  assert.match(styles, /\.rank-reveal\[data-rank="elite"\] \.rank-reveal__light/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.rank-reveal/);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*?\.rank-reveal__panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.deepEqual(
    ranks.ranks.map((rank) => rank.celebration),
    [
      "Votre progression commence ici.",
      "Une nouvelle étape est franchie.",
      "Votre maîtrise commence à se distinguer.",
      "Vous atteignez un niveau avancé.",
      "Formation maîtrisée. Vous avez atteint l’excellence.",
    ],
  );
});

test("rank sound design is original, synchronized, optional and persistent", async () => {
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  assert.ok(client.includes('const rankSoundPreferenceKey = "tradevisionpro-rank-sound-v1"'));
  assert.ok(client.includes("window.AudioContext || window.webkitAudioContext"));
  assert.ok(client.includes("function metallicImpact("));
  assert.ok(client.includes("function energyRise("));
  assert.ok(client.includes("function resolutionChord("));
  assert.ok(client.includes("function playStandard("));
  assert.ok(client.includes("function playRankUp("));
  assert.ok(client.includes("rankSoundEngine.prime()"));
  assert.ok(client.includes("rankSoundEngine.stop()"));
  assert.ok(client.includes("localStorage.setItem(rankSoundPreferenceKey"));
  for (const rank of ["bronze", "silver", "gold", "platine", "elite"]) {
    assert.match(client, new RegExp(`${rank}: \\{ root:`), rank);
  }
  assert.ok(!client.includes("<audio"));
  assert.doesNotMatch(client, /["'][^"']+\.(?:mp3|wav|ogg)["']/i);
});

test("quiz reflection level progresses gradually across volumes", async () => {
  const quizzes = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"));
  const stages = (slug) => quizzes[slug].parts || [quizzes[slug]];
  const easyCount = (stage) => stage.questions.filter((question) => question.difficulty === "Facile").length;
  assert.equal(easyCount(stages("1-fondations-et-analyses")[0]), 3);
  assert.ok(stages("3-analyse-technique").every((stage) => easyCount(stage) <= 2));
  assert.ok(stages("4-analyse-macroeconomique").every((stage) => easyCount(stage) <= 1));
  assert.ok(stages("5-psychologie-du-trading").every((stage) => easyCount(stage) <= 1));
  assert.match(JSON.stringify(stages("3-analyse-technique")), /Vous préparez une entrée en H1|RSI 14 est affiché sur un graphique H4/);
  assert.match(JSON.stringify(stages("5-psychologie-du-trading")), /acquis des volumes historiques, techniques et macroéconomiques/);

  const volumeOne = await readFile(path.join(DIST, "volumes/1-fondations-et-analyses/index.html"), "utf8");
  const volumeThree = await readFile(path.join(DIST, "volumes/3-analyse-technique/index.html"), "utf8");
  const volumeFour = await readFile(path.join(DIST, "volumes/4-analyse-macroeconomique/index.html"), "utf8");
  const volumeFive = await readFile(path.join(DIST, "volumes/5-psychologie-du-trading/index.html"), "utf8");
  assert.ok(volumeOne.includes("Fondations guidées"));
  assert.ok(volumeThree.includes("Application"));
  assert.ok(volumeFour.includes("Analyse croisée"));
  assert.ok(volumeFive.includes("Décision raisonnée"));
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
  assert.ok(html.includes("Analyse fondamentale d’entreprise"));
  assert.ok(html.includes("Dans le cadre d’une action"));
  assert.ok(html.includes("Entreprise, secteur, résultats et valorisation"));
  assert.ok(!html.includes("2.1 Analyse fondamentale : la machine économique"));
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
  assert.ok(html.includes("ils ne déterminent pas la force d’une future cassure"));
  assert.ok(html.includes("il ne confirme pas à lui seul un retournement"));
  assert.ok(html.includes("Le niveau des 130 $ illustre un changement de polarité"));
  assert.ok(!html.includes("Plus une zone de support ou de résistance est testée"));
  assert.ok(!html.includes("de nombreux stop-loss sont déclenchés"));
  assert.ok(!html.includes("aussi appelés zones psychologiques"));
  assert.ok(html.includes("Figure 5 — NVIDIA : SMA 9, volume, MACD 12-26-9 et RSI 14"));
  assert.ok(!html.includes("Unsupported content block"));

  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  assert.ok(client.includes("il permettra d’accéder au Volume"));
  assert.ok(client.includes('parsed["3"] && !parsed["3-part-3"]'));
});

test("volume four progresses from central banks to macro data and geopolitics", async () => {
  const html = await readFile(path.join(DIST, "volumes/4-analyse-macroeconomique/index.html"), "utf8");
  const styles = await readFile(path.join(DIST, "assets", "styles.css"), "utf8");
  const quizzes = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["4-analyse-macroeconomique"].parts;
  assert.ok(html.includes("L’analyse Fondamentale"));
  assert.ok(html.includes("Les banques centrales"));
  assert.ok(html.includes("Les données macroéconomiques"));
  assert.ok(html.includes("Géopolitique et marchés financiers"));
  assert.ok(html.includes("Trois parties, trois validations"));
  assert.ok(html.includes("QCM par partie"));
  assert.ok(html.includes("QCM de la Partie 1 — Banques centrales"));
  assert.ok(html.includes("QCM de la Partie 2 — Données macroéconomiques"));
  assert.ok(html.includes("QCM de la Partie 3 — Géopolitique et marchés financiers"));
  assert.ok(html.includes("Qu&#039;est-ce qu&#039;une banque centrale ?"));
  assert.ok(html.includes("Les outils de politique monétaire"));
  assert.ok(html.includes("Méthode d&#039;analyse d&#039;une décision monétaire"));
  assert.ok(html.includes("Comment utiliser cette Partie 2"));
  assert.ok(html.includes("Du chiffre publié au changement d’anticipations"));
  assert.ok(html.includes("Il n’est pas nécessaire de réapprendre ici les mandats et les outils"));
  assert.ok(html.includes("Pourquoi le consensus domine souvent la première réaction"));
  assert.ok(html.includes("L’inflation : CPI, Core CPI, PCE et Core PCE"));
  assert.ok(html.includes("6. L’emploi : NFP, chômage, jobless claims et JOLTS"));
  assert.ok(html.includes("Figure 8 — Ventes au détail américaines, variation mensuelle"));
  assert.ok(html.includes("la réaction initiale peut provenir d’intervenants humains"));
  assert.ok(html.includes("éléments complémentaires et suffisamment indépendants"));
  assert.ok(html.includes("Écart mesurable entre la valeur publiée et le consensus"));
  assert.ok(html.includes("Objectifs de la Partie 3"));
  assert.ok(html.includes("Appliquer la chaîne de transmission aux chocs géopolitiques"));
  assert.ok(html.includes("Dossier 1 — Brexit"));
  assert.ok(html.includes("Dossier 2 — Abqaiq"));
  assert.ok(html.includes("Dossier 6 — Mer Rouge et routes maritimes"));
  assert.ok(html.includes("POSITION DANS LE VOLUME 4"));
  assert.ok(!html.includes("les algorithmes réagissent au titre, puis le marché humain"));
  assert.ok(!html.includes("Plus les confirmations sont nombreuses"));
  assert.ok(!html.includes("Écart qualitatif entre le chiffre réel"));
  assert.ok(!html.includes("Ces indicateurs influencent les décisions des banques centrales. Or, les taux directeurs"));
  assert.equal((html.match(/class="volume-part"/g) || []).length, 3);
  assert.equal((html.match(/class="volume-part__hero"/g) || []).length, 3);
  assert.match(styles, /\.volume-part__hero--compact h2\s*\{[^}]*font-size:\s*clamp\(1\.8rem, 3\.45vw, 2\.85rem\)/s);
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 3);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 30);
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 22);
  assert.equal((html.match(/class="data-table breakout"/g) || []).length, 49);
  assert.ok(html.includes('data-completes-volume="false"'));
  assert.ok(html.includes('data-completes-volume="true"'));
  assert.ok(!html.includes('data-awaits-next-part="true"'));
  assert.ok(!html.includes('data-awaits-future-volume="true"'));
  assert.ok(html.includes('data-next-step-label="Volume 5"'));
  assert.equal(quizzes.length, 3);
  assert.ok(quizzes.every((quiz) => quiz.questions.length === 10));
  assert.ok(quizzes.every((quiz) => new Set(quiz.questions.map((question) => question.answer)).size >= 3));
  assert.match(JSON.stringify(quizzes[0]), /mandat|QE|hawkish|YCC|Jackson Hole|communication/i);
  assert.match(JSON.stringify(quizzes[1]), /consensus|Core PCE|PIB réel|NFP|JOLTS|ventes au détail/i);
  assert.match(JSON.stringify(quizzes[2]), /géopolitique|géoéconomie|VIX|USD\/CNH|Abqaiq|sources/i);
  assert.doesNotMatch(JSON.stringify(quizzes.flatMap((quiz) => quiz.questions.map((question) => question.question))), /Doji|MACD|moyenne mobile/i);
  assert.ok(!html.includes("Unsupported content block"));
});

test("volume five presents a corrected psychology course and one progressive part", async () => {
  const html = await readFile(path.join(DIST, "volumes/5-psychologie-du-trading/index.html"), "utf8");
  const quiz = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["5-psychologie-du-trading"];
  assert.ok(html.includes("Psychologie du trading"));
  assert.ok(html.includes("Les biais cognitifs"));
  assert.ok(html.includes("Une partie, une validation"));
  assert.ok(html.includes(">1 partie<"));
  assert.ok(html.includes("Votre meilleur score sera conservé pour la suite du Volume."));
  assert.equal((html.match(/class="volume-part"/g) || []).length, 1);
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 1);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 10);
  assert.equal((html.match(/data-part-quiz-lock/g) || []).length, 0);
  assert.equal((html.match(/data-awaits-next-part="true"/g) || []).length, 1);
  assert.ok(html.includes("La théorie des perspectives peut ainsi contribuer à expliquer l’effet de disposition"));
  assert.ok(html.includes("elle n’en constitue ni une cause unique ni une conséquence automatique"));
  assert.ok(html.includes("elle ne mesure pas directement la surconfiance de chaque investisseur"));
  assert.ok(html.includes("La FOMO (« fear of missing out ») est un état émotionnel et motivationnel"));
  assert.ok(html.includes("volatilité annualisée réalisée du Nasdaq à environ 47 % pour l’année 2000"));
  assert.ok(html.includes("Cette concomitance ne suffit pas à attribuer le mouvement à une cause unique"));
  assert.ok(html.includes("Un ordre stop est un déclencheur et ne garantit pas son prix d’exécution"));
  assert.ok(!html.includes("Plan du module"));
  assert.ok(!html.includes("Quiz de validation"));
  assert.ok(!html.includes("Réponses au quiz"));
  assert.ok(!html.includes("surconfiance inversée"));
  assert.equal((html.match(/class="course-figure breakout"/g) || []).length, 2);
  assert.ok(html.includes("Graphique mensuel du Nasdaq Composite montrant la hausse de la fin des années 1990"));
  assert.match(JSON.stringify(quiz), /surconfiance|confirmation|ancrage|FOMO|ordre stop|GameStop/i);
  assert.equal(quiz.parts[0].questions.length, 10);
  assert.ok(new Set(quiz.parts[0].questions.map((question) => question.answer)).size >= 3);
  assert.ok(!html.includes("Unsupported content block"));
});

test("volume six presents the complete money management course and a ten-question QCM", async () => {
  const html = await readFile(path.join(DIST, "volumes/6-money-management/index.html"), "utf8");
  const quiz = JSON.parse(await readFile(path.join(ROOT, "config", "quizzes.json"), "utf8"))["6-money-management"];
  const client = await readFile(path.join(DIST, "assets", "client.js"), "utf8");
  assert.ok(html.includes("Money Management"));
  assert.ok(html.includes("Modèle simplifié : P(ruine)"));
  assert.ok(html.includes("Kelly — f* = p − (1 − p) / b"));
  assert.ok(html.includes("Taux d’équilibre = 1 ÷ (1 + gain moyen en R)"));
  assert.equal((html.match(/callout--formula/g) || []).length, 4);
  assert.ok(html.includes("Exemple actions, calculé étape par étape"));
  assert.ok(html.includes("Quantité exécutable"));
  assert.ok(html.includes('<ol class="course-list course-list--ordered">'));
  assert.ok(html.includes("60 actions"));
  assert.ok(html.includes("la capacité d’achat n’est pas le budget de risque"));
  assert.ok(html.includes("6.3 Cas concret — trailing structurel sur AAPL"));
  assert.ok(html.includes("Entrée pédagogique"));
  assert.ok(html.includes("Premier stop relevé"));
  assert.ok(html.includes("course-figure--trade-plan"));
  assert.ok(html.includes("Un ordre stop fixe un seuil de déclenchement"));
  assert.ok(html.includes("8. Conclusion"));
  assert.ok(!html.includes("8. Exercices d’application"));
  assert.ok(!html.includes("Corrigés rapides"));
  assert.equal((html.match(/class="quiz-workspace"/g) || []).length, 1);
  assert.equal((html.match(/class="quiz-question"/g) || []).length, 10);
  assert.equal(quiz.questions.length, 10);
  assert.ok(new Set(quiz.questions.map((question) => question.answer)).size >= 3);
  assert.match(JSON.stringify(quiz), /taille maximale|Forex|espérance nette|P\(ruine\)|Kelly/i);
  assert.ok(client.includes("6: 5"));
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
  assert.ok(index.some((entry) => entry.volume === "Volume 4" && /Brexit|Abqaiq|Mer Rouge|semi-conducteurs/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 5" && /biais cognitifs|surconfiance/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 5" && /GameStop|FOMO/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 6" && /risque de ruine|Kelly/i.test(entry.text)));
  assert.ok(index.some((entry) => entry.volume === "Volume 6" && /trailing structurel|stop relevé/i.test(entry.text)));
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
