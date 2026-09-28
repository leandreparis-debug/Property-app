import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STATE } from "./tests/e2e/fixtures";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E tests run against a production build (`next build && next start`), so
 * the strict production CSP and cookie settings are what gets tested.
 * Chromium only. Requires the database (`pnpm db:up`, migrations applied).
 *
 * - globalSetup creates the e2e admin and viewer with the `user:*` scripts;
 * - the `setup` project logs them in (after the server started) and saves
 *   their sessions; the other suites reuse them.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ADMIN_STATE },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
