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

  test("uses the website mail path without creating users", async () => {
    const calls: unknown[] = [];
    const result = await requestMobileSignInCode(
      {
        email: "parent@example.com",
        requestUrl: "https://www.treehomeschool.com/api/mobile/auth/code",
      },
      {
        canSignIn: async () => true,
        publicOrigin: () => "https://www.treehomeschool.com",
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
        "https://www.treehomeschool.com/auth/confirm?next=%2Fp%2Fdashboard",
        { createUser: false },
      ],
    ]);
  });

  test("rejects an email without a parent account", async () => {
    const result = await requestMobileSignInCode(
      {
        email: "missing@example.com",
        requestUrl: "https://www.treehomeschool.com/api/mobile/auth/code",
      },
      {
        canSignIn: async () => false,
        publicOrigin: () => "https://www.treehomeschool.com",
        sendCode: async () => ({ ok: true }),
      },
    );

    expect(result.status).toBe(404);
  });
});
