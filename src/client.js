(() => {
  const root = document.documentElement;
  const basePath = root.dataset.basePath || "/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const accessSessionKey = "tradevisionpro-access-session-v2";
  const legacyAccessSessionKey = "tradevisionpro-access-session-v1";
  const learnerAccessCodeHash = "fa5d171c9280388b26a2569e9fccc7683ab3ec70b685b3f9cde7066eee987263";
  const adminAccessCodeHash = "4f8c5f5a97c0bbf84c176fda321365057b68cd8a135eaf003eae6584af3f77ba";
  const accessGate = document.querySelector("[data-access-gate]");
  const accessCard = document.querySelector("[data-access-card]");
  const accessForm = document.querySelector("[data-access-form]");
  const accessInput = document.querySelector("[data-access-input]");
  const accessSubmit = document.querySelector("[data-access-submit]");
  const accessStatus = document.querySelector("[data-access-status]");
  const accessVisibility = document.querySelector("[data-access-visibility]");
  const accessVisibilityIcon = document.querySelector("[data-access-visibility-icon]");

  async function digestAccessCode(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function updateAccessStatus(message, state = "neutral") {
    if (!accessStatus || !accessCard || !accessInput) return;
    accessStatus.textContent = message;
    accessStatus.dataset.state = state;
    accessCard.classList.remove("is-error", "is-success");
    accessInput.setAttribute("aria-invalid", String(state === "error"));
    if (state === "error") {
      requestAnimationFrame(() => accessCard.classList.add("is-error"));
    } else if (state === "success") {
      accessCard.classList.add("is-success");
    }
  }

  function grantAccess(role = "learner") {
    root.dataset.accessRole = role;
    root.classList.remove("access-locked");
    root.classList.add("access-granted");
    if (accessGate) accessGate.hidden = true;
    updateCourseProgress();
    document.querySelector(".brand, main a, main button, main")?.focus({ preventScroll: true });
  }

  if (root.classList.contains("access-granted")) {
    if (!root.dataset.accessRole) root.dataset.accessRole = "learner";
    if (accessGate) accessGate.hidden = true;
  } else {
    root.classList.add("access-locked");
    if (accessGate) accessGate.hidden = false;
    requestAnimationFrame(() => accessInput?.focus({ preventScroll: true }));
  }

  accessInput?.addEventListener("input", () => {
    accessInput.value = accessInput.value.replace(/\D/g, "").slice(0, 6);
    if (accessInput.getAttribute("aria-invalid") === "true") {
      updateAccessStatus("Votre accès restera actif pendant cette session.");
    }
  });

  accessVisibility?.addEventListener("click", () => {
    if (!accessInput) return;
    const show = accessInput.type === "password";
    accessInput.type = show ? "text" : "password";
    accessVisibility.setAttribute("aria-pressed", String(show));
    accessVisibility.setAttribute("aria-label", show ? "Masquer le code" : "Afficher le code");
    if (accessVisibilityIcon) accessVisibilityIcon.textContent = show ? "◌" : "◉";
    accessInput.focus();
  });

  accessForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accessInput || !accessSubmit) return;
    const value = accessInput.value;
    if (!/^\d{6}$/.test(value)) {
      updateAccessStatus("Le code doit comporter exactement 6 chiffres.", "error");
      accessInput.focus();
      return;
    }

    accessSubmit.disabled = true;
    accessSubmit.setAttribute("aria-busy", "true");
    updateAccessStatus("Vérification du code…");
    try {
      const digest = await digestAccessCode(value);
      const role = digest === adminAccessCodeHash ? "admin" : digest === learnerAccessCodeHash ? "learner" : "";
      if (!role) {
        accessInput.value = "";
        updateAccessStatus("Code incorrect. L’accès reste verrouillé.", "error");
        accessInput.focus();
        return;
      }

      sessionStorage.setItem(accessSessionKey, role);
      sessionStorage.removeItem(legacyAccessSessionKey);
      updateAccessStatus("Code validé. Ouverture de votre espace…", "success");
      window.setTimeout(() => grantAccess(role), reduceMotion ? 0 : 420);
    } catch (error) {
      updateAccessStatus("Validation momentanément indisponible. Réessayez.", "error");
      accessInput.focus();
    } finally {
      accessSubmit.disabled = false;
      accessSubmit.removeAttribute("aria-busy");
    }
  });

  const courseProgressKey = "tradevisionpro-course-progress-v1";
  const passingScore = 8;

  function readCourseProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(courseProgressKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveQuizScore(volumeOrder, score) {
    const progressData = readCourseProgress();
    const key = String(volumeOrder);
    progressData[key] = Math.max(Number(progressData[key]) || 0, score);
    localStorage.setItem(courseProgressKey, JSON.stringify(progressData));
  }

  function isAdminAccess() {
    return root.dataset.accessRole === "admin";
  }

  function isVolumeUnlocked(volumeOrder, progressData = readCourseProgress()) {
    return isAdminAccess() || volumeOrder <= 1 || Number(progressData[String(volumeOrder - 1)] || 0) >= passingScore;
  }

  function updateCourseProgress() {
    const progressData = readCourseProgress();
    document.querySelectorAll("[data-volume-card]").forEach((card) => {
      const order = Number(card.dataset.volumeOrder || 1);
      const unlocked = isVolumeUnlocked(order, progressData);
      const score = Number(progressData[String(order)] || 0);
      card.classList.toggle("is-locked", !unlocked);
      card.classList.toggle("is-complete", score >= passingScore);
      const stateIcon = card.querySelector("[data-volume-state-icon]");
      const stateLabel = card.querySelector("[data-volume-state-label]");
      if (stateIcon) stateIcon.textContent = !unlocked ? "◇" : score >= passingScore ? "✓" : "◆";
      if (stateLabel) {
        stateLabel.textContent = !unlocked
          ? `À débloquer avec le Volume ${order - 1}`
          : score >= passingScore
            ? `Validé · ${score}/10`
            : "Disponible";
      }
      card.querySelectorAll("[data-volume-link]").forEach((link) => {
        link.dataset.locked = String(!unlocked);
        if (!unlocked) link.setAttribute("aria-label", `Volume ${order} verrouillé — découvrir les conditions d’accès`);
        else link.removeAttribute("aria-label");
      });
    });

    document.querySelectorAll("[data-volume-link]").forEach((link) => {
      const order = Number(link.dataset.volumeOrder || 1);
      const unlocked = isVolumeUnlocked(order, progressData);
      link.classList.toggle("is-locked", !unlocked);
      link.dataset.locked = String(!unlocked);
      if (link.classList.contains("nav-volume")) {
        link.dataset.state = !unlocked ? "locked" : Number(progressData[String(order)] || 0) >= passingScore ? "complete" : "open";
      }
    });

    const volumePage = document.querySelector("[data-volume-page]");
    if (volumePage) {
      const order = Number(volumePage.dataset.volumeOrder || 1);
      const unlocked = isVolumeUnlocked(order, progressData);
      const lockPanel = volumePage.querySelector("[data-volume-lock]");
      const protectedContent = volumePage.querySelector("[data-volume-protected]");
      const sidebar = volumePage.querySelector(".volume-sidebar");
      volumePage.classList.toggle("is-locked", !unlocked);
      if (lockPanel) lockPanel.hidden = unlocked;
      if (protectedContent) protectedContent.hidden = !unlocked;
      if (sidebar) {
        sidebar.hidden = !unlocked;
        sidebar.inert = !unlocked;
      }
      const score = Number(progressData[String(order)] || 0);
      volumePage.querySelectorAll("[data-volume-score]").forEach((label) => {
        label.textContent = score ? `${score}/10` : "À faire";
        label.classList.toggle("is-complete", score >= passingScore);
      });
    }
  }

  const volumeTabs = [...document.querySelectorAll("[data-volume-tab]")];
  const volumePanes = [...document.querySelectorAll("[data-volume-pane]")];

  function setVolumeTab(tabName, { focus = false, updateHash = true } = {}) {
    if (!volumeTabs.length || !volumePanes.length) return;
    volumeTabs.forEach((tab) => {
      const selected = tab.dataset.volumeTab === tabName;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    volumePanes.forEach((pane) => {
      pane.hidden = pane.dataset.volumePane !== tabName;
    });
    if (updateHash) {
      const url = new URL(window.location.href);
      if (tabName === "exercises") url.hash = "exercices";
      else if (url.hash === "#exercices") url.hash = "";
      history.replaceState(null, "", url);
    }
    window.dispatchEvent(new Event("scroll"));
  }

  volumeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setVolumeTab(tab.dataset.volumeTab));
    tab.addEventListener("keydown", (event) => {
      if (!/ArrowLeft|ArrowRight|Home|End/.test(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? volumeTabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + volumeTabs.length) % volumeTabs.length;
      setVolumeTab(volumeTabs[targetIndex].dataset.volumeTab, { focus: true });
    });
  });

  document.querySelectorAll("[data-open-exercise]").forEach((button) => {
    button.addEventListener("click", () => {
      setVolumeTab("exercises");
      document.querySelector(".volume-tabs")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setDrawer(false);
    });
  });
  document.querySelectorAll("[data-toc-link]").forEach((link) => {
    link.addEventListener("click", () => setVolumeTab("course", { updateHash: false }));
  });

  document.querySelectorAll("[data-quiz]").forEach((quizForm) => {
    const questions = [...quizForm.querySelectorAll("[data-quiz-question]")];
    const previousButton = quizForm.querySelector("[data-quiz-previous]");
    const nextButton = quizForm.querySelector("[data-quiz-next]");
    const submitButton = quizForm.querySelector("[data-quiz-submit]");
    const help = quizForm.querySelector("[data-quiz-help]");
    const progressText = quizForm.querySelector("[data-quiz-progress-text]");
    const answeredText = quizForm.querySelector("[data-quiz-answered]");
    const progressBar = quizForm.querySelector("[data-quiz-progress-bar]");
    const result = quizForm.parentElement.querySelector("[data-quiz-result]");
    let currentQuestion = 0;
    let reviewed = false;

    function selectedAnswer(question) {
      return question.querySelector('input[type="radio"]:checked');
    }

    function updateQuizView() {
      questions.forEach((question, index) => {
        question.hidden = index !== currentQuestion;
      });
      const selected = selectedAnswer(questions[currentQuestion]);
      const answeredCount = questions.filter((question) => selectedAnswer(question)).length;
      if (progressText) progressText.textContent = `Question ${currentQuestion + 1} sur ${questions.length}`;
      if (answeredText) answeredText.textContent = `${answeredCount} réponse${answeredCount > 1 ? "s" : ""} sur ${questions.length}`;
      if (progressBar) progressBar.style.transform = `scaleX(${(currentQuestion + 1) / questions.length})`;
      if (previousButton) previousButton.disabled = currentQuestion === 0;
      if (nextButton) {
        nextButton.hidden = currentQuestion === questions.length - 1;
        nextButton.disabled = !reviewed && !selected;
      }
      if (submitButton) {
        submitButton.hidden = reviewed || currentQuestion !== questions.length - 1;
        submitButton.disabled = !selected;
      }
      if (help) {
        help.textContent = reviewed
          ? "Parcourez les corrections pour consolider chaque notion."
          : selected
            ? currentQuestion === questions.length - 1
              ? "Vous pouvez maintenant valider l’ensemble de vos réponses."
              : "Réponse enregistrée. Vous pouvez poursuivre."
            : "Choisissez une réponse pour poursuivre.";
      }
    }

    questions.forEach((question) => {
      question.addEventListener("change", updateQuizView);
    });
    previousButton?.addEventListener("click", () => {
      currentQuestion = Math.max(0, currentQuestion - 1);
      updateQuizView();
      questions[currentQuestion].focus({ preventScroll: true });
    });
    nextButton?.addEventListener("click", () => {
      if (!reviewed && !selectedAnswer(questions[currentQuestion])) return;
      currentQuestion = Math.min(questions.length - 1, currentQuestion + 1);
      updateQuizView();
      questions[currentQuestion].focus({ preventScroll: true });
    });

    quizForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const firstMissing = questions.findIndex((question) => !selectedAnswer(question));
      if (firstMissing >= 0) {
        currentQuestion = firstMissing;
        updateQuizView();
        if (help) help.textContent = "Répondez à cette question avant de valider le QCM.";
        return;
      }

      let score = 0;
      questions.forEach((question) => {
        const answer = Number(selectedAnswer(question).value);
        const correctAnswer = Number(question.dataset.answer);
        const correct = answer === correctAnswer;
        if (correct) score += 1;
        question.classList.toggle("is-correct", correct);
        question.classList.toggle("is-incorrect", !correct);
        question.querySelectorAll(".quiz-options label").forEach((label, index) => {
          label.classList.toggle("is-correct-answer", index === correctAnswer);
          label.classList.toggle("is-wrong-answer", index === answer && !correct);
        });
        const feedback = question.querySelector("[data-quiz-feedback]");
        const feedbackTitle = question.querySelector("[data-quiz-feedback-title]");
        if (feedback) feedback.hidden = false;
        if (feedbackTitle) feedbackTitle.textContent = correct ? "Bonne réponse" : "À revoir";
      });

      reviewed = true;
      const volumeOrder = Number(quizForm.dataset.volumeOrder || 1);
      const passed = score >= passingScore;
      saveQuizScore(volumeOrder, score);
      updateCourseProgress();
      quizForm.classList.add("is-reviewed");
      if (result) {
        result.hidden = false;
        result.classList.toggle("is-success", passed);
        result.classList.toggle("is-retry", !passed);
        result.querySelector("[data-quiz-result-score]").textContent = String(score);
        result.querySelector("[data-quiz-result-eyebrow]").textContent = passed ? "Volume validé" : "Objectif non atteint";
        result.querySelector("[data-quiz-result-title]").textContent = passed ? "Bravo, votre parcours continue." : "Encore un effort pour débloquer la suite.";
        result.querySelector("[data-quiz-result-message]").textContent = passed
          ? score === 10
            ? "Maîtrise parfaite : toutes les réponses sont correctes. Le volume suivant est maintenant accessible."
            : `Vous obtenez ${score}/10. Le seuil est atteint et le volume suivant est maintenant accessible.`
          : `Vous obtenez ${score}/10. Consultez les explications puis recommencez : il faut au moins 8/10 pour poursuivre.`;
        const nextVolumeLink = result.querySelector("[data-quiz-next-volume]");
        if (nextVolumeLink) {
          nextVolumeLink.hidden = !passed;
          nextVolumeLink.textContent = quizForm.dataset.nextVolumeTitle
            ? `Accéder au Volume ${volumeOrder + 1} →`
            : "Revenir à tous les volumes →";
        }
        result.focus({ preventScroll: true });
        result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      }
      updateQuizView();
    });

    result?.querySelector("[data-quiz-retry]")?.addEventListener("click", () => {
      reviewed = false;
      currentQuestion = 0;
      quizForm.reset();
      quizForm.classList.remove("is-reviewed");
      questions.forEach((question) => {
        question.classList.remove("is-correct", "is-incorrect");
        question.querySelectorAll(".quiz-options label").forEach((label) => label.classList.remove("is-correct-answer", "is-wrong-answer"));
        const feedback = question.querySelector("[data-quiz-feedback]");
        if (feedback) feedback.hidden = true;
      });
      result.hidden = true;
      updateQuizView();
      questions[0]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });

    updateQuizView();
  });

  updateCourseProgress();
  if (window.location.hash === "#exercices") setVolumeTab("exercises", { updateHash: false });
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#exercices") setVolumeTab("exercises", { updateHash: false });
  });

  root.classList.add("motion-ready");
  const themeButtons = document.querySelectorAll("[data-theme-toggle]");
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)");

  function activeTheme() {
    return root.dataset.theme || (preferredDark.matches ? "dark" : "light");
  }

  function updateThemeButtons() {
    const dark = activeTheme() === "dark";
    themeButtons.forEach((button) => {
      button.setAttribute("aria-label", dark ? "Activer le thème clair" : "Activer le thème sombre");
      const icon = button.querySelector("[data-theme-icon]");
      if (icon) icon.textContent = dark ? "☀" : "◐";
    });
  }

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const theme = activeTheme() === "dark" ? "light" : "dark";
      const applyTheme = () => {
        root.dataset.theme = theme;
        localStorage.setItem("tradevisionpro-theme", theme);
        updateThemeButtons();
      };
      if (!reduceMotion && document.startViewTransition) document.startViewTransition(applyTheme);
      else applyTheme();
    });
  });
  updateThemeButtons();

  const siteHeader = document.querySelector(".site-header");
  const updateHeader = () => siteHeader?.classList.toggle("site-header--scrolled", window.scrollY > 18);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const revealSelector = [
    ".home-hero__content > *",
    ".hero-panel li",
    ".section-heading > *",
    ".volume-card",
    ".method-grid article",
    ".index-hero > *",
    ".volume-hero > *",
    ".chapter-highlights li",
    ".course-section > .course-heading",
    ".callout",
    ".lesson-note",
    ".chapter-conclusion",
    ".stat-row",
    ".course-figure",
    ".data-table",
    ".case-header",
    ".sources-list",
    ".search-result",
  ].join(",");

  const revealObserver = reduceMotion
    ? null
    : new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
      );

  function registerReveals(scope = document) {
    const nodes = [...scope.querySelectorAll(revealSelector)].filter((node) => !node.classList.contains("reveal"));
    nodes.forEach((node, index) => {
      node.classList.add("reveal");
      node.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 70}ms`);
      if (reduceMotion) node.classList.add("is-visible");
      else revealObserver.observe(node);
    });
  }

  registerReveals();
  const dynamicContentObserver = new MutationObserver((records) => {
    records.forEach((record) => registerReveals(record.target));
  });
  document.querySelectorAll("[data-search-results]").forEach((container) =>
    dynamicContentObserver.observe(container, { childList: true, subtree: true }),
  );

  const motionHero = document.querySelector("[data-motion-hero]");
  if (motionHero && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    motionHero.addEventListener("pointermove", (event) => {
      const rect = motionHero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      motionHero.style.setProperty("--hero-x", `${x * 18}px`);
      motionHero.style.setProperty("--hero-y", `${y * 18}px`);
      motionHero.style.setProperty("--panel-x", `${x * -9}px`);
      motionHero.style.setProperty("--panel-y", `${y * -9}px`);
    });
    motionHero.addEventListener("pointerleave", () => {
      ["--hero-x", "--hero-y", "--panel-x", "--panel-y"].forEach((property) =>
        motionHero.style.setProperty(property, "0px"),
      );
    });
  }

  const counterFormatter = new Intl.NumberFormat("fr-FR");
  const counters = [...document.querySelectorAll("[data-counter]")];
  if (!reduceMotion && counters.length) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          const target = Number(element.dataset.counter || 0);
          const suffix = element.dataset.counterSuffix || "";
          const started = performance.now();
          const animate = (now) => {
            const progress = Math.min(1, (now - started) / 900);
            const eased = 1 - (1 - progress) ** 3;
            element.textContent = `${counterFormatter.format(Math.round(target * eased))}${suffix}`;
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          counterObserver.unobserve(element);
        });
      },
      { threshold: 0.7 },
    );
    counters.forEach((counter) => {
      counter.textContent = `0${counter.dataset.counterSuffix || ""}`;
      counterObserver.observe(counter);
    });
  }

  const sidebar = document.querySelector(".volume-sidebar");
  const backdrop = document.querySelector("[data-drawer-backdrop]");
  const tocButtons = document.querySelectorAll("[data-toc-toggle]");

  function setDrawer(open) {
    if (!sidebar || !backdrop) return;
    sidebar.dataset.open = open ? "true" : "false";
    backdrop.hidden = !open;
    document.body.classList.toggle("drawer-is-open", open);
    tocButtons.forEach((button) => button.setAttribute("aria-expanded", String(open)));
    if (open) sidebar.querySelector("a, button")?.focus();
  }

  tocButtons.forEach((button) => button.addEventListener("click", () => setDrawer(true)));
  document.querySelector("[data-toc-close]")?.addEventListener("click", () => setDrawer(false));
  backdrop?.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setDrawer(false);
  });

  const tocLinks = [...document.querySelectorAll("[data-toc-link]")];
  const observedSections = tocLinks
    .map((link) => document.getElementById(link.dataset.tocLink))
    .filter(Boolean);
  if (observedSections.length) {
    const activate = (id) => {
      tocLinks.forEach((link) => {
        if (link.dataset.tocLink === id) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        if (visible[0]) activate(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -72% 0px", threshold: [0, 1] },
    );
    observedSections.forEach((section) => observer.observe(section));
    activate(observedSections[0].id);
    tocLinks.forEach((link) => link.addEventListener("click", () => setDrawer(false)));
  }

  const progress = document.querySelector("[data-reading-progress]");
  if (progress) {
    const updateProgress = () => {
      const article = document.querySelector(".course-content");
      if (!article) return;
      const start = article.offsetTop;
      const available = Math.max(1, article.scrollHeight - window.innerHeight);
      const amount = Math.min(1, Math.max(0, (window.scrollY - start) / available));
      progress.style.transform = `scaleX(${amount})`;
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
  }

  const searchInputs = [...document.querySelectorAll("[data-search-input]")];
  const resultContainers = [...document.querySelectorAll("[data-search-results]")];
  const searchStatus = document.querySelector("[data-search-status]");
  let searchIndexPromise;

  const normalize = (value) =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  function loadIndex() {
    searchIndexPromise ||= fetch(`${basePath}search-index.json`).then((response) => {
      if (!response.ok) throw new Error("Search index unavailable");
      return response.json();
    });
    return searchIndexPromise;
  }

  function scoreEntry(entry, tokens) {
    const title = normalize(entry.title);
    const volume = normalize(`${entry.volume} ${entry.volumeTitle} ${entry.kicker}`);
    const text = normalize(entry.text);
    let score = 0;
    for (const token of tokens) {
      if (!text.includes(token) && !title.includes(token) && !volume.includes(token)) return -1;
      if (title === token) score += 80;
      else if (title.includes(token)) score += 32;
      if (volume.includes(token)) score += 12;
      const occurrences = text.split(token).length - 1;
      score += Math.min(18, occurrences * 2);
    }
    return score;
  }

  function excerptAround(text, tokens) {
    const normalized = normalize(text);
    const positions = tokens.map((token) => normalized.indexOf(token)).filter((index) => index >= 0);
    const start = positions.length ? Math.max(0, Math.min(...positions) - 90) : 0;
    const excerpt = text.slice(start, start + 260).trim();
    return `${start > 0 ? "…" : ""}${excerpt}${start + 260 < text.length ? "…" : ""}`;
  }

  function resultCard(entry, tokens) {
    const article = document.createElement("article");
    article.className = "search-result";
    const link = document.createElement("a");
    link.href = entry.url;
    const meta = document.createElement("p");
    meta.className = "search-result__meta";
    meta.textContent = `${entry.volume} · ${entry.volumeTitle}`;
    const title = document.createElement("h2");
    title.textContent = entry.title;
    const excerpt = document.createElement("p");
    excerpt.textContent = excerptAround(entry.text || entry.excerpt, tokens);
    const action = document.createElement("span");
    action.className = "search-result__action";
    action.textContent = "Ouvrir la section →";
    link.append(meta, title, excerpt, action);
    article.append(link);
    return article;
  }

  async function runSearch(value) {
    const query = value.trim();
    const tokens = normalize(query).split(/\s+/).filter((token) => token.length > 1);
    if (!tokens.length || query.length < 2) {
      resultContainers.forEach((container) => container.replaceChildren());
      if (searchStatus) searchStatus.textContent = "Commencez à saisir au moins deux caractères.";
      return;
    }
    try {
      const index = await loadIndex();
      const results = index
        .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
        .filter((result) => result.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      resultContainers.forEach((container) => {
        container.replaceChildren(...results.map(({ entry }) => resultCard(entry, tokens)));
        container.toggleAttribute("data-empty", results.length === 0);
      });
      if (searchStatus) {
        searchStatus.textContent = results.length
          ? `${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${query} »`
          : `Aucun résultat pour « ${query} ». Essayez un terme plus général.`;
      }
    } catch (error) {
      if (searchStatus) searchStatus.textContent = "La recherche est momentanément indisponible.";
    }
  }

  let searchTimer;
  searchInputs.forEach((input) => {
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(input.value), 80);
      if (input.hasAttribute("data-search-page-input")) {
        const url = new URL(window.location.href);
        if (input.value) url.searchParams.set("q", input.value);
        else url.searchParams.delete("q");
        history.replaceState(null, "", url);
      }
    });
  });

  const pageSearch = document.querySelector("[data-search-page-input]");
  if (pageSearch) {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    pageSearch.value = initial;
    if (initial) runSearch(initial);
  }

  document.addEventListener("keydown", (event) => {
    const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    const slash = event.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "");
    if (!shortcut && !slash) return;
    event.preventDefault();
    if (pageSearch) pageSearch.focus();
    else window.location.href = `${basePath}recherche/`;
  });
})();
