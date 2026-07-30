import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAK_EVENTS,
  streakDayLabel,
  streakMessage,
  streakTransition,
} from "../supabase/functions/_shared/streak-policy.mjs";

const hour = 60 * 60 * 1000;
const baseState = {
  currentStreak: 4,
  status: "active",
  lastSuccessfulLoginAt: "2026-07-20T12:00:00.000Z",
  lastSuccessfulLoginLocalDate: "2026-07-20",
};

test("streak event contract is stable", () => {
  assert.deepEqual(STREAK_EVENTS, ["started", "incremented", "already_counted", "broken"]);
});

test("first login starts at one", () => {
  assert.deepEqual(
    streakTransition({}, { serverNow: "2026-07-20T12:00:00.000Z", localDate: "2026-07-20" }),
    { event: "started", currentStreak: 1, status: "active", shouldCelebrate: true },
  );
});

test("second login on the same local day is idempotent", () => {
  const result = streakTransition(baseState, {
    serverNow: "2026-07-20T21:00:00.000Z",
    localDate: "2026-07-20",
  });
  assert.equal(result.event, "already_counted");
  assert.equal(result.currentStreak, 4);
  assert.equal(result.shouldCelebrate, false);
});

test("new local day before 24 hours increments exactly once", () => {
  const result = streakTransition(baseState, {
    serverNow: new Date(new Date(baseState.lastSuccessfulLoginAt).getTime() + 23 * hour + 59 * 60 * 1000).toISOString(),
    localDate: "2026-07-21",
  });
  assert.equal(result.event, "incremented");
  assert.equal(result.currentStreak, 5);
  assert.equal(result.shouldCelebrate, true);
});

test("exactly 24 hours breaks the streak", () => {
  const result = streakTransition(baseState, {
    serverNow: new Date(new Date(baseState.lastSuccessfulLoginAt).getTime() + 24 * hour).toISOString(),
    localDate: "2026-07-21",
  });
  assert.deepEqual(result, {
    event: "broken",
    currentStreak: 0,
    status: "broken",
    shouldCelebrate: false,
  });
});

test("more than 24 hours also breaks the streak", () => {
  const result = streakTransition(baseState, {
    serverNow: new Date(new Date(baseState.lastSuccessfulLoginAt).getTime() + 25 * hour).toISOString(),
    localDate: "2026-07-21",
  });
  assert.equal(result.event, "broken");
});

test("a broken streak restarts on the next local day inside 24 hours", () => {
  const result = streakTransition(
    {
      currentStreak: 0,
      status: "broken",
      lastSuccessfulLoginAt: "2026-07-21T12:00:00.000Z",
      lastSuccessfulLoginLocalDate: "2026-07-21",
    },
    { serverNow: "2026-07-22T03:00:00.000Z", localDate: "2026-07-22" },
  );
  assert.equal(result.event, "started");
  assert.equal(result.currentStreak, 1);
});

test("same local day after a break remains uncelebrated", () => {
  const result = streakTransition(
    {
      currentStreak: 0,
      status: "broken",
      lastSuccessfulLoginAt: "2026-07-21T12:00:00.000Z",
      lastSuccessfulLoginLocalDate: "2026-07-21",
    },
    { serverNow: "2026-07-21T18:00:00.000Z", localDate: "2026-07-21" },
  );
  assert.equal(result.event, "already_counted");
  assert.equal(result.status, "broken");
});

test("day labels use correct French agreement", () => {
  assert.equal(streakDayLabel(0), "0 jours de série");
  assert.equal(streakDayLabel(1), "1 jour de série");
  assert.equal(streakDayLabel(2), "2 jours de série");
});

test("reward messages never claim fictitious statistics", () => {
  for (const count of [1, 2, 7, 30, 663]) {
    assert.doesNotMatch(streakMessage(count, count === 1 ? "started" : "incremented"), /%|premiers|classement/i);
  }
});
