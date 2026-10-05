/**
 * Operations jobs from the command line.
 *
 *   pnpm ops:list                              jobs, last run, next occurrence
 *   pnpm ops:run <tâche> [--actor <email>]     runs a job now (trigger « cli »)
 *
 * `--actor` (optional): email of an active administrator (permission
 * settings:manage), recorded as the author of the run and of its audited
 * writes. Without it, the run is attributed to the system (source `system`).
 * Exit codes: 0 success, 1 failure (job failed, already running, unknown).
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { JobStatus, JobTrigger } from "../src/domain/enums";
import { nextDailyRun, parseDailyTime } from "../src/domain/ops/schedule";
import { getEnv } from "../src/lib/env";
import { can } from "../src/server/auth/permissions";
import { db } from "../src/server/db";
import { findActiveUser } from "../src/server/import/state";
import { JOBS } from "../src/server/ops/jobs";
import { runJob } from "../src/server/ops/run";

const USAGE = "usage : pnpm ops:list | pnpm ops:run <tâche> [--actor <email>]";

const dateTime = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d) : "—";

async function list(): Promise<number> {
  const at = parseDailyTime(getEnv().OPS_DAILY_AT)!;
  const next = nextDailyRun(new Date(), at);
  for (const job of JOBS) {
    const last = await db.jobRun.findFirst({ where: { job: job.name }, orderBy: { startedAt: "desc" } });
    console.log(`${job.name.padEnd(18)} ${job.labelFr}`);
    console.log(`${"".padEnd(18)} ${job.descriptionFr}`);
    console.log(
      `${"".padEnd(18)} dernière exécution : ${last ? `${dateTime(last.startedAt)} — ${JobStatus.is(last.status) ? JobStatus.label(last.status) : last.status} (${JobTrigger.is(last.trigger) ? JobTrigger.label(last.trigger) : last.trigger})` : "aucune"}`,
    );
    console.log(`${"".padEnd(18)} prochaine échéance : ${job.daily ? (getEnv().OPS_SCHEDULER === "on" ? dateTime(next) : `${dateTime(next)} (planificateur désactivé : OPS_SCHEDULER=off)`) : "à la demande"}\n`);
  }
  return 0;
}

async function run(name: string | undefined, actorEmail: string | undefined): Promise<number> {
  if (!name) {
    console.error(`Erreur : nom de tâche manquant.\n${USAGE}\nTâches : ${JOBS.map((j) => j.name).join(", ")}`);
    return 1;
  }
  let actorId: string | null = null;
  if (actorEmail) {
    const actor = await findActiveUser(actorEmail);
    if (!actor || !actor.isActive || !can(actor.role, "settings:manage")) {
      console.error(`Erreur : « ${actorEmail} » ne correspond à aucun administrateur actif (permission settings:manage requise).`);
      return 1;
    }
    actorId = actor.id;
  }
  console.log(`Exécution de « ${name} »…`);
  const outcome = await runJob(name, "cli", { actorId });
  if (outcome.status === "skipped") {
    console.log(outcome.reason);
    return 0;
  }
  console.log(`Statut : ${JobStatus.label(outcome.status)} (${(outcome.durationMs / 1000).toFixed(1)} s) — exécution ${outcome.runId}`);
  if (outcome.summary) console.log(JSON.stringify(outcome.summary, null, 2));
  if (outcome.error) console.error(`Erreur : ${outcome.error}`);
  return outcome.status === "success" ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
  if (command === "list") return list();
  if (command === "run") {
    const { values, positionals } = parseArgs({ args: rest, options: { actor: { type: "string" } }, allowPositionals: true, strict: true });
    return run(positionals[0], values.actor);
  }
  console.error(USAGE);
  return 1;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await db.$disconnect();
}
process.exitCode = code;
