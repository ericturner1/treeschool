import { describe, expect, test } from "bun:test";
import {
  countdownDurationMs,
  countdownParts,
  countdownStorageKey,
  safeCountdownRedirectTarget
} from "./countdown";

describe("funnel countdown", () => {
  test("normalizes a configured delay and breaks remaining time into units", () => {
    const duration = countdownDurationMs({ days: 1, hours: 2, minutes: 3, seconds: 4 });
    expect(duration).toBe(93_784_000);
    expect(countdownParts(duration)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
    expect(countdownParts(-1)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  test("keys evergreen timers by page scope, element, and configured duration", () => {
    expect(countdownStorageKey("live:page:3", "timer", 60_000)).toBe(
      "treeschool:funnel-countdown:live:page:3:timer:60000"
    );
  });

  test("accepts safe relative and HTTPS redirects and rejects script URLs", () => {
    expect(safeCountdownRedirectTarget("/offer?expired=1", "https://treehomeschool.com")).toBe("/offer?expired=1");
    expect(safeCountdownRedirectTarget("https://example.com/next", "https://treehomeschool.com")).toBe("https://example.com/next");
    expect(safeCountdownRedirectTarget("javascript:alert(1)", "https://treehomeschool.com")).toBeNull();
    expect(safeCountdownRedirectTarget("//example.com/next", "https://treehomeschool.com")).toBeNull();
  });
});
