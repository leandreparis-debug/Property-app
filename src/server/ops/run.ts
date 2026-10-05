import "server-only";
import type { JobTrigger } from "@/domain/enums";
import { businessDateOf, STALE_RUN_MS } from "@/domain/ops/schedule";
import { runWithAuditContext } from "../audit/context";
import { db } from "../db";
import { findJob, JOBS } from "./jobs";
import type { JobDefinition, JobSummary } from "./types";

/**
 * Execution of the operations jobs: one `job_runs` row per run, mutual
 * exclusion guaranteed BY THE DATABASE (filtered unique index
 * `job_runs_one_running`), stale runs failed after 2 hours, at most one
 * successful scheduled or catch-up run per job and business date.
 */

/** Unknown job name (CLI typo, tampered form). */
export class UnknownJobError extends Error {
  constructor(name: string) {
    super(`Tâche inconnue : « ${name} ».`);
    this.name = "UnknownJobError";
  }
}

/** Another execution of the same job is in progress. */
export class JobAlreadyRunningError extends Error {
  constructor(label: string) {
    super(`La tâche « ${label} » est déjà en cours d'exécution : un seul lancement à la fois.`);
    this.name = "JobAlreadyRunningError";
  }
}

/** Outcome of {@link runJob}. */
export type JobRunOutcome =
  | { status: "success" | "failed"; runId: string; summary: JobSummary | null; error: string | null; durationMs: number }
  | { status: "skipped"; runId: null; reason: string };

/** Options of {@link runJob}. */
export interface RunJobOptions {
  /** User launching a manual or CLI run. */
  actorId?: string | null;
  /** Current instant (tests). */
  now?: Date;
  /** Registry (tests). */
  jobs?: readonly JobDefinition[];
}

/** Message stored on a run interrupted while running. */
export const STALE_RUN_MESSAGE = "Interrompue : toujours « en cours » après 2 heures (arrêt du serveur ?).";

const ERROR_MAX = 2000;

/** JSON with BigInt support (counts read from the database). */
function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

/** Whether a Prisma / SQL Server error is a unique-index violation. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || /\b(2601|2627)\b|duplicate key|unique/i.test(error.message);
}

/**
 * Marks as failed the runs of a job still `running` after {@link STALE_RUN_MS}.
 * @returns Number of runs failed.
 */
export async function failStaleRuns(job: string, now: Date = new Date()): Promise<number> {
  const { count } = await db.jobRun.updateMany({
    where: { job, status: "running", startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
    data: { status: "failed", finishedAt: now, error: STALE_RUN_MESSAGE },
  });
  return count;
}

/**
 * Whether a successful scheduled or catch-up run exists for a job and a business date.
 */
export async function hasScheduledSuccess(job: string, businessDate: Date): Promise<boolean> {
  const run = await db.jobRun.findFirst({
    where: { job, businessDate, status: "success", trigger: { in: ["scheduled", "catchup"] } },
    select: { id: true },
  });
  return run !== null;
}

/**
 * Runs a job and records the execution.
 *
 * - Unknown job: {@link UnknownJobError}.
 * - Another run of the same job in progress: {@link JobAlreadyRunningError}
 *   (the second `INSERT` hits the filtered unique index; runs older than 2 h
 *   are failed first).
 * - `scheduled` / `catchup` when a successful scheduled or catch-up run
 *   already exists for the business date: skipped, nothing recorded.
 * - A job that throws is recorded as failed and its message returned: this
 *   function never throws because of the job itself.
 *
 * The job runs inside `runWithAuditContext({ actorId, source: "system",
 * batchId: runId })`.
 *
 * @param name - Job name.
 * @param trigger - What started the run.
 * @param options - Acting user, clock, registry.
 */
export async function runJob(name: string, trigger: JobTrigger, options: RunJobOptions = {}): Promise<JobRunOutcome> {
  const job = findJob(name, options.jobs ?? JOBS);
  if (!job) throw new UnknownJobError(name);
  const now = options.now ?? new Date();
  const businessDate = businessDateOf(now);
  const actorId = options.actorId ?? null;

  await failStaleRuns(job.name, now);
  if ((trigger === "scheduled" || trigger === "catchup") && (await hasScheduledSuccess(job.name, businessDate))) {
    return { status: "skipped", runId: null, reason: "Déjà exécutée avec succès pour cette date." };
  }

  let runId: string;
  try {
    const run = await db.jobRun.create({
      data: { job: job.name, trigger, status: "running", businessDate, startedAt: now, triggeredById: actorId },
      select: { id: true },
    });
    runId = run.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new JobAlreadyRunningError(job.labelFr);
    throw error;
  }

  const started = Date.now();
  let summary: JobSummary | null = null;
  let message: string | null = null;
  try {
    summary = await runWithAuditContext({ actorId, source: "system", batchId: runId }, () =>
      job.run({ runId, trigger, actorId, now, businessDate }),
    );
  } catch (error) {
    message = (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, ERROR_MAX) || "Erreur inconnue.";
    console.error(`[vigie] tâche ${job.name} (${runId}) en échec : ${message}`);
  }

  const status = message === null ? "success" : "failed";
  try {
    await db.jobRun.update({
      where: { id: runId },
      data: { status, finishedAt: new Date(), summaryJson: summary ? toJson(summary) : null, error: message },
    });
  } catch (error) {
    // E.g. a scheduled success already recorded for the date by another process.
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    await db.jobRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), summaryJson: summary ? toJson(summary) : null, error: `Résultat non enregistré : ${detail}`.slice(0, ERROR_MAX) },
    });
    return { status: "failed", runId, summary, error: detail ?? null, durationMs: Date.now() - started };
  }
  return { status, runId, summary, error: message, durationMs: Date.now() - started };
}
