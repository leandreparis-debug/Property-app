/**
 * Generates samples/vigie-sample.xlsx, the synthetic spreadsheet (fictitious
 * data only) used by the import tests and to try the import command.
 *
 * Usage: pnpm sample:build   (or: pnpm tsx scripts/build-sample-spreadsheet.ts)
 */
import { mkdir } from "node:fs/promises";
import { buildSampleWorkbook, SAMPLE_FACTS } from "./lib/sample-spreadsheet";

const output = "samples/vigie-sample.xlsx";
await mkdir("samples", { recursive: true });
await buildSampleWorkbook().xlsx.writeFile(output);
console.log(`Fichier de test généré : ${output} (${SAMPLE_FACTS.rows} lignes de données, ${SAMPLE_FACTS.sites} sites fictifs).`);
