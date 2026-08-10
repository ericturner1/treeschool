import { afterEach, expect, test } from "bun:test";
import {
  authorizeInternalRequest,
  checkPublicRateLimit,
  checkPublicRequestSize,
  publicErrorMessage,
  resetHttpSecurityForTests
} from "./http-security";

afterEach(() => resetHttpSecurityForTests());

test("internal routes fail closed when the shared secret is missing", async () => {
  const response = authorizeInternalRequest(
    new Request("https://api.example/internal/accounts/profiles"),
    undefined
  );
  expect(response?.status).toBe(503);
  expect(await response?.json()).toEqual({
    error: "Internal API authentication is unavailable."
  });
});

test("internal routes use a constant-time shared-secret comparison", () => {
  const authorized = authorizeInternalRequest(
    new Request("https://api.example/internal/accounts/profiles", {
      headers: { "x-treeschool-internal-secret": "a-secure-internal-secret-value" }
    }),
    "a-secure-internal-secret-value"
  );
  const denied = authorizeInternalRequest(
    new Request("https://api.example/internal/accounts/profiles", {
      headers: { "x-treeschool-internal-secret": "wrong" }
    }),
    "a-secure-internal-secret-value"
  );
  expect(authorized).toBeNull();
  expect(denied?.status).toBe(401);
});

test("rate limits direct public lead submissions", () => {
  const request = new Request("https://api.example/public/funnels/leads", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" }
  });
  for (let index = 0; index < 30; index += 1) {
    expect(checkPublicRateLimit(request, 1_000)).toBeNull();
  }
  expect(checkPublicRateLimit(request, 1_000)?.status).toBe(429);
});

test("redacts database details while preserving intentional domain errors", () => {
  expect(publicErrorMessage(
    new Error('duplicate key value violates unique constraint "users_email_key"'),
    "Could not save the account."
  )).toBe("Could not save the account.");
  expect(publicErrorMessage(
    new Error("Choose a whole-number grade from 0 to 100."),
    "Could not save the grade."
  )).toBe("Choose a whole-number grade from 0 to 100.");
});

test("rejects oversized public event bodies before JSON parsing", () => {
  const response = checkPublicRequestSize(new Request(
    "https://api.example/public/funnels/events",
    {
      method: "POST",
      headers: { "content-length": String(128 * 1024 + 1) }
    }
  ));
  expect(response?.status).toBe(413);
});
