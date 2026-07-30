export const STREAK_EVENTS = Object.freeze([
  "started",
  "incremented",
  "already_counted",
  "broken",
]);

export function streakTransition(state, { serverNow, localDate }) {
  const now = new Date(serverNow);
  if (Number.isNaN(now.getTime())) throw new TypeError("serverNow must be a valid date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new TypeError("localDate must use YYYY-MM-DD");

  if (!state.lastSuccessfulLoginAt) {
    return { event: "started", currentStreak: 1, status: "active", shouldCelebrate: true };
  }

  if (state.lastSuccessfulLoginLocalDate === localDate) {
    return {
      event: "already_counted",
      currentStreak: Number(state.currentStreak || 0),
      status: state.status || "active",
      shouldCelebrate: false,
    };
  }

  const elapsed = now.getTime() - new Date(state.lastSuccessfulLoginAt).getTime();
  if (elapsed >= 24 * 60 * 60 * 1000) {
    return { event: "broken", currentStreak: 0, status: "broken", shouldCelebrate: false };
  }

  const restarting = state.status === "broken" || Number(state.currentStreak || 0) === 0;
  return {
    event: restarting ? "started" : "incremented",
    currentStreak: restarting ? 1 : Number(state.currentStreak || 0) + 1,
    status: "active",
    shouldCelebrate: true,
  };
}

export function streakDayLabel(value) {
  const count = Math.max(0, Number(value || 0));
  return `${count} ${count === 1 ? "jour" : "jours"} de série`;
}

export function streakMessage(value, event = "incremented") {
  const count = Math.max(0, Number(value || 0));
  if (event === "started") return "Ta série commence aujourd’hui.";
  if (count >= 30) return `${count} jours de discipline.`;
  if (count >= 7) return `${count} jours consécutifs : continue sur cette lancée.`;
  return "Ta régularité construit ta progression.";
}
