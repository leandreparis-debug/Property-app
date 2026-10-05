import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuditContext } from "@/server/audit/context";
import { failStaleRuns, JobAlreadyRunningError, runJob, STALE_RUN_MESSAGE, UnknownJobError } from "@/server/ops/run";
import type { JobDefinition } from "@/server/ops/types";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

/** A job that waits until released, to hold the « running » slot. */
function gatedJob(name = "test-gated") {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => (started = resolve));
  const job: JobDefinition = {
    name,
    labelFr: "Tâche de test",
    descriptionFr: "Attend d'être libérée.",
    daily: true,
    async run() {
      started();
      await gate;
      return { ok: true };
    },
  };
  return { job, release, started: startedPromise };
}

const failing: JobDefinition = {
  name: "test-failing",
  labelFr: "Tâche en échec",
  descriptionFr: "Lève une erreur.",
  daily: true,
  async run() {
    throw new Error("Disque plein\nstack…");
  },
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectAll();
});

describe("runJob", () => {
  it("records a successful run with its summary, trigger, business date and author; audit context is system + runId", async () => {
    const actorId = await createUserFixture("ops-admin@vigie.local", { role: "admin" });
    let seen: unknown;
    const job: JobDefinition = {
      name: "test-ok",
      labelFr: "OK",
      descriptionFr: "",
      daily: false,
      async run(ctx) {
        seen = { ...getAuditContext(), runId: ctx.runId };
        return { files: 3, rows: 12n };
      },
    };
    const outcome = await runJob("test-ok", "manual", { actorId, jobs: [job], now: new Date("2026-10-05T22:30:00Z") });
    expect(outcome.status).toBe("success");
    const run = await raw.jobRun.findUniqueOrThrow({ where: { id: outcome.runId! } });
    expect(run).toMatchObject({ job: "test-ok", trigger: "manual", status: "success", triggeredById: actorId, error: null });
    // 22:30 UTC on 5 October = 00:30 on 6 October in Paris.
    expect(run.businessDate.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(JSON.parse(run.summaryJson!)).toEqual({ files: 3, rows: "12" });
    expect(run.finishedAt).not.toBeNull();
    expect(seen).toMatchObject({ actorId, source: "system", batchId: outcome.runId });
  });

  it("a failing job is recorded as failed (first line of the message) and never throws", async () => {
    const outcome = await runJob("test-failing", "cli", { jobs: [failing] });
    expect(outcome).toMatchObject({ status: "failed", error: "Disque plein" });
    const run = await raw.jobRun.findFirstOrThrow({ where: { job: "test-failing" } });
    expect(run).toMatchObject({ status: "failed", error: "Disque plein" });
  });

  it("unknown job: explicit error", async () => {
    await expect(runJob("nope", "cli", { jobs: [failing] })).rejects.toBeInstanceOf(UnknownJobError);
  });

  it("mutual exclusion: two simultaneous triggers → one runs, the other is refused explicitly", async () => {
    const { job, release, started } = gatedJob();
    const settled = [runJob(job.name, "manual", { jobs: [job] }), runJob(job.name, "cli", { jobs: [job] })].map((p) =>
      p.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    );
    const first = await Promise.race(settled);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error).toBeInstanceOf(JobAlreadyRunningError);
      expect((first.error as Error).message).toMatch(/déjà en cours/);
    }
    await started;
    expect(await raw.jobRun.count({ where: { job: job.name } })).toBe(1);
    expect(await raw.jobRun.count({ where: { job: job.name, status: "running" } })).toBe(1);
    release();
    const all = await Promise.all(settled);
    expect(all.filter((r) => r.ok && r.value.status === "success")).toHaveLength(1);
    expect(all.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("the database refuses a second « running » row for the same job (filtered unique index)", async () => {
    const data = { job: "test-direct", trigger: "manual", status: "running", businessDate: new Date("2026-10-05T00:00:00Z") };
    await raw.jobRun.create({ data });
    await expect(raw.jobRun.create({ data })).rejects.toThrow();
  });

  it("a run still « running » after more than 2 hours is failed, and a new run can start", async () => {
    const now = new Date("2026-10-05T10:00:00Z");
    const stale = await raw.jobRun.create({
      data: { job: "test-ok2", trigger: "scheduled", status: "running", businessDate: new Date("2026-10-05T00:00:00Z"), startedAt: new Date(now.getTime() - 2 * 3_600_000 - 1000) },
    });
    const recent = await raw.jobRun.create({
      data: { job: "other", trigger: "manual", status: "running", businessDate: new Date("2026-10-05T00:00:00Z"), startedAt: new Date(now.getTime() - 3_600_000) },
    });
    const job: JobDefinition = { name: "test-ok2", labelFr: "OK", descriptionFr: "", daily: true, run: async () => ({}) };
    const outcome = await runJob(job.name, "manual", { jobs: [job], now });
    expect(outcome.status).toBe("success");
    expect(await raw.jobRun.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: "failed", error: STALE_RUN_MESSAGE });
    // Another job's run, younger than 2 hours, is left alone.
    expect(await failStaleRuns("other", now)).toBe(0);
    expect(await raw.jobRun.findUniqueOrThrow({ where: { id: recent.id } })).toMatchObject({ status: "running" });
  });

  it("at most one successful scheduled or catch-up run per business date; manual runs are not limited", async () => {
    let calls = 0;
    const job: JobDefinition = { name: "test-daily", labelFr: "Quotidienne", descriptionFr: "", daily: true, run: async () => ({ call: ++calls }) };
    const now = new Date("2026-10-05T01:30:00Z");
    expect((await runJob(job.name, "scheduled", { jobs: [job], now })).status).toBe("success");
    expect(await runJob(job.name, "catchup", { jobs: [job], now: new Date("2026-10-05T08:00:00Z") })).toMatchObject({ status: "skipped" });
    expect((await runJob(job.name, "manual", { jobs: [job], now })).status).toBe("success");
    // Next business date: runs again.
    expect((await runJob(job.name, "scheduled", { jobs: [job], now: new Date("2026-10-06T01:30:00Z") })).status).toBe("success");
    expect(calls).toBe(3);
  });

  it("a failed scheduled run does not prevent the catch-up of the same date", async () => {
    let fail = true;
    const job: JobDefinition = {
      name: "test-retry",
      labelFr: "Reprise",
      descriptionFr: "",
      daily: true,
      run: async () => {
        if (fail) throw new Error("panne");
        return {};
      },
    };
    const now = new Date("2026-10-05T01:30:00Z");
    expect((await runJob(job.name, "scheduled", { jobs: [job], now })).status).toBe("failed");
    fail = false;
    expect((await runJob(job.name, "catchup", { jobs: [job], now: new Date("2026-10-05T08:00:00Z") })).status).toBe("success");
  });
});
