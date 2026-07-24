import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUTH_SESSION_COOKIE_MAX_AGE_SECONDS } from "./session-policy";

describe("authentication session policy", () => {
  test("keeps a returning parent session well beyond three idle days", () => {
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90);
    expect(AUTH_SESSION_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(60 * 60 * 24 * 3);
  });

  test("does not turn one refresh race into a forced sign-out", () => {
    const middleware = readFileSync(resolve(import.meta.dir, "../../middleware.ts"), "utf8");
    expect(middleware).not.toContain("response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME)");
  });
});
