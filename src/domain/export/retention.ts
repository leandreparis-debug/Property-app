/**
 * Naming and retention of the nightly exports (step 11), PURE.
 *
 * Folder: `exports/<YYYY-MM-DD>T<HHmm>_<id court>/` (Europe/Paris wall
 * clock). Built in `exports/.tmp-<runId>/`, then renamed atomically.
 */
import { BUSINESS_TIME_ZONE } from "../dates";
import { zonedTimeToInstant } from "../ops/schedule";

/** Retention policy. */
export interface RetentionPolicy {
  /** Every export younger than this many days is kept (EXPORT_RETENTION_DAYS). */
  days: number;
  /** Beyond, the first export of each month is kept this many months (EXPORT_RETENTION_MONTHS). */
  months: number;
}

/** An export folder found on disk. */
export interface ExportFolder {
  name: string;
  /** Instant encoded in the name. */
  createdAt: Date;
  /** A `manifest.json` is present: the export completed successfully. */
  complete: boolean;
}

/** Prefix of the temporary folders. */
export const TMP_PREFIX = ".tmp-";

const NAME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})_([A-Za-z0-9]{1,12})$/;

function parisParts(instant: Date) {
  const parts: Record<string, string> = {};
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (const p of format.formatToParts(instant)) parts[p.type] = p.value;
  return parts;
}

/** Short id of a run (last 8 characters). */
export function shortRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9]/g, "").slice(-8);
}

/**
 * Name of an export folder.
 * @param at - Instant of the export.
 * @param runId - Id of the run.
 * @returns E.g. « 2026-10-05T0330_k2x9a7bc ».
 */
export function exportFolderName(at: Date, runId: string): string {
  const p = parisParts(at);
  return `${p.year}-${p.month}-${p.day}T${p.hour}${p.minute}_${shortRunId(runId)}`;
}

/**
 * Instant encoded in an export folder name.
 * @returns The instant, or `null` when the name is not an export folder.
 */
export function parseExportFolderName(name: string): Date | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedTimeToInstant(y, mo, d, h, mi, BUSINESS_TIME_ZONE);
}

/** Index of the Paris calendar month of an instant (year × 12 + month). */
function monthIndex(instant: Date): number {
  const p = parisParts(instant);
  return Number(p.year) * 12 + Number(p.month) - 1;
}

/**
 * Exports to delete.
 *
 * - Complete exports younger than `policy.days` days: kept.
 * - Older complete exports: the FIRST of each calendar month (Paris) is kept
 *   while the month is among the last `policy.months` months (current month
 *   included); the others are deleted.
 * - The most recent complete export is NEVER deleted.
 * - Incomplete folders (no manifest) older than one day are deleted.
 *
 * @param exports - Folders found (temporary folders excluded).
 * @param now - Current instant.
 * @param policy - Retention policy.
 * @returns Names of the folders to delete.
 */
export function selectExportsToDelete(exports: readonly ExportFolder[], now: Date, policy: RetentionPolicy): string[] {
  const dayMs = 86_400_000;
  const complete = exports.filter((e) => e.complete).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const latest = complete.at(-1)?.name;
  const keep = new Set<string>();
  if (latest) keep.add(latest);

  const firstOfMonth = new Map<number, string>();
  for (const e of complete) {
    const month = monthIndex(e.createdAt);
    if (!firstOfMonth.has(month)) firstOfMonth.set(month, e.name);
  }
  const nowMonth = monthIndex(now);
  for (const e of complete) {
    if (now.getTime() - e.createdAt.getTime() < policy.days * dayMs) keep.add(e.name);
    const month = monthIndex(e.createdAt);
    if (firstOfMonth.get(month) === e.name && nowMonth - month < policy.months) keep.add(e.name);
  }

  const toDelete = complete.filter((e) => !keep.has(e.name)).map((e) => e.name);
  for (const e of exports) {
    if (!e.complete && now.getTime() - e.createdAt.getTime() > dayMs) toDelete.push(e.name);
  }
  return toDelete;
}
