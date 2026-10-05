import "server-only";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { nextDailyRun, parseDailyTime } from "@/domain/ops/schedule";
import { getEnv } from "@/lib/env";
import { db } from "../db";
import { latestExport, listExports, type StoredExport } from "../exports/store";
import { storageRoot } from "../storage";
import { JOBS } from "./jobs";
import { STALE_RUN_MS } from "@/domain/ops/schedule";

/**
 * Data of the operations screen (`/admin/operations`): jobs and their runs,
 * exports, export freshness, disk usage of the storage root.
 */

/** Runs shown per job. */
export const RUN_HISTORY = 30;

/** A successful export older than this is flagged (36 hours). */
export const EXPORT_STALE_MS = 36 * 3_600_000;

/** One run, as displayed. */
export interface RunView {
  id: string;
  trigger: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  triggeredBy: string | null;
}

/** One job and its history. */
export interface JobView {
  name: string;
  labelFr: string;
  descriptionFr: string;
  daily: boolean;
  /** Next scheduled occurrence; `null` when the scheduler is off or the job is not daily. */
  nextRunAt: Date | null;
  runs: RunView[];
}

function parseSummary(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Every job with its last {@link RUN_HISTORY} runs (most recent first).
 * A run « running » for more than 2 hours is shown failed (as `runJob`
 * will record it at the next launch).
 * @param now - Current instant.
 */
export async function getJobViews(now: Date = new Date()): Promise<JobView[]> {
  const env = getEnv();
  const at = parseDailyTime(env.OPS_DAILY_AT);
  const next = env.OPS_SCHEDULER === "on" && at ? nextDailyRun(now, at) : null;
  const views: JobView[] = [];
  for (const job of JOBS) {
    const runs = await db.jobRun.findMany({
      where: { job: job.name },
      orderBy: { startedAt: "desc" },
      take: RUN_HISTORY,
      include: { triggeredBy: { select: { name: true, email: true } } },
    });
    views.push({
      name: job.name,
      labelFr: job.labelFr,
      descriptionFr: job.descriptionFr,
      daily: job.daily,
      nextRunAt: job.daily ? next : null,
      runs: runs.map((r) => {
        const stale = r.status === "running" && now.getTime() - r.startedAt.getTime() > STALE_RUN_MS;
        return {
          id: r.id,
          trigger: r.trigger,
          status: stale ? "failed" : r.status,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
          summary: parseSummary(r.summaryJson),
          error: stale ? "Interrompue (toujours « en cours » après 2 heures)." : r.error,
          triggeredBy: r.triggeredBy ? (r.triggeredBy.name ?? r.triggeredBy.email) : null,
        };
      }),
    });
  }
  return views;
}

/** Freshness of the nightly export. */
export interface ExportFreshness {
  latest: StoredExport | null;
  /** No successful export, or the last one is older than 36 hours. */
  stale: boolean;
}

/**
 * Whether the last successful export is older than 36 hours (or missing).
 * @param now - Current instant.
 */
export async function getExportFreshness(now: Date = new Date()): Promise<ExportFreshness> {
  const latest = await latestExport();
  return { latest, stale: !latest || now.getTime() - latest.createdAt.getTime() > EXPORT_STALE_MS };
}

/** Exports, most recent first. */
export function getExports(): Promise<StoredExport[]> {
  return listExports();
}

/** Disk usage of one sub-folder of the storage root. */
export interface FolderUsage {
  name: string;
  bytes: number;
  files: number;
}

async function folderSize(path: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const stack = [path];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const full = join(dir, name);
      const info = await lstat(full);
      if (info.isDirectory()) stack.push(full);
      else if (info.isFile()) {
        bytes += info.size;
        files++;
      }
    }
  }
  return { bytes, files };
}

/**
 * Space used by each sub-folder of STORAGE_ROOT (documents, exports, imports,
 * enrichment, map, trash…), largest first. Symbolic links are not followed.
 */
export async function getStorageUsage(): Promise<FolderUsage[]> {
  const root = storageRoot();
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const usage: FolderUsage[] = [];
  for (const name of names) {
    const info = await lstat(join(root, name));
    if (!info.isDirectory()) continue;
    usage.push({ name, ...(await folderSize(join(root, name))) });
  }
  return usage.sort((a, b) => b.bytes - a.bytes);
}
