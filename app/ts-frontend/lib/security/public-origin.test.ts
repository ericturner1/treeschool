import { expect, test } from "bun:test";
import { resolvePublicAppOrigin } from "./public-origin";

test("uses the configured public origin instead of forwarded request hosts", () => {
  expect(resolvePublicAppOrigin({
    configuredUrl: "https://www.treehomeschool.com/some/path",
    nodeEnv: "production",
    requestUrl: "https://attacker.example/callback"
  })).toBe(
    "https://www.treehomeschool.com"
  );
});

test("falls back to the canonical site in production", () => {
  expect(resolvePublicAppOrigin({
    nodeEnv: "production",
    requestUrl: "https://attacker.example/callback"
  })).toBe(
    "https://www.treehomeschool.com"
  );
});
