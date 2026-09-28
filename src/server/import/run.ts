import "server-only";
import { can } from "../auth/permissions";
import { ensureStorageDir, toStorageRelative } from "../storage";
import { runRowChecks, rejectDuplicateCodes, type AreaBasis } from "./checks";
import { detectHeaders, HEADER_SEARCH_ROWS } from "./headers";
import { FIXED_HEADERS, REFERENCE_COLUMNS } from "./mapping";
import { normalizeRow } from "./normalize";
import { planSite, type ChangeLine, type SitePlan } from "./plan";
import { formatConsoleSummary, likelyAreaBasis, waterStatistics, writeReportFiles, type ImportSummary } from "./report";
import { findActiveUser, loadImportState } from "./state";
import type { ImportIssue, SiteDraft } from "./types";
import { leadingRows, readSpreadsheet } from "./workbook";
import { createImportBatch, finalizeImportBatch, writeSitePlan } from "./writer";

/**
 * Orchestration of a spreadsheet import (used by the CLI and the tests):
 * read → headers → normalise → check → load state → plan → (write) → report.
 */

/** Options of {@link runImport}. */
export interface ImportOptions {
  filePath: string;
  /** Email of an active admin: author of every audited change. */
  actorEmail: string;
  sheetName?: string;
  /** Year of the activity columns without year (default: current year − 1). */
  activityYear?: number;
  /** Analyse and compare only: no write at all (not even ImportBatch). */
  dryRun?: boolean;
  /** Disable the preservation rule (the CLI asks for confirmation). */
  force?: boolean;
  /** Reference instant (tests). */
  now?: Date;
  /** Progress callback (sites processed / total). */
  onProgress?: (done: number, total: number) => void;
  /** Test hook, passed to the writer (called before each site commit). */
  faultInjector?: (code: string) => void;
  /** Sites written in parallel (independent transactions). Default 4. */
  concurrency?: number;
}

/** SQL Server deadlock victim (error 1205): the transaction can be replayed. */
function isDeadlock(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${String((error as { code?: unknown }).code ?? "")}` : "";
  return /deadlock|1205/i.test(text);
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function forEachLimit<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/** Result of {@link runImport}. */
export interface ImportResult {
  summary: ImportSummary;
  /** 0 success, 2 partial success, 1 failure. */
  exitCode: 0 | 1 | 2;
  batchId: string | null;
  /** Absolute path of the report folder. */
  reportDir: string;
  issues: ImportIssue[];
  changes: ChangeLine[];
  /** Console summary (French). */
  consoleSummary: string;
}

/** Raised before anything is written (actor refused, unreadable file…). */
export class ImportPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportPreconditionError";
  }
}

const timestamp = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");

/**
 * Runs an import (or a simulation with `dryRun`).
 * @throws {ImportPreconditionError} Actor not allowed.
 * @throws {SpreadsheetFileError} File refused (format, size, signature, sheet).
 */
export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const activityYear = options.activityYear ?? now.getFullYear() - 1;
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  const actor = await findActiveUser(options.actorEmail);
  if (!actor || !actor.isActive || !can(actor.role, "import:run")) {
    throw new ImportPreconditionError(
      `Import refusé : « ${options.actorEmail} » ne correspond à aucun administrateur actif (permission import:run requise).`,
    );
  }

  const content = await readSpreadsheet(options.filePath, options.sheetName);
  const issues: ImportIssue[] = [...content.issues];
  const headers = detectHeaders(leadingRows(content.rows, HEADER_SEARCH_ROWS), FIXED_HEADERS);
  for (const i of headers.issues) {
    issues.push({ row: null, code: null, column: i.column ?? null, severity: i.severity, kind: i.kind, original: null, retained: null, message: i.message });
  }

  const summary: ImportSummary = {
    mode: dryRun ? "simulation" : "import",
    status: "SUCCEEDED",
    file: content.fileName,
    sheet: content.sheetName,
    sha256: content.sha256,
    batchId: null,
    activityYear,
    force,
    rowsRead: 0,
    sitesCreated: 0,
    sitesUpdated: 0,
    sitesUnchanged: 0,
    rowsRejected: 0,
    fieldChanges: 0,
    preservedFields: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    warningsByKind: {},
    unknownColumns: headers.issues.filter((i) => i.kind === "unknown_column").map((i) => i.column ?? ""),
    missingColumns: headers.issues.filter((i) => i.kind === "missing_column").map((i) => i.column ?? ""),
    missingFromFile: [],
    references: {},
    sitesWithSeveralQlikKeys: 0,
    perSqmArea: likelyAreaBasis([]),
    water: waterStatistics([]),
    durationMs: 0,
  };

  const batchId = dryRun ? null : await createImportBatch({ actorId: actor.id, fileName: content.fileName, sha256: content.sha256 });
  summary.batchId = batchId;
  const reportDir = await ensureStorageDir("imports", batchId ?? `dry-run-${timestamp(now)}`);
  const changes: ChangeLine[] = [];

  const finish = async (status: ImportSummary["status"]): Promise<ImportResult> => {
    summary.status = status;
    for (const i of issues) {
      if (i.severity === "error") summary.errors++;
      else if (i.severity === "warning") {
        summary.warnings++;
        summary.warningsByKind[i.kind] = (summary.warningsByKind[i.kind] ?? 0) + 1;
      } else summary.infos++;
    }
    summary.durationMs = Date.now() - started;
    await writeReportFiles(reportDir, { issues, changes, summary });
    if (batchId) await finalizeImportBatch(batchId, { status, stats: summary, reportPath: toStorageRelative(reportDir) });
    return {
      summary,
      exitCode: status === "SUCCEEDED" ? 0 : status === "PARTIAL" ? 2 : 1,
      batchId,
      reportDir,
      issues,
      changes,
      consoleSummary: formatConsoleSummary(summary, reportDir),
    };
  };

  try {
    if (headers.fatal || headers.headerRow === null) return await finish("FAILED");

    // ── Normalise every data row ───────────────────────────────────────────
    const drafts: SiteDraft[] = [];
    for (const row of content.rows) {
      if (row.rowNumber <= headers.headerRow) continue;
      const normalized = normalizeRow(row, headers.columns, { activityYear, now });
      if (normalized.empty) continue;
      summary.rowsRead++;
      issues.push(...normalized.issues);
      if (normalized.draft) drafts.push(normalized.draft);
      else summary.rowsRejected++;
    }
    if (drafts.some((d) => d.entities.site.size > 0 && [...d.metrics.values()].some((m) => ["HEADCOUNT_FTE", "MERCHANDISE_REVENUE", "PARCELS"].includes(m.metric)))) {
      issues.push({
        row: null,
        code: null,
        column: "ETP MOYEN / CA MARCHANDISE / NOMBRE DE COLIS ANNUEL",
        severity: "info",
        kind: "activity_year",
        original: null,
        retained: String(activityYear),
        message: `Colonnes d'activité sans année rattachées à l'année ${activityYear} (option --activity-year).`,
      });
    }

    const { kept, issues: duplicateIssues, rejected } = rejectDuplicateCodes(drafts);
    issues.push(...duplicateIssues);
    summary.rowsRejected += rejected.length;

    // ── Consistency checks and statistics ──────────────────────────────────
    const perSqmMatches: AreaBasis[][] = [];
    const waterRatios: number[] = [];
    for (const draft of kept) {
      const checks = runRowChecks(draft);
      issues.push(...checks.issues);
      perSqmMatches.push(...checks.perSqm.matches);
      waterRatios.push(...checks.water.ratios);
      for (const ref of draft.references) {
        const slot = (summary.references[ref.column] ??= {});
        slot[ref.kind] = (slot[ref.kind] ?? 0) + 1;
      }
      if ((draft.externalIds.get("QLIK_SENSE")?.length ?? 0) > 1) summary.sitesWithSeveralQlikKeys++;
    }
    for (const column of REFERENCE_COLUMNS) {
      if (!headers.columns.some((c) => c.normalized === column)) delete summary.references[column];
    }
    summary.perSqmArea = likelyAreaBasis(perSqmMatches);
    summary.water = waterStatistics(waterRatios);

    // ── Compare with the database and plan ─────────────────────────────────
    const state = await loadImportState(kept.map((d) => d.code));
    summary.missingFromFile = state.missingFromFile;
    const context = { force, preservation: state.preservation, externalOwners: state.externalOwners };
    const plans: SitePlan[] = kept.map((draft) => planSite(draft, state.sites.get(draft.code.toUpperCase()) ?? null, context));

    // ── Apply (one transaction per site, a few sites in parallel) or simulate ──
    let done = 0;
    const applied: SitePlan[] = [];
    const write = async (plan: SitePlan) => {
      const context = { actorId: actor.id, batchId: batchId!, faultInjector: options.faultInjector };
      try {
        await writeSitePlan(plan, context);
      } catch (error) {
        if (!isDeadlock(error)) throw error;
        await writeSitePlan(plan, context); // deadlock victim: replay once
      }
    };
    await forEachLimit(plans, dryRun ? 1 : (options.concurrency ?? 4), async (plan) => {
      if (!dryRun) {
        try {
          await write(plan);
        } catch (error) {
          summary.rowsRejected++;
          issues.push({
            row: plan.row,
            code: plan.code,
            column: null,
            severity: "error",
            kind: "site_write_failed",
            original: null,
            retained: null,
            message: `Échec de l'écriture du site : aucune modification enregistrée pour ce site (${error instanceof Error ? error.message.split("\n")[0]!.slice(0, 200) : "erreur inconnue"}).`,
          });
          options.onProgress?.(++done, plans.length);
          return;
        }
      }
      applied.push(plan);
      options.onProgress?.(++done, plans.length);
    });

    for (const plan of applied.sort((a, b) => a.row - b.row)) {
      issues.push(...plan.issues);
      for (const p of plan.preserved) {
        issues.push({
          row: p.row,
          code: p.code,
          column: `${p.entity} · ${p.field}`,
          severity: "info",
          kind: "preserved_field",
          original: p.after,
          retained: p.before,
          message: "Champ modifié dans l'application (ou par l'enrichissement) : valeur actuelle préservée.",
        });
      }
      changes.push(...plan.changes, ...plan.preserved);
      summary.fieldChanges += plan.changes.length;
      summary.preservedFields += plan.preserved.length;
      if (plan.action === "create") summary.sitesCreated++;
      else if (plan.action === "update") summary.sitesUpdated++;
      else summary.sitesUnchanged++;
    }

    return await finish(summary.rowsRejected > 0 ? "PARTIAL" : "SUCCEEDED");
  } catch (error) {
    issues.push({
      row: null,
      code: null,
      column: null,
      severity: "error",
      kind: "import_failed",
      original: null,
      retained: null,
      message: `Import interrompu : ${error instanceof Error ? error.message.split("\n")[0] : "erreur inconnue"}.`,
    });
    return await finish("FAILED");
  }
}
