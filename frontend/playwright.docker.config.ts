import { defineConfig } from "@playwright/test";

/**
 * Alternate Playwright config for running against the live docker stack
 * (nginx on :80 reverse-proxying the React build + backend). Use this when
 * the real upload → extract → persist flow should be exercised end-to-end,
 * not the Vite dev server default.
 *
 * Usage:  npx playwright test --config=playwright.docker.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost/",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
