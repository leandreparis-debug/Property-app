import "dotenv/config";
import { resolve } from "node:path";

/**
 * Environment of the end-to-end suite: its OWN database (`vigie_e2e`, reset
 * by the global setup) and its OWN storage root. The development database
 * `vigie` is never touched by the tests. A database whose name does not end
 * with `_e2e` is refused, so the reset can never hit another database.
 */

/** Port of the tested production server (distinct from `pnpm dev` on 3000). */
export const E2E_PORT = 3210;

/** Storage root of the suite (git-ignored, emptied by the global setup). */
export const E2E_STORAGE_ROOT = resolve(".e2e-storage");

/** Connection string of `vigie_e2e` (same server as DATABASE_URL, or E2E_DATABASE_URL). */
export function e2eDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!explicit && !base) throw new Error("DATABASE_URL (ou E2E_DATABASE_URL) manquante : voir .env.example.");
  const url = explicit ?? base!.replace(/database=[^;]+/i, "database=vigie_e2e");
  const name = /database=([^;]+)/i.exec(url)?.[1];
  if (!name?.endsWith("_e2e")) throw new Error(`Base e2e refusée (« ${name ?? "?"} ») : son nom doit se terminer par « _e2e ».`);
  return url;
}

/** Variables given to every process of the suite (server, scripts). */
export function e2eEnv(port = E2E_PORT): Record<string, string> {
  // Closed network: the offline basemap (never the IGN online tiles). No
  // scheduler: the operations jobs only run when a test launches them.
  return { DATABASE_URL: e2eDatabaseUrl(), STORAGE_ROOT: E2E_STORAGE_ROOT, APP_URL: `http://localhost:${port}`, PORT: String(port), MAP_BASEMAP: "offline", OPS_SCHEDULER: "off" };
}
