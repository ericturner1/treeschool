import { describe, expect, test } from "bun:test";
import {
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
  AUTH_SESSION_RENEWAL_RETRY_LIMIT,
  createAuthSessionTraceId,
  hasAuthSessionGoneIdle
} from "./session-policy";

describe("authentication session policy", () => {
  test("keeps refresh credentials available for the sliding session", () => {
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90);
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(
      AUTH_SESSION_IDLE_TIMEOUT_SECONDS
    );
  });

  test("keeps a parent signed in through normal monthly use", () => {
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

  test("retries a failed refresh once before abandoning the session", () => {
    expect(AUTH_SESSION_RENEWAL_RETRY_LIMIT).toBe(1);
  });

  test("gives existing sessions without an activity timestamp a one-time grace window", () => {
    expect(hasAuthSessionGoneIdle(undefined)).toBe(false);
    expect(hasAuthSessionGoneIdle("not-a-timestamp")).toBe(false);
  });

  test("creates opaque correlation identifiers for session diagnostics", () => {
    const first = createAuthSessionTraceId();
    const second = createAuthSessionTraceId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
