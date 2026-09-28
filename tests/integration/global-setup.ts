import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-db";

/**
 * Recreates the `vigie_test` database from the migrations before the
 * integration suite (`prisma migrate reset` creates it if it does not exist).
 */
export default function setup(): void {
  const url = testDatabaseUrl();
  execSync("pnpm exec prisma migrate reset --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
