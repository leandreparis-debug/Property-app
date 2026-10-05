/**
 * Node.js start-up tasks (imported by `instrumentation.ts` for the Node
 * runtime only):
 * 1. validate the environment (a missing or invalid variable stops the server
 *    immediately, with a message naming it);
 * 2. warn when production runs without Secure cookies, or with the e2e test
 *    hooks enabled;
 * 3. purge the sessions expired for more than SESSION_PURGE_DAYS days;
 * 4. start the operations scheduler (`OPS_SCHEDULER=on`), never during
 *    `next build`.
 */
export async function registerNode(): Promise<void> {
  const { getEnv, EnvValidationError } = await import("@/lib/env");
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n[vigie] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
    console.warn(
      "\n[vigie] ⚠ AVERTISSEMENT SÉCURITÉ : COOKIE_SECURE=false en production. Le cookie de session " +
        "circule sans l'attribut Secure et peut être intercepté sur le réseau. Servir l'application en HTTPS " +
        "et définir COOKIE_SECURE=true dès que possible (voir docs/security.md).\n",
    );
  }

  if (env.NODE_ENV === "production" && process.env.VIGIE_E2E_TEST_HOOKS) {
    // Not blocking: the end-to-end suite starts the production build with it.
    console.warn(
      "\n[vigie] ⚠ AVERTISSEMENT SÉCURITÉ : VIGIE_E2E_TEST_HOOKS est défini en production. Les crochets de test " +
        "(window.__vigieMap) sont exposés aux navigateurs. Cette variable est réservée à la suite e2e : la retirer " +
        "de tout déploiement (voir docs/security.md).\n",
    );
  }

  try {
    const { purgeStaleSessions } = await import("@/server/auth/session");
    const purged = await purgeStaleSessions(new Date(), env.SESSION_PURGE_DAYS);
    if (purged > 0) console.info(`[vigie] ${purged} session(s) expirée(s) supprimée(s).`);
  } catch (error) {
    // The database may be down at start-up: /api/health reports it; don't crash.
    console.warn(`[vigie] purge des sessions impossible (${error instanceof Error ? error.name : "erreur"}).`);
  }

  if (env.OPS_SCHEDULER === "on" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { parseDailyTime } = await import("@/domain/ops/schedule");
    const { startScheduler } = await import("@/server/ops/scheduler");
    startScheduler({ at: parseDailyTime(env.OPS_DAILY_AT)! });
  }
}
