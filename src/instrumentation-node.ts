/**
 * Node.js start-up tasks (imported by `instrumentation.ts` for the Node
 * runtime only):
 * 1. validate the environment (a missing or invalid variable stops the server
 *    immediately, with a message naming it);
 * 2. warn when production runs without Secure cookies;
 * 3. purge expired sessions (scheduled cleanup arrives at step 11).
 */
export async function registerNode(): Promise<void> {
  const { getEnv, EnvValidationError } = await import("@/lib/env");
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n[atlas] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
    console.warn(
      "\n[atlas] ⚠ AVERTISSEMENT SÉCURITÉ : COOKIE_SECURE=false en production. Le cookie de session " +
        "circule sans l'attribut Secure et peut être intercepté sur le réseau. Servir l'application en HTTPS " +
        "et définir COOKIE_SECURE=true dès que possible (voir docs/security.md).\n",
    );
  }

  try {
    const { purgeExpiredSessions } = await import("@/server/auth/session");
    const purged = await purgeExpiredSessions();
    if (purged > 0) console.info(`[atlas] ${purged} session(s) expirée(s) supprimée(s).`);
  } catch (error) {
    // The database may be down at start-up: /api/health reports it; don't crash.
    console.warn(`[atlas] purge des sessions impossible (${error instanceof Error ? error.name : "erreur"}).`);
  }
}
