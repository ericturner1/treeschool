import { afterEach, expect, test } from "bun:test";
import {
  checkRequestRateLimit,
  hasTrustedRequestOrigin,
  oversizedRequestBody,
  publicErrorMessage,
  resetRequestGuardsForTests
} from "./request-guards";

afterEach(() => resetRequestGuardsForTests());

test("rejects an unsafe request from another origin", () => {
  const request = new Request("https://www.treehomeschool.com/api/student-points/award", {
    method: "POST",
    headers: { origin: "https://attacker.example" }
  });
  expect(hasTrustedRequestOrigin(request, "/api/student-points/award")).toBe(false);
});

test("allows same-origin mutations and Stripe webhooks", () => {
  const sameOrigin = new Request("https://www.treehomeschool.com/api/student-points/award", {
    method: "POST",
    headers: { origin: "https://www.treehomeschool.com" }
  });
  const webhook = new Request("https://www.treehomeschool.com/api/billing/stripe-webhook", {
    method: "POST",
    headers: { origin: "https://stripe.example" }
  });
  expect(hasTrustedRequestOrigin(sameOrigin, "/api/student-points/award")).toBe(true);
  expect(hasTrustedRequestOrigin(webhook, "/api/billing/stripe-webhook")).toBe(true);
});

test("rate limits repeated sign-in requests per client address", () => {
  const request = new Request("https://www.treehomeschool.com/signin", {
    method: "POST",
    headers: {
      origin: "https://www.treehomeschool.com",
      "x-forwarded-for": "203.0.113.9"
    }
  });
  for (let index = 0; index < 20; index += 1) {
    expect(checkRequestRateLimit(request, "/signin", 1_000)).toBeNull();
  }
  expect(checkRequestRateLimit(request, "/signin", 1_000)).toEqual({
    limit: 20,
    retryAfterSeconds: 900
  });
});

test("rate limits public workbook preview generation", () => {
  const request = new Request("https://www.treehomeschool.com/api/native-workbooks/product-previews?slug=math-1", {
    headers: { "x-forwarded-for": "203.0.113.10" }
  });
  for (let index = 0; index < 30; index += 1) {
    expect(checkRequestRateLimit(request, "/api/native-workbooks/product-previews", 1_000)).toBeNull();
  }
  expect(checkRequestRateLimit(request, "/api/native-workbooks/product-previews", 1_000)).toEqual({
    limit: 30,
    retryAfterSeconds: 60
  });
});

test("redacts infrastructure errors returned by route handlers", () => {
  expect(publicErrorMessage(
    new Error('relation "profiles" does not exist'),
    "Could not load the account."
  )).toBe("Could not load the account.");
  expect(publicErrorMessage(
    new Error("Student profile not found."),
    "Could not load the account."
  )).toBe("Student profile not found.");
});

test("rejects oversized public JSON before parsing it", () => {
  const request = new Request("https://www.treehomeschool.com/api/funnels/leads", {
    method: "POST",
    headers: { "content-length": String(128 * 1024 + 1) }
  });
  expect(oversizedRequestBody(request, "/api/funnels/leads")).toEqual({
    limit: 128 * 1024
  });
});
