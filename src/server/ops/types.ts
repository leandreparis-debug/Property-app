import type { JobTrigger } from "@/domain/enums";

/**
 * Vocabulary of the operations jobs (step 11). A job is a named function run
 * by the scheduler, from the administration screen or from the CLI; every
 * execution is recorded in `job_runs`.
 */

/** What a job receives. */
export interface JobContext {
  /** Id of the `job_runs` row (also the `batchId` of the audited writes). */
  runId: string;
  trigger: JobTrigger;
  /** User who launched a manual or CLI run; `null` for the scheduler. */
  actorId: string | null;
  /** Start instant of the run. */
  now: Date;
  /** Business date of the run (Europe/Paris calendar day, 00:00 UTC). */
  businessDate: Date;
}

/** JSON-serialisable summary returned by a job (shown on the operations screen). */
export type JobSummary = Record<string, unknown>;

/** Definition of a job. */
export interface JobDefinition {
  /** Stable name (CLI argument, `job_runs.job`, ≤ 40 characters). */
  name: string;
  /** French label. */
  labelFr: string;
  /** One-line French description. */
  descriptionFr: string;
  /** Run every day at `OPS_DAILY_AT` by the scheduler. */
  daily: boolean;
  /**
   * The work. Audited writes run inside `runWithAuditContext({ actorId,
   * source: "system", batchId: runId })`, opened by `runJob`.
   * Throwing marks the run as failed; it never stops the process.
   */
  run(context: JobContext): Promise<JobSummary>;
}
