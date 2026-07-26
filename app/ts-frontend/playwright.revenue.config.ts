import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/revenue",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.REVENUE_SMOKE_BASE_URL ?? "http://localhost:3100",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    channel: process.env.CI ? undefined : "chrome",
    ...devices["Desktop Chrome"]
  }
});
