/**
 * Drops and recreates the development database, replays every migration and
 * runs the seed. Development only: refuses to run with NODE_ENV=production and
 * asks for confirmation (skip with `--yes`).
 *
 * Usage: `pnpm db:reset [--yes]`
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("db:reset est interdit en production.");
    process.exit(1);
  }
  const database = /database=([^;]+)/i.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "(inconnue)";

  if (!process.argv.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Toutes les données de la base « ${database} » seront supprimées. Taper « ${database} » pour confirmer : `,
    );
    rl.close();
    if (answer.trim() !== database) {
      console.log("Abandon : aucune modification.");
      return;
    }
  }
  execSync("prisma migrate reset --force", { stdio: "inherit" });
  execSync("pnpm db:seed", { stdio: "inherit" });
}

await main();
