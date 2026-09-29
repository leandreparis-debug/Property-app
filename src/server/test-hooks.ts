import "server-only";

/**
 * Test hook `window.__vigieMap`: development, or a build started with
 * VIGIE_E2E_TEST_HOOKS=1 by the end-to-end suite. Never in a regular
 * production deployment (checked by an e2e test; a start-up warning is
 * logged if the variable is set in production).
 */
export function testHooksEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VIGIE_E2E_TEST_HOOKS === "1";
}
