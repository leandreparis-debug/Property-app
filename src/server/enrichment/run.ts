import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseEnrichmentFile } from "@/domain/enrichment-format";
import { can } from "../auth/permissions";
import { loadPreservationIndex, findActiveUser } from "../import/state";
import { ensureStorageDir, toStorageRelative } from "../storage";
import { planEnrichment, type EnrichmentPlan } from "./plan";
import { formatEnrichmentSummary, writeEnrichmentReport, type EnrichmentSummary } from "./report";
import { loadEnrichmentState } from "./state";
import { createEnrichmentBatch, finalizeEnrichmentBatch, recordDivergences, writeSiteEnrichment } from "./writer";

/**
 * Orchestration of `pnpm enrichment:apply` (used by the CLI and the tests):
 * read → validate → load state → plan → (write) → report.
 */

/** Raised before anything is written (actor refused, invalid file…). */
export class EnrichmentPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentPreconditionError";
  }
}

/** Options of {@link runEnrichment}. */
export interface EnrichmentOptions {
  filePath: string;
  actorEmail: string;
  dryRun?: boolean;
  now?: Date;
}

/** Result of {@link runEnrichment}. */
export interface EnrichmentResult {
  summary: EnrichmentSummary;
  plan: EnrichmentPlan;
  batchId: string | null;
  reportDir: string;
  exitCode: 0 | 1 | 2;
  consoleSummary: string;
}

const timestamp = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");

/**
 * Applies (or simulates with `dryRun`) an `enrichment.json` file.
 * @throws {EnrichmentPreconditionError} Actor not allowed, unreadable or invalid file.
 */
export async function runEnrichment(options: EnrichmentOptions): Promise<EnrichmentResult> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;

  const actor = await findActiveUser(options.actorEmail);
  if (!actor || !actor.isActive || !can(actor.role, "enrichment:apply")) {
    throw new EnrichmentPreconditionError(
      `Enrichissement refusé : « ${options.actorEmail} » ne correspond à aucun administrateur actif (permission enrichment:apply requise).`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(options.filePath);
  } catch {
    throw new EnrichmentPreconditionError(`Fichier illisible : ${options.filePath}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new EnrichmentPreconditionError(`${basename(options.filePath)} n'est pas un fichier JSON.`);
  }
  let file;
  try {
    file = parseEnrichmentFile(json);
  } catch (error) {
    throw new EnrichmentPreconditionError((error as Error).message);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const states = await loadEnrichmentState(file.sites.map((s) => s.code));
  const preservation = await loadPreservationIndex([...states.values()].map((s) => s.id));
  const plan = planEnrichment(file, states, preservation);

  const summary: EnrichmentSummary = {
    mode: dryRun ? "simulation" : "application",
    status: "SUCCEEDED",
    file: basename(options.filePath),
    sha256,
    generatedAt: file.generatedAt,
    generator: file.generator,
    batchId: null,
    sitesInFile: file.sites.length,
    sitesWritten: 0,
    sitesFailed: [],
    unknownCodes: plan.unknownCodes,
    archivedCodes: plan.archivedCodes,
    counts: plan.counts,
    checks: plan.checks.length,
    durationMs: 0,
  };

  let batchId: string | null = null;
  if (dryRun) {
    summary.sitesWritten = plan.writes.length;
  } else {
    batchId = await createEnrichmentBatch({ actorId: actor.id, fileName: summary.file, sha256 });
    summary.batchId = batchId;
    for (const writes of plan.writes) {
      try {
        await writeSiteEnrichment(writes, { actorId: actor.id, batchId });
        summary.sitesWritten++;
      } catch (error) {
        summary.sitesFailed.push({ code: writes.code, message: error instanceof Error ? error.message.split("\n")[0]!.slice(0, 300) : String(error) });
      }
    }
    if (summary.sitesFailed.length > 0) summary.status = summary.sitesWritten > 0 ? "PARTIAL" : "FAILED";
    const siteIdByCode = new Map([...states.values()].map((s) => [s.code, s.id]));
    summary.divergences = await recordDivergences(plan.lines, siteIdByCode, { actorId: actor.id, batchId });
  }

  const reportDir = await ensureStorageDir("enrichment", batchId ?? `dry-run-${timestamp(now)}`);
  summary.durationMs = Date.now() - started;
  await writeEnrichmentReport(reportDir, plan, summary);
  if (batchId) await finalizeEnrichmentBatch(batchId, { status: summary.status, stats: summary, reportPath: toStorageRelative(reportDir) });

  return {
    summary,
    plan,
    batchId,
    reportDir,
    exitCode: summary.status === "SUCCEEDED" ? 0 : summary.status === "PARTIAL" ? 2 : 1,
    consoleSummary: formatEnrichmentSummary(summary, reportDir),
  };
}
