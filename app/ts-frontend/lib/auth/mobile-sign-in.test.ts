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
        prepareSignUp: async () => undefined,
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
        prepareSignUp: async () => undefined,
        sendCode: async () => ({ ok: true }),
      },
    );

    expect(result.status).toBe(404);
  });

  test("prepares a new parent and lets Supabase create the user", async () => {
    const calls: unknown[] = [];
    const result = await requestMobileSignInCode(
      { email: "new@example.com", mode: "sign_up" },
      {
        canSignIn: async () => false,
        prepareSignUp: async (email) => calls.push(["prepare", email]),
        sendCode: async (...args) => {
          calls.push(args);
          return { ok: true };
        },
      },
    );

    expect(result).toEqual({ ok: true, status: 200 });
    expect(calls).toEqual([
      ["prepare", "new@example.com"],
      [
        "new@example.com",
        "com.treehomeschool.app://login-callback",
        { createUser: true },
      ],
    ]);
  });
});
