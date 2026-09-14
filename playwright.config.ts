import { defineConfig, devices } from "@playwright/test";

// E2E config for the wizard/submit/status/report flow (see test/e2e/wizard.spec.ts).
//
// BROWSER ISOLATION: this MUST only ever launch Playwright's own bundled
// Chromium, headless, in an isolated context it creates and tears down
// itself. Never add `channel: "chrome"` / "chrome-beta", never set
// `launchOptions.executablePath` to a real Chrome install, never use
// `connectOverCDP` or any "attach to existing browser" mode. The dev/Inngest
// servers are started manually (see README/CLAUDE.md) — this config does not
// manage them, so it never touches anything outside its own browser process.
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3003",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
