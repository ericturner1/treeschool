import { describe, expect, test } from "bun:test";
import {
  normalizeMobileSignInEmail,
  requestMobileSignInCode,
} from "./mobile-sign-in";

describe("mobile email sign-in", () => {
  test("normalizes a valid email", () => {
    expect(normalizeMobileSignInEmail(" Parent@Example.com ")).toBe(
      "parent@example.com",
    );
    expect(normalizeMobileSignInEmail("not-an-email")).toBeNull();
  });

  test("uses the mobile deep link without creating users", async () => {
    const calls: unknown[] = [];
    const result = await requestMobileSignInCode(
      {
        email: "parent@example.com",
      },
      {
        canSignIn: async () => true,
        sendCode: async (...args) => {
          calls.push(args);
          return { ok: true };
        },
      },
    );

    expect(result).toEqual({ ok: true, status: 200 });
    expect(calls).toEqual([
      [
        "parent@example.com",
        "com.treehomeschool.app://login-callback",
        { createUser: false },
      ],
    ]);
  });

  test("rejects an email without a parent account", async () => {
    const result = await requestMobileSignInCode(
      {
        email: "missing@example.com",
      },
      {
        canSignIn: async () => false,
        sendCode: async () => ({ ok: true }),
      },
    );

    expect(result.status).toBe(404);
  });
});
