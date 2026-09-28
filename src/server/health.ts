import "server-only";
import { db } from "./db";

/** Database reachability as exposed by `/api/health`. */
export type DatabaseHealth = "ok" | "unreachable";

/** Maximum time allowed for the database probe. */
export const DATABASE_PROBE_TIMEOUT_MS = 2_000;

/**
 * Runs `SELECT 1` against the database, bounded by a timeout.
 *
 * Never throws and never returns the raw error: failures are logged on the
 * server with the error class only (the message may contain connection details).
 *
 * @param timeoutMs - Maximum duration before the database is deemed unreachable.
 * @returns `"ok"` or `"unreachable"`.
 */
export async function checkDatabase(timeoutMs: number = DATABASE_PROBE_TIMEOUT_MS): Promise<DatabaseHealth> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    await Promise.race([db.$queryRaw`SELECT 1 AS ok`, timeout]);
    return "ok";
  } catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error(`[vigie] health: base de données injoignable (${kind})`);
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
