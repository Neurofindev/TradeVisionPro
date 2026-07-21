(() => {
  const root = document.documentElement;
  const basePath = root.dataset.basePath || "/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
