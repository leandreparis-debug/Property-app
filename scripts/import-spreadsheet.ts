/**
 * Imports the reference spreadsheet (.xlsx) into the database.
 *
 *   pnpm import:spreadsheet --file <chemin.xlsx> --actor <email admin> [--dry-run]
 *                           [--sheet <nom>] [--activity-year <aaaa>] [--force]
 *
 * Always run with --dry-run first and read the report (docs/import.md).
 * Exit codes: 0 success, 2 partial success (rejected rows), 1 failure.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { db } from "../src/server/db";
import { ImportPreconditionError, runImport } from "../src/server/import/run";
import { SpreadsheetFileError } from "../src/server/import/workbook";

const USAGE =
  "usage : pnpm import:spreadsheet --file <fichier.xlsx> --actor <email> [--dry-run] [--sheet <nom>] [--activity-year <aaaa>] [--force]";

async function confirmForce(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error("--force exige une confirmation interactive (terminal requis).");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "⚠ --force désactive la règle de préservation : les valeurs modifiées dans l'application ou par l'enrichissement seront ÉCRASÉES.\nTaper « ECRASER » pour confirmer : ",
  );
  rl.close();
  return answer.trim() === "ECRASER";
}

function progressBar(done: number, total: number): void {
  if (!process.stdout.isTTY) return;
  const width = 30;
  const filled = total === 0 ? width : Math.round((done / total) * width);
  process.stdout.write(`\r  [${"█".repeat(filled)}${"░".repeat(width - filled)}] ${done}/${total} sites`);
  if (done === total) process.stdout.write("\n");
}

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2).filter((a) => a !== "--"),
      options: {
        file: { type: "string" },
        actor: { type: "string" },
        sheet: { type: "string" },
        "activity-year": { type: "string" },
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
      },
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
  let activityYear: number | undefined;
  if (values["activity-year"] !== undefined) {
    activityYear = Number(values["activity-year"]);
    if (!Number.isInteger(activityYear) || activityYear < 2000 || activityYear > 2100) {
      console.error("Erreur : --activity-year doit être une année sur 4 chiffres.");
      return 1;
    }
  }
  if (values.force && !values["dry-run"] && !(await confirmForce())) {
    console.error("Abandon : aucune modification.");
    return 1;
  }

  console.log(values["dry-run"] ? "Simulation en cours (aucune écriture)…" : "Import en cours…");
  try {
    const result = await runImport({
      filePath: values.file,
      actorEmail: values.actor,
      sheetName: values.sheet,
      activityYear,
      dryRun: values["dry-run"],
      force: values.force,
      onProgress: progressBar,
    });
    console.log(result.consoleSummary);
    return result.exitCode;
  } catch (error) {
    if (error instanceof ImportPreconditionError || error instanceof SpreadsheetFileError) {
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
