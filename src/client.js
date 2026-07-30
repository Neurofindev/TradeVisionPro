(() => {
  const root = document.documentElement;
  const basePath = root.dataset.basePath || "/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedRankEffects = reduceMotion
    || Boolean(navigator.connection?.saveData)
    || (Number(navigator.hardwareConcurrency || 8) <= 4);
  if (reducedRankEffects) root.classList.add("rank-effects-lite");
  const accessSessionKey = "tradevisionpro-access-session-v4";
  const runtimeConfig = window.__TVP_RUNTIME_CONFIG__ || {};
  const supabaseUrl = String(runtimeConfig.supabaseUrl || "").replace(/\/+$/, "");
  const supabasePublishableKey = String(runtimeConfig.supabasePublishableKey || "");
  const accessApiUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/tradevision-api` : "";
  const isHostedSupabase = /^https:\/\/[^/]+\.supabase\.co$/i.test(supabaseUrl);
  const isLocalSupabase = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/i.test(supabaseUrl);
  const accessApiConfigured = (isHostedSupabase || isLocalSupabase) && Boolean(supabasePublishableKey);
  const knownProfileLabels = {
    "aedan-dechavigny": "Aedan De Chavigny",
    yann: "Yann",
    "charly-labbetoul": "Charly Labbetoul",
  };
  let activeAccessProfile = null;
  let activeAccessToken = "";
  let activeStreak = null;
  let rewardSoundEnabled = true;
  const accessGate = document.querySelector("[data-access-gate]");
  const accessCard = document.querySelector("[data-access-card]");
  const accessForm = document.querySelector("[data-access-form]");
  const accessInput = document.querySelector("[data-access-input]");
  const accessSubmit = document.querySelector("[data-access-submit]");
  const accessStatus = document.querySelector("[data-access-status]");
  const accessVisibility = document.querySelector("[data-access-visibility]");
  const accessVisibilityIcon = document.querySelector("[data-access-visibility-icon]");

  function readAccessSession() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(accessSessionKey) || "null");
      return parsed?.token && parsed?.profile?.id ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function storeAccessSession(value) {
    try {
      sessionStorage.setItem(accessSessionKey, JSON.stringify(value));
    } catch (error) {
      // The authenticated session remains usable until this page is closed.
    }
  }

  async function accessApi(action, payload = {}, token = activeAccessToken) {
    if (!accessApiConfigured) {
      const error = new Error("server_not_configured");
      error.code = "server_not_configured";
      throw error;
    }
    const response = await fetch(accessApiUrl, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        apikey: supabasePublishableKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    let result = {};
    try {
      result = await response.json();
    } catch (error) {
      result = {};
    }
    if (!response.ok || !result.ok) {
      const apiError = new Error(result.error || "service_unavailable");
      apiError.code = result.error || "service_unavailable";
      apiError.retryAfterSeconds = Number(result.retryAfterSeconds || response.headers.get("Retry-After") || 0);
      throw apiError;
    }
    return result;
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

  function currentAccessProfile() {
    return activeAccessProfile;
  }

  function grantAccess(profile, { focus = true } = {}) {
    if (!profile) return;
    activeAccessProfile = profile;
    root.dataset.accessProfile = profile.id;
    root.dataset.accessRole = profile.role;
    root.classList.remove("access-locked");
    root.classList.add("access-granted");
    if (accessGate) accessGate.hidden = true;
    updateCourseProgress();
    if (focus) document.querySelector(".brand, main a, main button, main")?.focus({ preventScroll: true });
  }

  function revokeAccess(message = "Saisissez le code du profil à ouvrir.") {
    activeAccessProfile = null;
    activeAccessToken = "";
    activeStreak = null;
    try {
      sessionStorage.removeItem(accessSessionKey);
    } catch (error) {
      // The in-memory state is already cleared.
    }
    delete root.dataset.accessProfile;
    delete root.dataset.accessRole;
    root.classList.remove("access-granted");
    root.classList.add("access-locked");
    if (accessGate) accessGate.hidden = false;
    if (accessInput) accessInput.value = "";
    updateAccessStatus(message);
    requestAnimationFrame(() => accessInput?.focus({ preventScroll: true }));
  }

  root.classList.remove("access-granted");
  root.classList.add("access-locked");
  if (accessGate) accessGate.hidden = false;

  accessInput?.addEventListener("input", () => {
    accessInput.value = accessInput.value.replace(/\D/g, "").slice(0, 6);
    if (accessInput.getAttribute("aria-invalid") === "true") {
      updateAccessStatus("Votre série est vérifiée avec l’heure sécurisée du serveur.");
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
    updateAccessStatus("Vérification sécurisée du code et de votre série…");
    primeStreakSound();
    try {
      const response = await accessApi("login", { code: value }, "");
      activeAccessToken = response.sessionToken;
      activeAccessProfile = response.profile;
      rewardSoundEnabled = response.preferences?.rewardSoundEnabled !== false;
      storeAccessSession({
        token: activeAccessToken,
        profile: activeAccessProfile,
        expiresAt: response.expiresAt,
      });
      updateAccessStatus(`Bienvenue ${activeAccessProfile.name}. Ouverture de votre espace…`, "success");
      window.setTimeout(() => {
        grantAccess(activeAccessProfile);
        syncStreakResponse(response, { allowCelebration: true });
      }, reduceMotion ? 0 : 360);
    } catch (error) {
      accessInput.value = "";
      if (error.code === "invalid_credentials") {
        updateAccessStatus("Code incorrect. L’accès reste verrouillé.", "error");
      } else if (error.code === "rate_limited") {
        const minutes = Math.max(1, Math.ceil(Number(error.retryAfterSeconds || 900) / 60));
        updateAccessStatus(`Trop de tentatives. Réessayez dans environ ${minutes} minute${minutes > 1 ? "s" : ""}.`, "error");
      } else if (error.code === "server_not_configured") {
        updateAccessStatus("Le service sécurisé n’est pas encore configuré pour ce déploiement.", "error");
      } else {
        updateAccessStatus("Connexion au serveur momentanément indisponible. Réessayez.", "error");
      }
      accessInput.focus();
    } finally {
      accessSubmit.disabled = false;
      accessSubmit.removeAttribute("aria-busy");
    }
  });

  async function restoreAccessSession() {
    const stored = readAccessSession();
    if (!stored) {
      updateAccessStatus(
        accessApiConfigured
          ? "Votre série est vérifiée avec l’heure sécurisée du serveur."
          : "Le service sécurisé doit être configuré avant la connexion.",
      );
      requestAnimationFrame(() => accessInput?.focus({ preventScroll: true }));
      return;
    }

    activeAccessToken = stored.token;
    updateAccessStatus("Restauration sécurisée de votre session…");
    try {
      const response = await accessApi("session", {}, activeAccessToken);
      activeAccessProfile = response.profile;
      rewardSoundEnabled = response.preferences?.rewardSoundEnabled !== false;
      storeAccessSession({ ...stored, profile: activeAccessProfile });
      grantAccess(activeAccessProfile, { focus: false });
      syncStreakResponse(response, { allowCelebration: false });
    } catch (error) {
      revokeAccess("Votre session a expiré. Saisissez de nouveau votre code.");
    }
  }

  restoreAccessSession();

  const courseProgressPrefix = "tradevisionpro-course-progress-v2";
  const passingScore = 8;
  const volumePrerequisites = { 2: 1, 3: 1, 4: 3, 5: 4, 6: 5 };
  const rankSettingsKey = "tradevisionpro-rank-settings-v1";
  const rankConfig = (() => {
    const fallback = {
      defaultMode: "auto",
      autoFractions: { bronze: 0, silver: 0.2, gold: 0.4, platine: 0.6, elite: 0.8 },
      manualThresholds: { bronze: 0, silver: 1, gold: 2, platine: 3, elite: 4 },
      ranks: [
        { id: "bronze", name: "Bronze", description: "Le parcours commence." },
        { id: "silver", name: "Silver", description: "Un premier niveau est atteint." },
        { id: "gold", name: "Gold", description: "La méthode devient cohérente." },
        { id: "platine", name: "Platine", description: "Le parcours atteint un niveau avancé." },
        { id: "elite", name: "Elite", description: "La formation est entièrement ou presque maîtrisée." },
      ],
    };
    try {
      const parsed = JSON.parse(document.querySelector("#tradevisionpro-rank-config")?.textContent || "{}");
      return Array.isArray(parsed.ranks) && parsed.ranks.length ? { ...fallback, ...parsed } : fallback;
    } catch (error) {
      return fallback;
    }
  })();
  const totalAvailableVolumes = Math.max(
    1,
    ...[...document.querySelectorAll("[data-volume-order]")].map((element) => Number(element.dataset.volumeOrder || 0)),
  );

  function readRankSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(rankSettingsKey) || "{}");
      return {
        mode: stored.mode === "manual" ? "manual" : rankConfig.defaultMode || "auto",
        thresholds: { ...(rankConfig.manualThresholds || {}), ...(stored.thresholds || {}) },
      };
    } catch (error) {
      return { mode: rankConfig.defaultMode || "auto", thresholds: { ...(rankConfig.manualThresholds || {}) } };
    }
  }

  function resolvedRanks(totalVolumes = totalAvailableVolumes, settings = readRankSettings()) {
    let previousThreshold = 0;
    return rankConfig.ranks.map((rank, index) => {
      const configured = settings.mode === "manual"
        ? Number(settings.thresholds?.[rank.id])
        : Math.ceil(totalVolumes * Number(rankConfig.autoFractions?.[rank.id] || 0));
      const minimum = index === 0 ? 0 : Math.max(1, Number.isFinite(configured) ? configured : previousThreshold);
      const threshold = Math.min(totalVolumes, Math.max(previousThreshold, minimum));
      previousThreshold = threshold;
      return { ...rank, minValidated: threshold };
    });
  }

  function validatedVolumeCount(progressData = readCourseProgress(), totalVolumes = totalAvailableVolumes) {
    return Array.from({ length: totalVolumes }, (_, index) => index + 1).filter(
      (order) => Number(progressData[String(order)] || 0) >= passingScore,
    ).length;
  }

  function rankForValidated(validated, ranks = resolvedRanks()) {
    return ranks.reduce(
      (current, rank) => (validated >= Number(rank.minValidated || 0) ? rank : current),
      ranks[0],
    );
  }

  function rankProgressState(validated, ranks = resolvedRanks(), totalVolumes = totalAvailableVolumes) {
    const current = rankForValidated(validated, ranks);
    const currentIndex = Math.max(0, ranks.findIndex((rank) => rank.id === current.id));
    const next = ranks[currentIndex + 1] || null;
    const lowerBound = Number(current.minValidated || 0);
    const upperBound = Number(next?.minValidated ?? totalVolumes);
    const span = Math.max(1, upperBound - lowerBound);
    const progress = next ? Math.max(0, Math.min(1, (validated - lowerBound) / span)) : 1;
    return { current, currentIndex, next, progress, lowerBound, upperBound };
  }

  function showRankEmblem(scope, rankId) {
    scope?.querySelectorAll("[data-rank-emblem]").forEach((element) => {
      element.hidden = element.dataset.rankEmblem !== rankId;
    });
  }

  if (!reducedRankEffects && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll("[data-profile-rank-card]").forEach((card) => {
      const emblem = card.querySelector(".profile-rank-card__emblem .rank-emblem-stack");
      if (!emblem) return;
      let tiltFrame = 0;
      let latestPointer = null;
      card.addEventListener("pointermove", (event) => {
        latestPointer = event;
        if (tiltFrame) return;
        tiltFrame = requestAnimationFrame(() => {
          const bounds = card.getBoundingClientRect();
          const x = ((latestPointer.clientX - bounds.left) / bounds.width - 0.5) * 2;
          const y = ((latestPointer.clientY - bounds.top) / bounds.height - 0.5) * 2;
          emblem.style.setProperty("--rank-tilt-x", `${(-y * 3.2).toFixed(2)}deg`);
          emblem.style.setProperty("--rank-tilt-y", `${(x * 4.2).toFixed(2)}deg`);
          tiltFrame = 0;
        });
      });
      card.addEventListener("pointerleave", () => {
        cancelAnimationFrame(tiltFrame);
        tiltFrame = 0;
        emblem.style.removeProperty("--rank-tilt-x");
        emblem.style.removeProperty("--rank-tilt-y");
      });
    });
  }

  function courseProgressKey() {
    const profile = currentAccessProfile();
    return profile ? `${courseProgressPrefix}:${profile.id}` : "";
  }

  function readCourseProgress() {
    try {
      const key = courseProgressKey();
      if (!key) return {};
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      if (!parsed || typeof parsed !== "object") return {};
      let progressChanged = false;
      if (parsed["1"] && !parsed["1-part-1"] && !parsed["1-part-2"]) {
        parsed["1-part-1"] = parsed["1"];
        if (Number(parsed["1"]) >= passingScore) parsed["1-part-2"] = parsed["1"];
        progressChanged = true;
      }
      if (parsed["3"] && !parsed["3-part-3"]) {
        if (!parsed["3-part-1"] && !parsed["3-part-2"]) parsed["3-part-1"] = parsed["3"];
        delete parsed["3"];
        progressChanged = true;
      }
      const volume4MigrationKey = `${key}:volume4-two-parts-migrated`;
      if (!localStorage.getItem(volume4MigrationKey)) {
        const formerMacroScore = Math.max(Number(parsed["4-part-1"] || 0), Number(parsed["4"] || 0));
        if (formerMacroScore) parsed["4-part-2"] = Math.max(Number(parsed["4-part-2"] || 0), formerMacroScore);
        delete parsed["4-part-1"];
        delete parsed["4"];
        localStorage.setItem(volume4MigrationKey, "true");
        progressChanged = true;
      }
      const volume4Part3MigrationKey = `${key}:volume4-three-parts-migrated`;
      if (!localStorage.getItem(volume4Part3MigrationKey)) {
        if (!parsed["4-part-3"]) delete parsed["4"];
        localStorage.setItem(volume4Part3MigrationKey, "true");
        progressChanged = true;
      }
      if (progressChanged) localStorage.setItem(key, JSON.stringify(parsed));
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function saveQuizScore(volumeOrder, score, partOrder = 0, completesVolume = false) {
    const key = courseProgressKey();
    if (!key) return;
    const progressData = readCourseProgress();
    const scoreKey = partOrder ? `${volumeOrder}-part-${partOrder}` : String(volumeOrder);
    progressData[scoreKey] = Math.max(Number(progressData[scoreKey]) || 0, score);
    const volumePage = document.querySelector(`[data-volume-page][data-volume-order="${volumeOrder}"]`);
    const partCount = Number(volumePage?.dataset.volumePartCount || 0);
    const allPartsPassed = partCount > 0 && Array.from(
      { length: partCount },
      (_, index) => Number(progressData[`${volumeOrder}-part-${index + 1}`] || 0),
    ).every((partResult) => partResult >= passingScore);
    if (completesVolume && (partCount <= 1 || allPartsPassed)) {
      const volumeKey = String(volumeOrder);
      progressData[volumeKey] = Math.max(Number(progressData[volumeKey]) || 0, score);
    } else if (allPartsPassed) {
      progressData[String(volumeOrder)] = Math.max(
        ...Array.from({ length: partCount }, (_, index) => Number(progressData[`${volumeOrder}-part-${index + 1}`] || 0)),
      );
    }
    localStorage.setItem(key, JSON.stringify(progressData));
  }

  function isAdminAccess() {
    return root.dataset.accessRole === "admin";
  }

  function prerequisiteVolumeOrder(volumeOrder) {
    return Number(volumePrerequisites[volumeOrder] || Math.max(1, volumeOrder - 1));
  }

  function isVolumeUnlocked(volumeOrder, progressData = readCourseProgress()) {
    const prerequisite = prerequisiteVolumeOrder(volumeOrder);
    return isAdminAccess() || volumeOrder <= 1 || Number(progressData[String(prerequisite)] || 0) >= passingScore;
  }

  function partScore(volumeOrder, partOrder, progressData = readCourseProgress()) {
    return Number(progressData[`${volumeOrder}-part-${partOrder}`] || 0);
  }

  function isPartUnlocked(volumeOrder, partOrder, progressData = readCourseProgress()) {
    return isAdminAccess() || partOrder <= 1 || partScore(volumeOrder, partOrder - 1, progressData) >= passingScore;
  }

  function updateCourseProgress() {
    const progressData = readCourseProgress();
    document.querySelectorAll("[data-volume-card]").forEach((card) => {
      const order = Number(card.dataset.volumeOrder || 1);
      const partCount = Number(card.dataset.volumePartCount || 1);
      const hasParts = card.dataset.volumeHasParts === "true";
      const optional = card.dataset.volumeOptional === "true";
      const unlocked = isVolumeUnlocked(order, progressData);
      const prerequisite = prerequisiteVolumeOrder(order);
      const score = Number(progressData[String(order)] || 0);
      const validatedParts = Array.from({ length: partCount }, (_, index) => partScore(order, index + 1, progressData)).filter(
        (partResult) => partResult >= passingScore,
      ).length;
      card.classList.toggle("is-locked", !unlocked);
      card.classList.toggle("is-complete", score >= passingScore);
      const stateIcon = card.querySelector("[data-volume-state-icon]");
      const stateLabel = card.querySelector("[data-volume-state-label]");
      if (stateIcon) stateIcon.textContent = !unlocked ? "◇" : score >= passingScore ? "✓" : "◆";
      if (stateLabel) {
        stateLabel.textContent = !unlocked
          ? `${optional ? "Optionnel · " : ""}À débloquer avec le Volume ${prerequisite}`
          : score >= passingScore
            ? `Validé · ${score}/10`
            : optional
              ? "Disponible · optionnel"
            : hasParts
              ? validatedParts === partCount
                ? `À jour · ${partCount}/${partCount} partie${partCount > 1 ? "s" : ""} validée${partCount > 1 ? "s" : ""}`
                : `${validatedParts}/${partCount} partie${partCount > 1 ? "s" : ""} validée${partCount > 1 ? "s" : ""}`
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
        link.setAttribute("aria-label", !unlocked ? `Volume ${order} verrouillé` : `Volume ${order}`);
        const lockIcon = link.querySelector("[data-volume-nav-lock]");
        if (lockIcon) lockIcon.hidden = unlocked;
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
      const partCount = Number(volumePage.dataset.volumePartCount || 1);
      const hasParts = volumePage.dataset.volumeHasParts === "true";
      const validatedParts = Array.from({ length: partCount }, (_, index) => partScore(order, index + 1, progressData)).filter(
        (partResult) => partResult >= passingScore,
      ).length;
      volumePage.querySelectorAll("[data-volume-score]").forEach((label) => {
        label.textContent = hasParts ? `${validatedParts}/${partCount} validée${partCount > 1 ? "s" : ""}` : score ? `${score}/10` : "À faire";
        label.classList.toggle("is-complete", score >= passingScore);
      });

      volumePage.querySelectorAll("[data-volume-part]").forEach((part) => {
        const partOrder = Number(part.dataset.partOrder || 1);
        const partResult = partScore(order, partOrder, progressData);
        const partUnlocked = isPartUnlocked(order, partOrder, progressData);
        const lock = part.querySelector("[data-part-lock]");
        const protectedPart = part.querySelector("[data-part-protected]");
        part.classList.toggle("is-locked", !partUnlocked);
        part.classList.toggle("is-complete", partResult >= passingScore);
        if (lock) lock.hidden = partUnlocked;
        if (protectedPart) protectedPart.hidden = !partUnlocked;
        part.querySelectorAll("[data-part-status]").forEach((status) => {
          status.textContent = !partUnlocked ? "À débloquer" : partResult >= passingScore ? `Validée · ${partResult}/10` : "Disponible";
        });
      });

      volumePage.querySelectorAll("[data-part-quiz]").forEach((partQuiz) => {
        const partOrder = Number(partQuiz.dataset.partOrder || 1);
        const partUnlocked = isPartUnlocked(order, partOrder, progressData);
        const lock = partQuiz.querySelector("[data-part-quiz-lock]");
        const protectedQuiz = partQuiz.querySelector("[data-part-quiz-protected]");
        partQuiz.classList.toggle("is-locked", !partUnlocked);
        if (lock) lock.hidden = partUnlocked;
        if (protectedQuiz) protectedQuiz.hidden = !partUnlocked;
      });

      volumePage.querySelectorAll("[data-volume-part-link]").forEach((link) => {
        const partOrder = Number(link.dataset.partOrder || 1);
        const partResult = partScore(order, partOrder, progressData);
        const partUnlocked = isPartUnlocked(order, partOrder, progressData);
        link.classList.toggle("is-locked", !partUnlocked);
        link.dataset.locked = String(!partUnlocked);
        link.setAttribute("aria-disabled", String(!partUnlocked));
        link.querySelectorAll("[data-part-status]").forEach((status) => {
          status.textContent = !partUnlocked ? "À débloquer" : partResult >= passingScore ? `Validée · ${partResult}/10` : "Disponible";
        });
      });
    }

    updateProfileUi(progressData);
  }

  function profileInitials(name = "") {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "TV";
  }

  function profilePartAnchor(card, partOrder) {
    const partIds = String(card?.dataset.volumePartIds || "").split(",").filter(Boolean);
    return partIds[partOrder - 1] ? `#${partIds[partOrder - 1]}` : "";
  }

  function updateRankUi(progressData = readCourseProgress()) {
    const ranks = resolvedRanks();
    const validated = validatedVolumeCount(progressData);
    const state = rankProgressState(validated, ranks);
    const remaining = state.next ? Math.max(0, state.next.minValidated - validated) : 0;

    document.querySelectorAll("[data-profile-rank-mini]").forEach((element) => {
      element.textContent = state.current.name;
      element.dataset.rank = state.current.id;
    });
    document.querySelectorAll("[data-profile-rank-name]").forEach((element) => { element.textContent = state.current.name; });
    document.querySelectorAll("[data-profile-rank-description]").forEach((element) => {
      element.textContent = state.current.description || "";
    });
    document.querySelectorAll("[data-profile-rank-validated]").forEach((element) => { element.textContent = String(validated); });
    document.querySelectorAll("[data-profile-rank-total]").forEach((element) => { element.textContent = String(totalAvailableVolumes); });
    document.querySelectorAll("[data-profile-rank-next-label]").forEach((element) => {
      element.textContent = state.next ? `Progression vers ${state.next.name}` : "Rang maximal atteint";
    });
    document.querySelectorAll("[data-profile-rank-progress-value]").forEach((element) => {
      element.textContent = state.next ? `${validated} / ${state.next.minValidated}` : `${validated} / ${totalAvailableVolumes}`;
    });
    document.querySelectorAll("[data-profile-rank-progress]").forEach((element) => {
      element.setAttribute("aria-valuenow", String(Math.round(state.progress * 100)));
    });
    document.querySelectorAll("[data-profile-rank-progress-bar]").forEach((element) => {
      element.style.width = `${Math.round(state.progress * 100)}%`;
    });
    document.querySelectorAll("[data-profile-rank-remaining]").forEach((element) => {
      element.textContent = state.next
        ? `Encore ${remaining} volume${remaining > 1 ? "s" : ""} avant le rang ${state.next.name}.`
        : `Rang maximal atteint avec ${validated} volume${validated > 1 ? "s" : ""} validé${validated > 1 ? "s" : ""}.`;
    });
    document.querySelectorAll("[data-profile-rank-card]").forEach((card) => {
      card.dataset.rank = state.current.id;
      showRankEmblem(card, state.current.id);
    });
    document.querySelectorAll("[data-profile-rank-item]").forEach((item) => {
      const rankIndex = ranks.findIndex((rank) => rank.id === item.dataset.profileRankItem);
      const earned = rankIndex <= state.currentIndex;
      const current = rankIndex === state.currentIndex;
      item.dataset.state = current ? "current" : earned ? "earned" : "locked";
      const icon = item.querySelector("i");
      if (icon) icon.textContent = earned ? "✓" : "◇";
    });
    ranks.forEach((rank, index) => {
      document.querySelectorAll(`[data-profile-rank-threshold="${rank.id}"]`).forEach((element) => {
        element.textContent = index === 0 ? "Rang initial" : `${rank.minValidated} volume${rank.minValidated > 1 ? "s" : ""} validé${rank.minValidated > 1 ? "s" : ""}`;
      });
    });
    return { ...state, validated, ranks };
  }

  function updateProfileUi(progressData = readCourseProgress()) {
    const profile = currentAccessProfile();
    if (!profile) return;
    const initials = profileInitials(profile.name);
    document.querySelectorAll("[data-profile-name]").forEach((element) => { element.textContent = profile.name; });
    document.querySelectorAll("[data-profile-initials]").forEach((element) => { element.textContent = initials; });
    document.querySelectorAll("[data-profile-role]").forEach((element) => {
      element.textContent = profile.role === "admin" ? "Administrateur · accès intégral" : "Compte apprenant";
    });
    document.querySelectorAll("[data-rank-admin]").forEach((element) => { element.hidden = !isAdminAccess(); });
    updateRankUi(progressData);

    const profileVolumes = [...document.querySelectorAll("[data-profile-volume]")];
    const totalVolumes = profileVolumes.length || totalAvailableVolumes;
    const scores = Array.from({ length: totalVolumes }, (_, index) => Number(progressData[String(index + 1)] || 0));
    const requiredOrders = Array.from({ length: totalVolumes }, (_, index) => index + 1).filter((order) => order !== 2);
    const validated = requiredOrders.filter((order) => scores[order - 1] >= passingScore).length;
    const accessible = isAdminAccess() ? totalVolumes : scores.reduce((count, _score, index) => count + Number(isVolumeUnlocked(index + 1, progressData)), 0);
    const bestScore = Math.max(0, ...Object.values(progressData).map((score) => Number(score) || 0));
    const completion = Math.round((validated / requiredOrders.length) * 100);

    document.querySelectorAll("[data-profile-validated]").forEach((element) => { element.textContent = String(validated); });
    document.querySelectorAll("[data-profile-open]").forEach((element) => { element.textContent = String(accessible); });
    document.querySelectorAll("[data-profile-best]").forEach((element) => { element.textContent = bestScore ? `${bestScore}/10` : "—"; });
    document.querySelectorAll("[data-profile-completion]").forEach((element) => { element.textContent = `${completion} %`; });
    document.querySelectorAll("[data-profile-access-note]").forEach((element) => {
      element.textContent = isAdminAccess() ? "Accès intégral administrateur" : "Déblocage progressif";
    });
    document.querySelectorAll("[data-profile-progress]").forEach((element) => { element.setAttribute("aria-valuenow", String(completion)); });
    document.querySelectorAll("[data-profile-progress-bar]").forEach((element) => { element.style.width = `${completion}%`; });

    profileVolumes.forEach((card) => {
      const order = Number(card.dataset.volumeOrder || 1);
      const partCount = Number(card.dataset.volumePartCount || 1);
      const hasParts = card.dataset.volumeHasParts === "true";
      const optional = card.dataset.volumeOptional === "true";
      const score = Number(progressData[String(order)] || 0);
      const unlocked = isVolumeUnlocked(order, progressData);
      const prerequisite = prerequisiteVolumeOrder(order);
      const complete = score >= passingScore;
      const validatedParts = Array.from({ length: partCount }, (_, index) => partScore(order, index + 1, progressData)).filter(
        (partResult) => partResult >= passingScore,
      ).length;
      card.classList.toggle("is-locked", !unlocked);
      card.classList.toggle("is-complete", complete);
      const status = card.querySelector("[data-profile-volume-status]");
      const scoreLabel = card.querySelector("[data-profile-volume-score]");
      const link = card.querySelector("[data-profile-volume-link]");
      if (status) {
        status.textContent = !unlocked
          ? optional ? "Optionnel · verrouillé" : "Verrouillé"
          : complete
            ? "Validé"
            : optional
              ? "Optionnel · disponible"
            : hasParts && validatedParts === partCount
              ? "Progression à jour"
              : hasParts && validatedParts
                ? "En progression"
                : "Disponible";
      }
      if (scoreLabel) {
        scoreLabel.textContent = optional && !score
          ? "Facultatif"
          : hasParts && !complete
            ? `${validatedParts}/${partCount} partie${partCount > 1 ? "s" : ""}`
            : score
              ? `${score}/10`
              : "Non évalué";
      }
      if (link) {
        const ownUrl = link.dataset.profileVolumeUrl || link.href;
        const prerequisiteUrl = profileVolumes[prerequisite - 1]?.querySelector("[data-profile-volume-link]")?.dataset.profileVolumeUrl;
        const nextPart = hasParts && validatedParts < partCount ? validatedParts + 1 : 0;
        const waitingForNextPart = hasParts && validatedParts === partCount && !complete;
        link.href = !unlocked && prerequisiteUrl ? `${prerequisiteUrl}#exercices` : nextPart > 1 ? `${ownUrl}${profilePartAnchor(card, nextPart)}` : ownUrl;
        link.textContent = !unlocked
          ? `Valider le Volume ${prerequisite} →`
          : complete
            ? "Revoir le volume →"
            : nextPart > 1
              ? `Continuer avec la Partie ${nextPart} →`
              : waitingForNextPart
                ? "Revoir les parties disponibles →"
                : "Ouvrir le volume →";
        link.classList.toggle("is-locked", !unlocked);
      }
    });

    const nextTitle = document.querySelector("[data-profile-next-title]");
    const nextText = document.querySelector("[data-profile-next-text]");
    const nextLink = document.querySelector("[data-profile-next-link]");
    if (nextTitle && nextText && nextLink) {
      if (isAdminAccess()) {
        nextTitle.textContent = "Explorer librement la formation";
        nextText.textContent = "Votre compte administrateur donne accès à tous les volumes, sans validation préalable.";
        nextLink.href = `${basePath}volumes/`;
        nextLink.innerHTML = 'Voir tous les volumes <span aria-hidden="true">→</span>';
      } else if (validated === requiredOrders.length) {
        nextTitle.textContent = "Parcours entièrement validé";
        nextText.textContent = `Félicitations : les ${requiredOrders.length} volumes requis sont validés. Le Volume 2 reste disponible comme approfondissement facultatif.`;
        nextLink.href = `${basePath}volumes/`;
        nextLink.innerHTML = 'Revoir la formation <span aria-hidden="true">→</span>';
      } else {
        const nextCard = profileVolumes.find((card) => {
          const order = Number(card.dataset.volumeOrder || 1);
          return card.dataset.volumeOptional !== "true"
            && isVolumeUnlocked(order, progressData)
            && Number(progressData[String(order)] || 0) < passingScore;
        });
        const order = Number(nextCard?.dataset.volumeOrder || 1);
        const partCount = Number(nextCard?.dataset.volumePartCount || 1);
        const hasParts = nextCard?.dataset.volumeHasParts === "true";
        const validatedParts = Array.from({ length: partCount }, (_, index) => partScore(order, index + 1, progressData)).filter(
          (partResult) => partResult >= passingScore,
        ).length;
        const title = nextCard?.querySelector("h3")?.textContent || `Volume ${order}`;
        const score = Number(progressData[String(order)] || 0);
        const target = nextCard?.querySelector("[data-profile-volume-link]")?.href || `${basePath}volumes/`;
        const nextPart = hasParts && validatedParts < partCount ? validatedParts + 1 : 0;
        const waitingForNextPart = hasParts && validatedParts === partCount && !score;
        nextTitle.textContent = waitingForNextPart
          ? `Progression à jour dans le Volume ${order}`
          : nextPart > 1
            ? `Continuer avec la Partie ${nextPart}`
            : score
              ? `Améliorer votre score au Volume ${order}`
              : `Commencer le Volume ${order}`;
        nextText.textContent = waitingForNextPart
          ? `${partCount === 1 ? "La partie actuellement disponible est validée" : `Les ${partCount} parties actuellement disponibles sont validées`}. Le résultat de la Partie ${partCount} est enregistré pour la prochaine partie.`
          : nextPart > 1
          ? `La Partie ${validatedParts} est validée. Vous pouvez maintenant poursuivre « ${title} » avec la Partie ${nextPart}.`
          : score
            ? `Votre meilleur résultat est ${score}/10. Atteignez 8/10 pour valider « ${title} ».`
            : `Poursuivez avec « ${title} », puis validez son QCM pour débloquer la suite.`;
        nextLink.href = waitingForNextPart
          ? target.split("#")[0]
          : nextPart > 1
            ? `${target.split("#")[0]}${profilePartAnchor(nextCard, nextPart)}`
            : score
              ? `${target.split("#")[0]}#exercices`
              : target;
        nextLink.innerHTML = `${waitingForNextPart ? `Revoir le Volume ${order}` : nextPart > 1 ? `Ouvrir la Partie ${nextPart}` : score ? "Reprendre le QCM" : "Continuer"} <span aria-hidden="true">→</span>`;
      }
    }

    const hasStarted = Object.values(progressData).some((score) => Number(score) > 0);
    document.querySelectorAll('[data-profile-achievement="start"]').forEach((item) => item.classList.toggle("is-earned", hasStarted || isAdminAccess()));
    document.querySelectorAll('[data-profile-achievement="half"]').forEach((item) => item.classList.toggle("is-earned", scores[0] >= passingScore));
    document.querySelectorAll('[data-profile-achievement="complete"]').forEach((item) => item.classList.toggle("is-earned", validated === requiredOrders.length));
  }

  document.querySelectorAll("[data-profile-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await accessApi("logout");
      } catch (error) {
        // Local logout must remain available even if the network is unavailable.
      } finally {
        button.disabled = false;
        revokeAccess("Compte déconnecté. Saisissez le code du profil à ouvrir.");
      }
    });
  });

  const rankSettingsForm = document.querySelector("[data-rank-settings-form]");
  const rankSettingsMode = rankSettingsForm?.querySelector("[data-rank-settings-mode]");
  const rankThresholdInputs = [...(rankSettingsForm?.querySelectorAll("[data-rank-threshold-input]") || [])];
  const rankSettingsPreview = rankSettingsForm?.querySelector("[data-rank-settings-preview]");
  const rankSettingsStatus = rankSettingsForm?.querySelector("[data-rank-settings-status]");

  function rankSettingsFromForm() {
    return {
      mode: rankSettingsMode?.value === "manual" ? "manual" : "auto",
      thresholds: Object.fromEntries(
        rankThresholdInputs.map((input) => [input.dataset.rankThresholdInput, Number(input.value || 0)]),
      ),
    };
  }

  function updateRankSettingsForm(settings = readRankSettings()) {
    if (!rankSettingsForm || !rankSettingsMode) return;
    rankSettingsMode.value = settings.mode;
    rankThresholdInputs.forEach((input) => {
      input.value = String(Number(settings.thresholds?.[input.dataset.rankThresholdInput] || 1));
      input.disabled = settings.mode !== "manual";
    });
    const ranks = resolvedRanks(totalAvailableVolumes, settings);
    if (rankSettingsPreview) {
      rankSettingsPreview.textContent = ranks
        .map((rank) => `${rank.name} ${rank.minValidated}`)
        .join(" · ");
    }
  }

  rankSettingsMode?.addEventListener("change", () => {
    const settings = rankSettingsFromForm();
    rankThresholdInputs.forEach((input) => { input.disabled = settings.mode !== "manual"; });
    const ranks = resolvedRanks(totalAvailableVolumes, settings);
    if (rankSettingsPreview) rankSettingsPreview.textContent = ranks.map((rank) => `${rank.name} ${rank.minValidated}`).join(" · ");
  });
  rankThresholdInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (!rankSettingsPreview) return;
      const ranks = resolvedRanks(totalAvailableVolumes, rankSettingsFromForm());
      rankSettingsPreview.textContent = ranks.map((rank) => `${rank.name} ${rank.minValidated}`).join(" · ");
    });
  });
  rankSettingsForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdminAccess()) return;
    const settings = rankSettingsFromForm();
    localStorage.setItem(rankSettingsKey, JSON.stringify(settings));
    updateRankSettingsForm(settings);
    updateCourseProgress();
    if (rankSettingsStatus) rankSettingsStatus.textContent = "Seuils enregistrés et rangs recalculés.";
  });
  rankSettingsForm?.querySelector("[data-rank-settings-reset]")?.addEventListener("click", () => {
    if (!isAdminAccess()) return;
    localStorage.removeItem(rankSettingsKey);
    updateRankSettingsForm();
    updateCourseProgress();
    if (rankSettingsStatus) rankSettingsStatus.textContent = "Répartition automatique restaurée.";
  });
  updateRankSettingsForm();

  const progressResetForm = document.querySelector("[data-progress-reset-form]");
  progressResetForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdminAccess()) return;
    const profileId = progressResetForm.querySelector("[data-progress-reset-profile]")?.value;
    const volumeOrder = Number(progressResetForm.querySelector("[data-progress-reset-volume]")?.value || 0);
    const profileName = knownProfileLabels[profileId];
    if (!profileName || !volumeOrder) return;
    const confirmed = window.confirm(`Dévalider le Volume ${volumeOrder} pour ${profileName} ? Les scores de ses parties seront supprimés sur cet appareil.`);
    if (!confirmed) return;
    const targetKey = `${courseProgressPrefix}:${profileId}`;
    let progressData = {};
    try {
      progressData = JSON.parse(localStorage.getItem(targetKey) || "{}");
    } catch (error) {
      progressData = {};
    }
    Object.keys(progressData).forEach((key) => {
      if (key === String(volumeOrder) || key.startsWith(`${volumeOrder}-part-`)) delete progressData[key];
    });
    localStorage.setItem(targetKey, JSON.stringify(progressData));
    if (profileId === currentAccessProfile()?.id) updateCourseProgress();
    const status = progressResetForm.querySelector("[data-progress-reset-status]");
    if (status) status.textContent = `Volume ${volumeOrder} dévalidé pour ${profileName}. Son rang sera recalculé à la prochaine ouverture du profil.`;
  });

  const rankSoundPreferenceKey = "tradevisionpro-rank-sound-v1";
  let rankSoundEnabled = true;
  try {
    rankSoundEnabled = localStorage.getItem(rankSoundPreferenceKey) !== "off";
  } catch (error) {
    rankSoundEnabled = true;
  }

  const rankSoundProfiles = {
    bronze: { root: 130.81, wave: "triangle", brightness: 780, chord: [130.81, 196, 261.63], tempo: 0.9 },
    silver: { root: 164.81, wave: "sine", brightness: 1850, chord: [220, 329.63, 440], tempo: 0.96 },
    gold: { root: 196, wave: "triangle", brightness: 1450, chord: [196, 293.66, 392, 493.88], tempo: 1 },
    platine: { root: 220, wave: "sine", brightness: 2350, chord: [220, 329.63, 440, 659.25], tempo: 1.06 },
    elite: { root: 110, wave: "sawtooth", brightness: 2100, chord: [110, 220, 329.63, 440, 659.25], tempo: 1.12 },
  };

  function createRankSoundEngine() {
    let context = null;
    let master = null;
    const activeSources = new Set();

    function prepare() {
      if (!rankSoundEnabled) return null;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = 0.0001;
        master.connect(context.destination);
      }
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.setTargetAtTime(0.16, now, 0.035);
      context.resume?.().catch(() => {});
      return context;
    }

    function register(source) {
      activeSources.add(source);
      source.addEventListener?.("ended", () => activeSources.delete(source), { once: true });
      return source;
    }

    function voiceChain(source, { start, duration, gain = 0.03, attack = 0.018, pan = 0, filter = 0 } = {}) {
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      let tail = gainNode;
      if (filter > 0) {
        const filterNode = context.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.frequency.setValueAtTime(filter, start);
        filterNode.Q.value = 0.7;
        gainNode.connect(filterNode);
        tail = filterNode;
      }
      if (context.createStereoPanner) {
        const panner = context.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
        tail.connect(panner);
        panner.connect(master);
      } else {
        tail.connect(master);
      }
      source.connect(gainNode);
      return gainNode;
    }

    function tone({
      offset = 0,
      duration = 0.35,
      frequency = 220,
      endFrequency = 0,
      type = "sine",
      gain = 0.025,
      attack = 0.018,
      pan = 0,
      filter = 0,
    } = {}) {
      if (!context || !master) return;
      const start = context.currentTime + Math.max(0, offset);
      const oscillator = register(context.createOscillator());
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
      if (endFrequency > 0) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
      }
      voiceChain(oscillator, { start, duration, gain, attack, pan, filter });
      oscillator.start(start);
      oscillator.stop(start + duration + 0.04);
    }

    function noise({
      offset = 0,
      duration = 0.22,
      gain = 0.018,
      frequency = 1200,
      type = "bandpass",
      pan = 0,
    } = {}) {
      if (!context || !master) return;
      const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) {
        const envelope = 1 - index / frameCount;
        data[index] = (Math.random() * 2 - 1) * envelope * envelope;
      }
      const source = register(context.createBufferSource());
      source.buffer = buffer;
      const start = context.currentTime + Math.max(0, offset);
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.0001, gain), start);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      const filterNode = context.createBiquadFilter();
      filterNode.type = type;
      filterNode.frequency.setValueAtTime(frequency, start);
      filterNode.Q.value = type === "bandpass" ? 3.2 : 0.8;
      source.connect(filterNode);
      filterNode.connect(gainNode);
      if (context.createStereoPanner) {
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        gainNode.connect(panner);
        panner.connect(master);
      } else {
        gainNode.connect(master);
      }
      source.start(start);
      source.stop(start + duration + 0.03);
    }

    function metallicImpact(offset, profile, pan = 0, weight = 1) {
      tone({
        offset,
        duration: 0.24,
        frequency: profile.root * 2.02,
        endFrequency: profile.root * 1.72,
        type: "triangle",
        gain: 0.018 * weight,
        pan,
        filter: profile.brightness,
      });
      tone({
        offset: offset + 0.012,
        duration: 0.18,
        frequency: profile.root * 3.71,
        type: "sine",
        gain: 0.01 * weight,
        pan: -pan,
      });
      noise({
        offset,
        duration: 0.16,
        gain: 0.012 * weight,
        frequency: profile.brightness,
        pan,
      });
    }

    function lowImpact(offset, profile, weight = 1) {
      tone({
        offset,
        duration: 0.58,
        frequency: profile.root,
        endFrequency: profile.root * 0.57,
        type: "sine",
        gain: 0.045 * weight,
        attack: 0.008,
        filter: 620,
      });
      noise({
        offset,
        duration: 0.34,
        gain: 0.016 * weight,
        frequency: 260,
        type: "lowpass",
      });
    }

    function energyRise(offset, duration, profile, gain = 0.018) {
      tone({
        offset,
        duration,
        frequency: profile.root * 0.76,
        endFrequency: profile.root * 4.05,
        type: profile.wave,
        gain,
        attack: Math.min(0.45, duration * 0.42),
        filter: profile.brightness,
      });
      noise({
        offset: offset + duration * 0.35,
        duration: duration * 0.6,
        gain: gain * 0.42,
        frequency: profile.brightness,
        type: "highpass",
      });
    }

    function resolutionChord(offset, profile, gain = 0.018) {
      profile.chord.forEach((frequency, index) => {
        tone({
          offset: offset + index * 0.018,
          duration: 1.35 - index * 0.04,
          frequency,
          type: index === 0 ? "triangle" : "sine",
          gain: gain / Math.max(1, Math.sqrt(profile.chord.length)),
          attack: 0.04 + index * 0.012,
          pan: (index / Math.max(1, profile.chord.length - 1) - 0.5) * 0.7,
          filter: profile.brightness * 1.2,
        });
      });
    }

    function progression(offset, profile) {
      [0, 0.2, 0.42, 0.66, 0.9].forEach((step, index) => {
        tone({
          offset: offset + step,
          duration: 0.2,
          frequency: profile.root * (1.45 + index * 0.23),
          type: "sine",
          gain: 0.011 + index * 0.0015,
          attack: 0.008,
          pan: -0.35 + index * 0.17,
        });
      });
    }

    function stop(fade = 0.045) {
      if (!context || !master) return;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      activeSources.forEach((source) => {
        try {
          source.stop(now + fade + 0.02);
        } catch (error) {
          // The source may already have ended.
        }
      });
      activeSources.clear();
    }

    function playStandard(rankId) {
      if (!prepare()) return;
      const profile = rankSoundProfiles[rankId] || rankSoundProfiles.bronze;
      progression(0.08, profile);
      energyRise(0.2, 1.05, profile, 0.011);
      metallicImpact(1.12, profile, 0.18, 0.62);
      tone({ offset: 1.28, duration: 0.22, frequency: profile.root * 4.2, type: "sine", gain: 0.012 });
      lowImpact(1.5, profile, 0.48);
      resolutionChord(1.62, profile, 0.013);
    }

    function playRankUp(rankId) {
      if (!prepare()) return;
      const profile = rankSoundProfiles[rankId] || rankSoundProfiles.silver;
      const pace = profile.tempo;
      energyRise(0.05, 2.45 * pace, profile, rankId === "elite" ? 0.025 : 0.019);
      metallicImpact(0.34 * pace, profile, -0.46, 0.72);
      metallicImpact(0.76 * pace, profile, 0.46, 0.76);
      metallicImpact(1.18 * pace, profile, -0.3, 0.88);
      metallicImpact(1.58 * pace, profile, 0.3, 0.92);
      metallicImpact(2.02 * pace, profile, 0, 1);
      tone({
        offset: 2.24 * pace,
        duration: 0.72,
        frequency: profile.root * 1.35,
        endFrequency: profile.root * 3.2,
        type: profile.wave,
        gain: 0.022,
        filter: profile.brightness * 1.25,
      });
      lowImpact(2.8 * pace, profile, rankId === "elite" ? 1.28 : rankId === "platine" ? 1.12 : 1);
      noise({
        offset: 2.82 * pace,
        duration: 0.5,
        gain: rankId === "elite" ? 0.025 : 0.018,
        frequency: profile.brightness * 1.15,
        type: "highpass",
      });
      resolutionChord(3.02 * pace, profile, rankId === "elite" ? 0.027 : 0.021);
      tone({
        offset: 3.48 * pace,
        duration: 1.15,
        frequency: profile.root * 0.5,
        type: "sine",
        gain: 0.012,
        attack: 0.12,
        filter: 520,
      });
    }

    function preview(rankId) {
      if (!prepare()) return;
      const profile = rankSoundProfiles[rankId] || rankSoundProfiles.bronze;
      metallicImpact(0, profile, 0, 0.5);
      resolutionChord(0.08, profile, 0.009);
    }

    return {
      prime: prepare,
      playStandard,
      playRankUp,
      preview,
      stop,
    };
  }

  const rankSoundEngine = createRankSoundEngine();
  const rankReveal = document.querySelector("[data-rank-reveal]");
  const rankSoundToggle = rankReveal?.querySelector("[data-rank-sound-toggle]");
  let rankRevealReturnFocus = null;
  let rankRevealFocusTimer = 0;

  function updateRankSoundUi() {
    if (!rankSoundToggle) return;
    rankSoundToggle.setAttribute("aria-pressed", String(rankSoundEnabled));
    rankSoundToggle.setAttribute("aria-label", rankSoundEnabled ? "Désactiver les bruitages" : "Activer les bruitages");
    const icon = rankSoundToggle.querySelector("[data-rank-sound-icon]");
    const label = rankSoundToggle.querySelector("[data-rank-sound-label]");
    if (icon) icon.textContent = rankSoundEnabled ? "◖)))" : "◖×";
    if (label) label.textContent = rankSoundEnabled ? "Son activé" : "Son coupé";
  }
  updateRankSoundUi();

  function closeRankReveal() {
    if (!rankReveal || rankReveal.hidden) return;
    rankSoundEngine.stop();
    window.clearTimeout(rankRevealFocusTimer);
    rankRevealFocusTimer = 0;
    rankReveal.classList.remove("is-visible", "is-rank-up", "is-standard", "is-reduced");
    rankReveal.hidden = true;
    document.body.classList.remove("rank-reveal-open");
    rankRevealReturnFocus?.focus?.({ preventScroll: true });
    rankRevealReturnFocus = null;
  }

  function showRankProgress({ volumeOrder, volumeTitle, beforeProgress, afterProgress, focusTarget }) {
    if (!rankReveal) return;
    const ranks = resolvedRanks();
    const beforeValidated = validatedVolumeCount(beforeProgress);
    const afterValidated = validatedVolumeCount(afterProgress);
    const beforeState = rankProgressState(beforeValidated, ranks);
    const afterState = rankProgressState(afterValidated, ranks);
    const rankUp = beforeState.current.id !== afterState.current.id;
    const remaining = afterState.next ? Math.max(0, afterState.next.minValidated - afterValidated) : 0;
    const progressPercent = Math.round(afterState.progress * 100);
    const continueButton = rankReveal.querySelector("[data-rank-reveal-continue]");

    rankReveal.hidden = false;
    rankReveal.dataset.rank = afterState.current.id;
    rankReveal.classList.remove("is-visible", "is-rank-up", "is-standard", "is-reduced");
    rankReveal.classList.add(rankUp ? "is-rank-up" : "is-standard");
    if (reduceMotion) rankReveal.classList.add("is-reduced");
    showRankEmblem(rankReveal, afterState.current.id);
    rankReveal.querySelector("[data-rank-reveal-eyebrow]").textContent = rankUp ? "Nouveau rang" : "Volume validé";
    rankReveal.querySelector("[data-rank-reveal-title]").textContent = rankUp
      ? afterState.current.name.toUpperCase()
      : `Volume ${volumeOrder} validé`;
    rankReveal.querySelector("[data-rank-reveal-volume]").textContent = rankUp
      ? `Volume ${volumeOrder} validé · ${volumeTitle || `Volume ${volumeOrder}`}`
      : volumeTitle || `Volume ${volumeOrder}`;
    rankReveal.querySelector("[data-rank-reveal-message]").textContent = rankUp
      ? `${afterState.current.celebration || "Votre progression franchit une nouvelle étape."} Vous avez validé ${afterValidated} volume${afterValidated > 1 ? "s" : ""}.`
      : afterState.next
        ? `${afterValidated} volume${afterValidated > 1 ? "s" : ""} sur ${afterState.next.minValidated} nécessaire${afterState.next.minValidated > 1 ? "s" : ""} pour atteindre ${afterState.next.name}.`
        : `Vous avez atteint le rang maximal avec ${afterValidated} volume${afterValidated > 1 ? "s" : ""} validé${afterValidated > 1 ? "s" : ""}.`;
    rankReveal.querySelector("[data-rank-reveal-progress-label]").textContent = afterState.next
      ? `Vers ${afterState.next.name}`
      : "Formation disponible";
    rankReveal.querySelector("[data-rank-reveal-progress-value]").textContent = afterState.next
      ? `${afterValidated} / ${afterState.next.minValidated}`
      : `${afterValidated} / ${totalAvailableVolumes}`;
    rankReveal.querySelector("[data-rank-reveal-current]").textContent = afterState.current.name;
    const progressElement = rankReveal.querySelector("[data-rank-reveal-progress]");
    progressElement?.setAttribute("aria-valuenow", String(progressPercent));
    const progressBar = rankReveal.querySelector("[data-rank-reveal-progress-bar]");
    if (progressBar) {
      progressBar.style.width = "0%";
      progressBar.dataset.targetWidth = `${progressPercent}%`;
    }
    const remainingLabel = rankReveal.querySelector("[data-rank-reveal-progress-label]");
    if (remainingLabel && afterState.next && remaining > 0) {
      remainingLabel.title = `${remaining} volume${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}`;
    }
    rankRevealReturnFocus = focusTarget || document.activeElement;
    if (continueButton) continueButton.disabled = true;
    document.body.classList.add("rank-reveal-open");
    if (rankUp) rankSoundEngine.playRankUp(afterState.current.id);
    else rankSoundEngine.playStandard(afterState.current.id);
    requestAnimationFrame(() => {
      rankReveal.classList.add("is-visible");
      requestAnimationFrame(() => {
        if (progressBar) progressBar.style.width = progressBar.dataset.targetWidth || `${progressPercent}%`;
      });
      const rankUpFocusDelay = {
        platine: 3800,
        elite: 4100,
      }[afterState.current.id] || 3550;
      rankRevealFocusTimer = window.setTimeout(
        () => {
          if (continueButton) {
            continueButton.disabled = false;
            continueButton.focus({ preventScroll: true });
          }
        },
        reduceMotion ? 0 : rankUp ? reducedRankEffects ? 1900 : rankUpFocusDelay : 1900,
      );
    });
  }

  rankReveal?.querySelector("[data-rank-reveal-continue]")?.addEventListener("click", closeRankReveal);
  rankReveal?.querySelector("[data-rank-reveal-skip]")?.addEventListener("click", closeRankReveal);
  rankSoundToggle?.addEventListener("click", () => {
    rankSoundEnabled = !rankSoundEnabled;
    try {
      localStorage.setItem(rankSoundPreferenceKey, rankSoundEnabled ? "on" : "off");
    } catch (error) {
      // The preference remains active for this page if storage is unavailable.
    }
    updateRankSoundUi();
    if (!rankSoundEnabled) {
      rankSoundEngine.stop();
    } else {
      rankSoundEngine.preview(rankReveal?.dataset.rank || "bronze");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!rankReveal || rankReveal.hidden) return;
    if (event.key === "Escape") {
      closeRankReveal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...rankReveal.querySelectorAll("button:not([disabled])")].filter((element) => {
      const style = window.getComputedStyle(element);
      return element.offsetParent && style.visibility !== "hidden" && style.pointerEvents !== "none";
    });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const streakReward = document.querySelector("[data-streak-reward]");
  const streakAudio = document.querySelector("[data-streak-audio]");
  const streakSoundToggles = [...document.querySelectorAll("[data-streak-sound-toggle]")];
  let streakRewardReturnFocus = null;
  let pendingStreakSound = false;
  let streakSoundPlayed = false;

  function primeStreakSound() {
    if (!streakAudio) return;
    streakAudio.volume = 0.34;
    streakAudio.load();
  }

  async function playStreakSound() {
    if (!streakAudio || !rewardSoundEnabled || streakSoundPlayed) return false;
    try {
      streakAudio.currentTime = 0;
      streakAudio.volume = 0.34;
      await streakAudio.play();
      streakSoundPlayed = true;
      pendingStreakSound = false;
      return true;
    } catch (error) {
      pendingStreakSound = true;
      return false;
    }
  }

  function updateStreakSoundUi() {
    streakSoundToggles.forEach((button) => {
      button.setAttribute("aria-pressed", String(rewardSoundEnabled));
      button.setAttribute("aria-label", rewardSoundEnabled ? "Désactiver les sons de récompense" : "Activer les sons de récompense");
      const icon = button.querySelector("span[aria-hidden]");
      const label = button.querySelector("[data-streak-sound-label]");
      if (icon) icon.textContent = rewardSoundEnabled ? "◖)))" : "◖×";
      if (label) label.textContent = rewardSoundEnabled ? "Son activé" : "Son coupé";
    });
  }

  function updateFlameState(scope, state) {
    scope?.querySelectorAll(".streak-flame__body").forEach((body) => {
      body.setAttribute(
        "fill",
        state === "broken" ? body.dataset.streakMutedFill : body.dataset.streakActiveFill,
      );
    });
  }

  function renderStreakWeek(scope, weekProgress = []) {
    scope?.querySelectorAll("[data-streak-week]").forEach((week) => {
      const fallbackLabels = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
      const days = Array.from({ length: 7 }, (_, index) => weekProgress[index] || {
        label: fallbackLabels[index],
        state: "future",
        localDate: "",
      });
      week.replaceChildren(...days.map((day) => {
        const item = document.createElement("li");
        const state = ["validated", "today_validated", "future", "missed"].includes(day.state)
          ? day.state
          : "future";
        const stateLabels = {
          validated: "Validé",
          today_validated: "Aujourd’hui",
          future: "À venir",
          missed: "Non validé",
        };
        item.dataset.state = state;
        item.setAttribute(
          "aria-label",
          `${day.label || fallbackLabels[index]} : ${stateLabels[state]}${day.localDate ? `, ${day.localDate}` : ""}`,
        );
        const label = document.createElement("span");
        label.textContent = day.label || fallbackLabels[index];
        const indicator = document.createElement("i");
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = ["validated", "today_validated"].includes(state) ? "✓" : "";
        const detail = document.createElement("small");
        detail.textContent = stateLabels[state];
        item.append(label, indicator, detail);
        return item;
      }));
    });
  }

  function updateProfileStreak(streak = activeStreak) {
    const card = document.querySelector("[data-profile-streak]");
    if (!card || !streak) return;
    const count = Math.max(0, Number(streak.currentStreak || 0));
    const broken = streak.status === "broken";
    card.dataset.state = broken ? "broken" : "active";
    card.setAttribute("aria-busy", "false");
    card.setAttribute(
      "aria-label",
      broken
        ? `Série interrompue : 0 jour. Record personnel : ${streak.longestStreak || 0} jours`
        : `Série active : ${count} jour${count === 1 ? "" : "s"} consécutif${count === 1 ? "" : "s"}`,
    );
    updateFlameState(card, broken ? "broken" : "active");
    const countNode = card.querySelector("[data-streak-count]");
    const unitNode = card.querySelector("[data-streak-unit]");
    const statusNode = card.querySelector("[data-streak-status]");
    const recordNode = card.querySelector("[data-streak-record]");
    if (countNode) countNode.textContent = String(count);
    if (unitNode) unitNode.textContent = `${count === 1 ? "jour" : "jours"} de série`;
    if (statusNode) statusNode.textContent = broken
      ? "Série interrompue"
      : count === 1
        ? "Première journée validée"
        : "Série active";
    if (recordNode) {
      const record = Math.max(0, Number(streak.longestStreak || 0));
      recordNode.textContent = `${record} ${record === 1 ? "jour" : "jours"}`;
    }
    renderStreakWeek(card, streak.weekProgress);
  }

  function closeStreakReward() {
    if (!streakReward || streakReward.hidden) return;
    streakReward.classList.remove("is-visible", "is-started", "is-incremented");
    streakReward.hidden = true;
    document.body.classList.remove("streak-reward-open");
    pendingStreakSound = false;
    streakRewardReturnFocus?.focus?.({ preventScroll: true });
    streakRewardReturnFocus = null;
  }

  function showStreakReward(streak) {
    if (!streakReward || !["started", "incremented"].includes(streak?.event)) return;
    const count = Math.max(1, Number(streak.currentStreak || 1));
    streakRewardReturnFocus = document.activeElement;
    streakSoundPlayed = false;
    pendingStreakSound = Boolean(streak.shouldPlaySound && rewardSoundEnabled);
    streakReward.hidden = false;
    streakReward.classList.remove("is-visible", "is-started", "is-incremented");
    streakReward.classList.add(streak.event === "started" ? "is-started" : "is-incremented");
    updateFlameState(streakReward, "active");
    const countNode = streakReward.querySelector("[data-streak-reward-count]");
    const labelNode = streakReward.querySelector("[data-streak-reward-label]");
    const messageNode = streakReward.querySelector("[data-streak-reward-message]");
    if (countNode) countNode.textContent = String(count);
    if (labelNode) labelNode.textContent = `${count === 1 ? "jour" : "jours"} de série`;
    if (messageNode) messageNode.textContent = streak.message || "Nouvelle journée validée.";
    renderStreakWeek(streakReward, streak.weekProgress);
    document.body.classList.add("streak-reward-open");
    requestAnimationFrame(() => {
      streakReward.classList.add("is-visible");
      streakReward.querySelector("[data-streak-reward-continue]")?.focus({ preventScroll: true });
    });
    if (pendingStreakSound) playStreakSound();
  }

  function syncStreakResponse(response, { allowCelebration = false } = {}) {
    if (!response?.streak) return;
    activeStreak = response.streak;
    if (response.preferences) rewardSoundEnabled = response.preferences.rewardSoundEnabled !== false;
    updateStreakSoundUi();
    updateProfileStreak(activeStreak);
    if (
      allowCelebration
      && activeStreak.shouldCelebrate
      && ["started", "incremented"].includes(activeStreak.event)
    ) {
      showStreakReward(activeStreak);
    }
  }

  streakSoundToggles.forEach((button) => {
    button.addEventListener("click", async () => {
      const previous = rewardSoundEnabled;
      rewardSoundEnabled = !rewardSoundEnabled;
      if (!rewardSoundEnabled && streakAudio) {
        streakAudio.pause();
        streakAudio.currentTime = 0;
        pendingStreakSound = false;
      }
      updateStreakSoundUi();
      try {
        const result = await accessApi("preference", { rewardSoundEnabled });
        rewardSoundEnabled = result.rewardSoundEnabled !== false;
        updateStreakSoundUi();
        if (rewardSoundEnabled && !streakReward?.hidden && activeStreak?.shouldPlaySound) {
          streakSoundPlayed = false;
          await playStreakSound();
        }
      } catch (error) {
        rewardSoundEnabled = previous;
        updateStreakSoundUi();
        button.title = "La préférence n’a pas pu être synchronisée. Réessayez.";
      }
    });
  });

  streakReward?.querySelector("[data-streak-reward-continue]")?.addEventListener("click", async () => {
    if (pendingStreakSound && rewardSoundEnabled) await playStreakSound();
    closeStreakReward();
  });

  document.addEventListener("keydown", (event) => {
    if (!streakReward || streakReward.hidden) return;
    if (event.key === "Escape") {
      closeStreakReward();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...streakReward.querySelectorAll("button:not([disabled])")].filter((element) => {
      const style = window.getComputedStyle(element);
      return element.offsetParent && style.visibility !== "hidden";
    });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  updateStreakSoundUi();

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
      else if (url.hash.startsWith("#exercices")) url.hash = "";
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
  document.querySelectorAll("[data-volume-part-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.dataset.locked !== "true") {
        setVolumeTab("course", { updateHash: false });
        return;
      }
      event.preventDefault();
      const requiredPart = Math.max(1, Number(link.dataset.partOrder || 2) - 1);
      setVolumeTab("exercises", { updateHash: false });
      document.querySelector(`#exercices-partie-${requiredPart}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setDrawer(false);
    });
  });
  document.querySelectorAll("[data-open-part-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPart = Number(button.dataset.targetPart || 1);
      setVolumeTab("exercises", { updateHash: false });
      document.querySelector(`#exercices-partie-${targetPart}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-quiz]").forEach((quizForm) => {
    const questions = [...quizForm.querySelectorAll("[data-quiz-question]")];
    const previousButton = quizForm.querySelector("[data-quiz-previous]");
    const nextButton = quizForm.querySelector("[data-quiz-next]");
    const submitButton = quizForm.querySelector("[data-quiz-submit]");
    const restartInlineButton = quizForm.querySelector("[data-quiz-restart-inline]");
    const help = quizForm.querySelector("[data-quiz-help]");
    const progressText = quizForm.querySelector("[data-quiz-progress-text]");
    const answeredText = quizForm.querySelector("[data-quiz-answered]");
    const progressBar = quizForm.querySelector("[data-quiz-progress-bar]");
    const result = quizForm.parentElement.querySelector("[data-quiz-result]");
    const quizWorkspace = quizForm.closest(".quiz-workspace");
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
      if (restartInlineButton) restartInlineButton.hidden = !reviewed;
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
      const partOrder = Number(quizForm.dataset.partOrder || 0);
      const completesVolume = quizForm.dataset.completesVolume === "true";
      const awaitsNextPart = quizForm.dataset.awaitsNextPart === "true";
      const awaitsFutureVolume = quizForm.dataset.awaitsFutureVolume === "true";
      const futureVolumeNumber = Number(quizForm.dataset.futureVolumeNumber || volumeOrder + 1);
      const passed = score >= passingScore;
      const progressBeforeSave = readCourseProgress();
      const volumeWasValidated = Number(progressBeforeSave[String(volumeOrder)] || 0) >= passingScore;
      saveQuizScore(volumeOrder, score, partOrder, completesVolume);
      const progressAfterSave = readCourseProgress();
      const volumeIsNowValidated = Number(progressAfterSave[String(volumeOrder)] || 0) >= passingScore;
      const volumeValidatedNow = !volumeWasValidated && volumeIsNowValidated;
      updateCourseProgress();
      quizForm.classList.add("is-reviewed");
      if (result) {
        quizForm.hidden = true;
        quizWorkspace?.classList.remove("is-review-mode");
        quizWorkspace?.classList.add("is-result-mode");
        result.hidden = false;
        result.classList.toggle("is-success", passed);
        result.classList.toggle("is-retry", !passed);
        result.querySelector("[data-quiz-result-score]").textContent = String(score);
        result.querySelector("[data-quiz-result-eyebrow]").textContent = passed
          ? completesVolume || !partOrder ? "Volume validé" : "Partie validée"
          : "Objectif non atteint";
        result.querySelector("[data-quiz-result-title]").textContent = passed
          ? completesVolume
            ? `Bravo, le Volume ${volumeOrder} est validé.`
            : awaitsNextPart
              ? `La Partie ${partOrder} est validée.`
              : "Bravo, votre parcours continue."
          : "Encore un effort pour débloquer la suite.";
        const nextStepLabel = quizForm.dataset.nextStepLabel;
        const nextStepKind = quizForm.dataset.nextStepKind;
        const nextStepName = nextStepKind === "part" ? "la partie suivante" : "le volume suivant";
        result.querySelector("[data-quiz-result-message]").textContent = passed && awaitsFutureVolume
          ? `Vous obtenez ${score}/10. La Partie ${partOrder} et le Volume ${volumeOrder} sont validés. Votre score est enregistré : il permettra d’accéder au Volume ${futureVolumeNumber} lorsqu’il sera publié.`
          : passed && awaitsNextPart
            ? `Vous obtenez ${score}/10. Votre score est enregistré : il servira à débloquer la partie suivante lorsqu’elle sera publiée.`
          : passed
            ? score === 10
            ? nextStepLabel
              ? `Maîtrise parfaite : toutes les réponses sont correctes. ${nextStepName[0].toUpperCase()}${nextStepName.slice(1)} est maintenant accessible.`
              : "Maîtrise parfaite : toutes les réponses sont correctes et ce volume est validé."
            : nextStepLabel
              ? `Vous obtenez ${score}/10. Le seuil est atteint et ${nextStepName} est maintenant accessible.`
              : `Vous obtenez ${score}/10. Le seuil est atteint et ce volume est validé.`
            : `Vous obtenez ${score}/10. Consultez les explications puis recommencez : il faut au moins 8/10 pour poursuivre.`;
        const nextVolumeLink = result.querySelector("[data-quiz-next-volume]");
        if (nextVolumeLink) {
          nextVolumeLink.hidden = !passed;
          nextVolumeLink.textContent = nextStepKind === "upcoming-part"
            ? `Revenir à la Partie ${partOrder} →`
            : nextStepKind === "upcoming-volume"
              ? "Revenir à tous les volumes →"
            : nextStepLabel
              ? `Accéder ${nextStepKind === "part" ? "à la" : "au"} ${nextStepLabel} →`
              : "Revenir à tous les volumes →";
        }
        result.focus({ preventScroll: true });
        result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        if (volumeValidatedNow) {
          rankSoundEngine.prime();
          window.setTimeout(
            () => showRankProgress({
              volumeOrder,
              volumeTitle: document.querySelector(".volume-hero h1")?.textContent || `Volume ${volumeOrder}`,
              beforeProgress: progressBeforeSave,
              afterProgress: progressAfterSave,
              focusTarget: result,
            }),
            reduceMotion ? 0 : 260,
          );
        }
      }
      updateQuizView();
    });

    result?.querySelector("[data-quiz-review]")?.addEventListener("click", () => {
      quizWorkspace?.classList.remove("is-result-mode");
      quizWorkspace?.classList.add("is-review-mode");
      result.hidden = true;
      quizForm.hidden = false;
      currentQuestion = 0;
      updateQuizView();
      questions[0]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });

    result?.querySelector("[data-quiz-next-volume]")?.addEventListener("click", (event) => {
      if (!["part", "upcoming-part"].includes(event.currentTarget.dataset.nextStepKind)) return;
      setVolumeTab("course", { updateHash: false });
    });

    function resetQuiz() {
      reviewed = false;
      currentQuestion = 0;
      quizForm.reset();
      quizForm.hidden = false;
      quizForm.classList.remove("is-reviewed");
      quizWorkspace?.classList.remove("is-result-mode", "is-review-mode");
      questions.forEach((question) => {
        question.classList.remove("is-correct", "is-incorrect");
        question.querySelectorAll(".quiz-options label").forEach((label) => label.classList.remove("is-correct-answer", "is-wrong-answer"));
        const feedback = question.querySelector("[data-quiz-feedback]");
        if (feedback) feedback.hidden = true;
      });
      result.hidden = true;
      updateQuizView();
      questions[0]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }

    result?.querySelector("[data-quiz-retry]")?.addEventListener("click", resetQuiz);
    restartInlineButton?.addEventListener("click", resetQuiz);

    updateQuizView();
  });

  updateCourseProgress();
  if (window.location.hash.startsWith("#exercices")) setVolumeTab("exercises", { updateHash: false });
  window.addEventListener("hashchange", () => {
    if (window.location.hash.startsWith("#exercices")) setVolumeTab("exercises", { updateHash: false });
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
    ".asset-card",
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
