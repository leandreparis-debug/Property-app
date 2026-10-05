import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db";
import { resolveStoragePath } from "../storage";
import type { ImportSummary } from "./report";

/**
 * History of the spreadsheet imports (step 11, `/admin/imports`): real
 * imports from `import_batches`, simulations from their report folders
 * `STORAGE_ROOT/imports/dry-run-<horodatage>/` (a simulation writes nothing
 * in the database). Reports are downloadable file by file.
 */

/** Files of an import report. */
export const IMPORT_REPORT_FILES = ["report.csv", "changes.csv", "summary.json"] as const;

/** Counters shown in the history. */
export type ImportCounters = Pick<
  ImportSummary,
  "rowsRead" | "sitesCreated" | "sitesUpdated" | "sitesUnchanged" | "rowsRejected" | "fieldChanges" | "preservedFields" | "errors" | "warnings"
>;

/** One run of the import. */
export interface ImportRun {
  /** Batch id (real import) or report folder name (simulation). */
  id: string;
  mode: "import" | "simulation";
  startedAt: Date;
  actor: string | null;
  file: string | null;
  status: string;
  counters: Partial<ImportCounters> | null;
  /** Report files present on disk. */
  files: string[];
}

const DRY_RUN = /^dry-run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
const BATCH_ID = /^[A-Za-z0-9_-]{1,30}$/;

async function readSummary(dir: string): Promise<ImportSummary | null> {
  try {
    return JSON.parse(await readFile(join(dir, "summary.json"), "utf8")) as ImportSummary;
  } catch {
    return null;
  }
}

async function presentFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of IMPORT_REPORT_FILES) {
    try {
      if ((await stat(join(dir, name))).isFile()) files.push(name);
    } catch {
      // Missing file.
    }
  }
  return files;
}

function counters(summary: ImportSummary | null): Partial<ImportCounters> | null {
  if (!summary) return null;
  const { rowsRead, sitesCreated, sitesUpdated, sitesUnchanged, rowsRejected, fieldChanges, preservedFields, errors, warnings } = summary;
  return { rowsRead, sitesCreated, sitesUpdated, sitesUnchanged, rowsRejected, fieldChanges, preservedFields, errors, warnings };
}

/** Absolute report folder of a run, or `null` when the id is not a run. */
async function reportDir(id: string): Promise<string | null> {
  if (DRY_RUN.test(id)) return resolveStoragePath("imports", id);
  if (!BATCH_ID.test(id)) return null;
  const batch = await db.importBatch.findUnique({ where: { id }, select: { kind: true, reportPath: true } });
  if (!batch || batch.kind !== "SPREADSHEET" || !batch.reportPath) return null;
  return resolveStoragePath(...batch.reportPath.split(/[\\/]+/).filter(Boolean));
}

/**
 * Real imports and simulations, most recent first.
 * @param limit - Maximum number of runs.
 */
export async function listImportRuns(limit = 100): Promise<ImportRun[]> {
  const batches = await db.importBatch.findMany({
    where: { kind: "SPREADSHEET" },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true, name: true } } },
  });
  const runs: ImportRun[] = [];
  for (const b of batches) {
    let summary: ImportSummary | null = null;
    try {
      summary = b.statsJson ? (JSON.parse(b.statsJson) as ImportSummary) : null;
    } catch {
      summary = null;
    }
    const dir = b.reportPath ? resolveStoragePath(...b.reportPath.split(/[\\/]+/).filter(Boolean)) : null;
    runs.push({
      id: b.id,
      mode: "import",
      startedAt: b.startedAt,
      actor: b.actor ? (b.actor.name ?? b.actor.email) : (summary?.actor ?? null),
      file: b.fileName,
      status: b.status,
      counters: counters(summary),
      files: dir ? await presentFiles(dir) : [],
    });
  }

  let names: string[] = [];
  try {
    names = await readdir(resolveStoragePath("imports"));
  } catch {
    // No report yet.
  }
  for (const name of names.filter((n) => DRY_RUN.test(n))) {
    const dir = resolveStoragePath("imports", name);
    const summary = await readSummary(dir);
    const [date, time] = name.slice("dry-run-".length).split("T") as [string, string];
    runs.push({
      id: name,
      mode: "simulation",
      startedAt: summary?.startedAt ? new Date(summary.startedAt) : new Date(`${date}T${time.replace(/-/g, ":")}Z`),
      actor: summary?.actor ?? null,
      file: summary?.file ?? null,
      status: summary?.status ?? "—",
      counters: counters(summary),
      files: await presentFiles(dir),
    });
  }
  return runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit);
}

/** Whether at least one REAL import succeeded. */
export async function hasSuccessfulImport(): Promise<boolean> {
  return (await db.importBatch.count({ where: { kind: "SPREADSHEET", status: "SUCCEEDED" } })) > 0;
}

/**
 * Absolute path of a report file, or `null` (unknown run or file name).
 * @param id - Batch id or simulation folder name.
 * @param file - One of {@link IMPORT_REPORT_FILES}.
 */
export async function importReportPath(id: string, file: string): Promise<string | null> {
  if (!(IMPORT_REPORT_FILES as readonly string[]).includes(file)) return null;
  const dir = await reportDir(id);
  return dir ? join(dir, file) : null;
}
