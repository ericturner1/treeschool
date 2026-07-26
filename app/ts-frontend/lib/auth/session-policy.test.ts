import { describe, expect, test } from "bun:test";
import {
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
  hasAuthSessionGoneIdle
} from "./session-policy";

describe("authentication session policy", () => {
  test("keeps refresh credentials available for the sliding session", () => {
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90);
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(
      AUTH_SESSION_IDLE_TIMEOUT_SECONDS
    );
  });

  test("keeps an active parent signed in until two full inactive days pass", () => {
    const now = 1_800_000_000;

    expect(
      hasAuthSessionGoneIdle(String(now - AUTH_SESSION_IDLE_TIMEOUT_SECONDS + 1), now)
    ).toBe(false);
    expect(
      hasAuthSessionGoneIdle(String(now - AUTH_SESSION_IDLE_TIMEOUT_SECONDS), now)
    ).toBe(true);
    expect(
      hasAuthSessionGoneIdle(String(now - AUTH_SESSION_IDLE_TIMEOUT_SECONDS - 1), now)
    ).toBe(true);
  });

  test("gives existing sessions without an activity timestamp a one-time grace window", () => {
    expect(hasAuthSessionGoneIdle(undefined)).toBe(false);
    expect(hasAuthSessionGoneIdle("not-a-timestamp")).toBe(false);
  });
});
