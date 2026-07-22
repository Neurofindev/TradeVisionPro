(() => {
  const root = document.documentElement;
  const basePath = root.dataset.basePath || "/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const accessSessionKey = "tradevisionpro-access-session-v3";
  const accessProfiles = [
    { id: "aedan-dechavigny", name: "Aedan De Chavigny", role: "learner", hash: "9c6e9172266f90a10de4d8cc2a767e9815488ae926d39ee68b1fab34091d4235" },
    { id: "yann", name: "Yann", role: "learner", hash: "e5af42e35c3fb1fe989dee4acf652b81ef0dc956753926d6b22b705d110b01fc" },
    { id: "charly-labbetoul", name: "Charly Labbetoul", role: "admin", hash: "4f8c5f5a97c0bbf84c176fda321365057b68cd8a135eaf003eae6584af3f77ba" },
  ];
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

  function currentAccessProfile() {
    return accessProfiles.find((profile) => profile.id === root.dataset.accessProfile) || null;
  }

  function grantAccess(profile) {
    if (!profile) return;
    root.dataset.accessProfile = profile.id;
    root.dataset.accessRole = profile.role;
    root.classList.remove("access-locked");
    root.classList.add("access-granted");
    if (accessGate) accessGate.hidden = true;
    updateCourseProgress();
    document.querySelector(".brand, main a, main button, main")?.focus({ preventScroll: true });
  }

  if (root.classList.contains("access-granted")) {
    const profile = currentAccessProfile();
    if (profile) {
      root.dataset.accessRole = profile.role;
      if (accessGate) accessGate.hidden = true;
    } else {
      root.classList.remove("access-granted");
      root.classList.add("access-locked");
      if (accessGate) accessGate.hidden = false;
    }
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
      const profile = accessProfiles.find((candidate) => candidate.hash === digest);
      if (!profile) {
        accessInput.value = "";
        updateAccessStatus("Code incorrect. L’accès reste verrouillé.", "error");
        accessInput.focus();
        return;
      }

      sessionStorage.setItem(accessSessionKey, profile.id);
      updateAccessStatus(`Bienvenue ${profile.name}. Ouverture de votre espace…`, "success");
      window.setTimeout(() => grantAccess(profile), reduceMotion ? 0 : 420);
    } catch (error) {
      updateAccessStatus("Validation momentanément indisponible. Réessayez.", "error");
      accessInput.focus();
    } finally {
      accessSubmit.disabled = false;
      accessSubmit.removeAttribute("aria-busy");
    }
  });

  const courseProgressPrefix = "tradevisionpro-course-progress-v2";
  const passingScore = 8;

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
    if (completesVolume) {
      const volumeKey = String(volumeOrder);
      progressData[volumeKey] = Math.max(Number(progressData[volumeKey]) || 0, score);
    }
    localStorage.setItem(key, JSON.stringify(progressData));
  }

  function isAdminAccess() {
    return root.dataset.accessRole === "admin";
  }

  function isVolumeUnlocked(volumeOrder, progressData = readCourseProgress()) {
    return isAdminAccess() || volumeOrder <= 1 || Number(progressData[String(volumeOrder - 1)] || 0) >= passingScore;
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
      const unlocked = isVolumeUnlocked(order, progressData);
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
          ? `À débloquer avec le Volume ${order - 1}`
          : score >= passingScore
            ? `Validé · ${score}/10`
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

  function updateProfileUi(progressData = readCourseProgress()) {
    const profile = currentAccessProfile();
    if (!profile) return;
    const initials = profileInitials(profile.name);
    document.querySelectorAll("[data-profile-name]").forEach((element) => { element.textContent = profile.name; });
    document.querySelectorAll("[data-profile-initials]").forEach((element) => { element.textContent = initials; });
    document.querySelectorAll("[data-profile-role]").forEach((element) => {
      element.textContent = profile.role === "admin" ? "Administrateur · accès intégral" : "Compte apprenant";
    });

    const profileVolumes = [...document.querySelectorAll("[data-profile-volume]")];
    const totalVolumes = profileVolumes.length || 3;
    const scores = Array.from({ length: totalVolumes }, (_, index) => Number(progressData[String(index + 1)] || 0));
    const validated = scores.filter((score) => score >= passingScore).length;
    const accessible = isAdminAccess() ? totalVolumes : scores.reduce((count, _score, index) => count + Number(isVolumeUnlocked(index + 1, progressData)), 0);
    const bestScore = Math.max(0, ...Object.values(progressData).map((score) => Number(score) || 0));
    const completion = Math.round((validated / totalVolumes) * 100);

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
      const score = Number(progressData[String(order)] || 0);
      const unlocked = isVolumeUnlocked(order, progressData);
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
          ? "Verrouillé"
          : complete
            ? "Validé"
            : hasParts && validatedParts === partCount
              ? "Progression à jour"
              : hasParts && validatedParts
                ? "En progression"
                : "Disponible";
      }
      if (scoreLabel) {
        scoreLabel.textContent = hasParts && !complete ? `${validatedParts}/${partCount} partie${partCount > 1 ? "s" : ""}` : score ? `${score}/10` : "Non évalué";
      }
      if (link) {
        const ownUrl = link.dataset.profileVolumeUrl || link.href;
        const previousUrl = profileVolumes[order - 2]?.querySelector("[data-profile-volume-link]")?.dataset.profileVolumeUrl;
        const nextPart = hasParts && validatedParts < partCount ? validatedParts + 1 : 0;
        const waitingForNextPart = hasParts && validatedParts === partCount && !complete;
        link.href = !unlocked && previousUrl ? `${previousUrl}#exercices` : nextPart > 1 ? `${ownUrl}${profilePartAnchor(card, nextPart)}` : ownUrl;
        link.textContent = !unlocked
          ? `Valider le Volume ${order - 1} →`
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
      } else if (validated === totalVolumes) {
        nextTitle.textContent = "Parcours entièrement validé";
        nextText.textContent = `Félicitations : les ${totalVolumes} volumes sont validés. Vous pouvez les revoir à tout moment.`;
        nextLink.href = `${basePath}volumes/`;
        nextLink.innerHTML = 'Revoir la formation <span aria-hidden="true">→</span>';
      } else {
        const nextCard = profileVolumes.find((card) => {
          const order = Number(card.dataset.volumeOrder || 1);
          return isVolumeUnlocked(order, progressData) && Number(progressData[String(order)] || 0) < passingScore;
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
    document.querySelectorAll('[data-profile-achievement="complete"]').forEach((item) => item.classList.toggle("is-earned", validated === totalVolumes));
  }

  document.querySelectorAll("[data-profile-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionStorage.removeItem(accessSessionKey);
      delete root.dataset.accessProfile;
      delete root.dataset.accessRole;
      root.classList.remove("access-granted");
      root.classList.add("access-locked");
      if (accessGate) accessGate.hidden = false;
      if (accessInput) accessInput.value = "";
      updateAccessStatus("Compte déconnecté. Saisissez le code du profil à ouvrir.");
      requestAnimationFrame(() => accessInput?.focus({ preventScroll: true }));
    });
  });

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
      saveQuizScore(volumeOrder, score, partOrder, completesVolume);
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
