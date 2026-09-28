/**
 * Applies an enrichment file produced by the offline-bundle tool.
 *
 *   pnpm enrichment:apply --file <enrichment.json> --actor <email admin> [--dry-run]
 *
 * Only EMPTY fields are filled; divergences are listed, never applied.
 * Always run with --dry-run first (docs/offline-bundle.md).
 * Exit codes: 0 success, 2 partial success, 1 failure.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { db } from "../src/server/db";
import { EnrichmentPreconditionError, runEnrichment } from "../src/server/enrichment/run";

const USAGE = "usage : pnpm enrichment:apply --file <enrichment.json> --actor <email admin> [--dry-run]";

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2).filter((a) => a !== "--"),
      options: { file: { type: "string" }, actor: { type: "string" }, "dry-run": { type: "boolean", default: false } },
      strict: true,
    }));
  } catch (error) {
    console.error(`Erreur : ${(error as Error).message}\n${USAGE}`);
    return 1;
  }
  if (!values.file || !values.actor) {
    console.error(`Erreur : --file et --actor sont obligatoires.\n${USAGE}`);
    return 1;
  }
  console.log(values["dry-run"] ? "Simulation en cours (aucune écriture)…" : "Application de l'enrichissement…");
  try {
    const result = await runEnrichment({ filePath: values.file, actorEmail: values.actor, dryRun: values["dry-run"] });
    console.log(result.consoleSummary);
    return result.exitCode;
  } catch (error) {
    if (error instanceof EnrichmentPreconditionError) {
      console.error(`Erreur : ${error.message}`);
      return 1;
    }
    throw error;
  }
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`Erreur inattendue : ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await db.$disconnect();
}
process.exitCode = code;
