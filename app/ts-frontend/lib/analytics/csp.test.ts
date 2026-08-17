import { describe, expect, test } from "bun:test";
import nextConfig from "../../next.config.mjs";

describe("analytics content security policy", () => {
  test("allows the current GA4 script and collection endpoints", async () => {
    const headerRules = await nextConfig.headers?.();
    const contentSecurityPolicy = headerRules
      ?.flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;
    const directives = new Map(
      contentSecurityPolicy?.split("; ").map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name, sources];
      })
    );
    const scriptSources = directives.get("script-src") ?? [];
    const connectionSources = directives.get("connect-src") ?? [];

    expect(scriptSources).toContain("https://www.googletagmanager.com");
    expect(connectionSources).toContain("https://*.google-analytics.com");
    expect(connectionSources).toContain("https://analytics.google.com");
    expect(connectionSources).toContain("https://*.analytics.google.com");
    expect(connectionSources).toContain("https://www.googletagmanager.com");
  });
});
