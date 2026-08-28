import { describe, expect, test } from "bun:test";
import { shouldShowStreakWarning } from "./streak-warning";

const activeStreak = {
  mode: "daily" as const,
  currentCount: 4,
  currentPeriodPaused: false,
  currentPeriodCompleted: false
};

describe("student overview streak warning", () => {
  test("warns when an active daily streak has no schoolwork today", () => {
    expect(shouldShowStreakWarning(activeStreak)).toBe(true);
  });

  test("does not warn after schoolwork is completed", () => {
    expect(shouldShowStreakWarning({
      ...activeStreak,
      currentPeriodCompleted: true
    })).toBe(false);
  });

  test("does not warn on a scheduled day off", () => {
    expect(shouldShowStreakWarning({
      ...activeStreak,
      currentPeriodPaused: true
    })).toBe(false);
  });

  test("does not warn when there is no streak to lose", () => {
    expect(shouldShowStreakWarning({
      ...activeStreak,
      currentCount: 0
    })).toBe(false);
  });

  test("does not describe a weekly streak as breaking today", () => {
    expect(shouldShowStreakWarning({
      ...activeStreak,
      mode: "weekly"
    })).toBe(false);
  });
});
