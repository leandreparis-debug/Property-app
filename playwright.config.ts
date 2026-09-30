import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STATE } from "./tests/e2e/fixtures";
import { E2E_PORT, e2eEnv } from "./tests/e2e/e2e-env";

const PORT = E2E_PORT;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E tests run against a production build (`next build && next start`), so
 * the strict production CSP and cookie settings are what gets tested.
 * Chromium only. Requires the database (`pnpm db:up`, migrations applied).
 *
 * - globalSetup creates the e2e admin and viewer with the `user:*` scripts;
 * - the `setup` project logs them in (after the server started) and saves
 *   their sessions; the other suites reuse them;
 * - Chromium uses software WebGL so the MapLibre map renders headless.
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: ADMIN_STATE,
        // Software WebGL (SwiftShader): the national map renders without a GPU.
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
      },
    },
  ],
  webServer: {
    // VIGIE_E2E_TEST_HOOKS exposes window.__vigieMap in this test server only;
    // map.spec.ts starts the same build WITHOUT it and checks it is absent.
    // Own database (vigie_e2e) and storage root: `vigie` is never used by the tests.
    command: `pnpm build && pnpm start -p ${PORT}`,
    env: { ...e2eEnv(), VIGIE_E2E_TEST_HOOKS: "1" },
    url: `${BASE_URL}/api/health`,
    // Never reuse a running server: it could be a `pnpm dev` on the development database.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
