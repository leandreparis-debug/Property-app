import "server-only";
import { businessDateOf, CATCHUP_DELAY_MS, isCatchupDue, nextDailyRun, type DailyTime } from "@/domain/ops/schedule";
import { JOBS } from "./jobs";
import { hasScheduledSuccess, runJob } from "./run";
import type { JobDefinition } from "./types";

/**
 * Hand-written scheduler of the daily jobs (no scheduling library).
 *
 * - Started once per process from `instrumentation-node.ts` (Node runtime
 *   only, never during `next build`); the instance lives on `globalThis`, so
 *   hot reloading never starts a second one.
 * - One timer at a time, armed for the next occurrence of `OPS_DAILY_AT`
 *   (Europe/Paris, daylight-saving aware); the daily jobs then run one after
 *   the other, each in its own `runJob` (a failure never stops the others).
 * - Catch-up: at start-up, when today's time is past and a daily job has no
 *   successful run for today, the daily jobs run 2 minutes later
 *   (`catchup` trigger; `runJob` skips those already done).
 */

/** Options of {@link startScheduler}. */
export interface SchedulerOptions {
  at: DailyTime;
  /** Clock (tests). */
  now?: () => Date;
  /** Registry (tests). */
  jobs?: readonly JobDefinition[];
  /** Delay before the catch-up run (tests). */
  catchupDelayMs?: number;
}

/** A running scheduler. */
export interface OpsScheduler {
  /** Next planned occurrence. */
  readonly nextRunAt: Date | null;
  /** Stops the timers. */
  stop(): void;
}

const KEY = Symbol.for("vigie.ops.scheduler");
const globalStore = globalThis as typeof globalThis & { [KEY]?: OpsScheduler };

/** Longest delay accepted by `setTimeout`. */
const MAX_TIMEOUT_MS = 2_147_483_647;

async function runDailyJobs(jobs: readonly JobDefinition[], trigger: "scheduled" | "catchup"): Promise<void> {
  for (const job of jobs.filter((j) => j.daily)) {
    try {
      const outcome = await runJob(job.name, trigger, { jobs });
      if (outcome.status !== "skipped") console.info(`[vigie] tâche ${job.name} (${trigger}) : ${outcome.status === "success" ? "réussie" : `échec — ${outcome.error}`}.`);
    } catch (error) {
      // Already running, database down…: logged, the next jobs still run.
      console.warn(`[vigie] tâche ${job.name} (${trigger}) non lancée : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Starts the scheduler (idempotent: returns the running instance if any).
 * @param options - Time of day, clock and registry.
 */
export function startScheduler(options: SchedulerOptions): OpsScheduler {
  const existing = globalStore[KEY];
  if (existing) return existing;

  const now = options.now ?? (() => new Date());
  const jobs = options.jobs ?? JOBS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let catchupTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let nextRunAt: Date | null = null;

  const arm = () => {
    if (stopped) return;
    const target = nextDailyRun(now(), options.at);
    nextRunAt = target;
    const fire = async () => {
      if (stopped) return;
      // A timer may fire a little early: wait for the real target.
      const delay = target.getTime() - now().getTime();
      if (delay > 0) {
        timer = setTimeout(() => void fire(), Math.min(delay, MAX_TIMEOUT_MS));
        timer.unref?.();
        return;
      }
      await runDailyJobs(jobs, "scheduled");
      arm();
    };
    timer = setTimeout(() => void fire(), Math.min(Math.max(0, target.getTime() - now().getTime()), MAX_TIMEOUT_MS));
    timer.unref?.();
  };

  const checkCatchup = async () => {
    try {
      const today = businessDateOf(now());
      for (const job of jobs.filter((j) => j.daily)) {
        if (isCatchupDue(now(), options.at, await hasScheduledSuccess(job.name, today))) {
          console.info(`[vigie] rattrapage des tâches quotidiennes dans ${Math.round((options.catchupDelayMs ?? CATCHUP_DELAY_MS) / 1000)} s.`);
          catchupTimer = setTimeout(() => void runDailyJobs(jobs, "catchup"), options.catchupDelayMs ?? CATCHUP_DELAY_MS);
          catchupTimer.unref?.();
          return;
        }
      }
    } catch (error) {
      console.warn(`[vigie] rattrapage non vérifié (${error instanceof Error ? error.name : "erreur"}).`);
    }
  };

  const scheduler: OpsScheduler = {
    get nextRunAt() {
      return nextRunAt;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (catchupTimer) clearTimeout(catchupTimer);
      if (globalStore[KEY] === scheduler) delete globalStore[KEY];
    },
  };
  globalStore[KEY] = scheduler;
  arm();
  void checkCatchup();
  console.info(`[vigie] planificateur démarré : prochaine exécution ${scheduler.nextRunAt?.toISOString() ?? "—"}.`);
  return scheduler;
}

/** The running scheduler of this process, if any. */
export function currentScheduler(): OpsScheduler | null {
  return globalStore[KEY] ?? null;
}
