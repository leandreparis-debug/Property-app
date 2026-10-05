import "server-only";
import { lstat, readdir, unlink } from "node:fs/promises";
import { planTrashPurge, type TrashEntry, type TrashPurgeItem } from "@/domain/ops/trash";
import { getEnv } from "@/lib/env";
import { getAuditContext } from "../audit/context";
import { pruneLoginRateLimiter } from "../auth/login";
import { purgeStaleSessions } from "../auth/session";
import { db } from "../db";
import { resolveStoragePath, toStorageRelative } from "../storage";
import type { JobContext, JobDefinition, JobSummary } from "./types";

/**
 * Purge jobs. They never touch the sites, the audit journal (except to ADD
 * their own lines) nor the import reports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes the sessions expired for more than SESSION_PURGE_DAYS days and
 * prunes the login rate limiter of this process (it lives in memory: there
 * is no rate-limit record in the database).
 */
export async function runSessionPurge(context: JobContext): Promise<JobSummary> {
  const days = getEnv().SESSION_PURGE_DAYS;
  const sessionsDeleted = await purgeStaleSessions(context.now, days);
  const rateLimiterKeys = pruneLoginRateLimiter();
  return { sessionsDeleted, graceDays: days, rateLimiterKeysTracked: rateLimiterKeys };
}

/** Job definition of the session purge. */
export const purgeSessionsJob: JobDefinition = {
  name: "purge-sessions",
  labelFr: "Purge des sessions",
  descriptionFr: "Supprime les sessions expirées depuis plus de 7 jours (SESSION_PURGE_DAYS).",
  daily: true,
  run: runSessionPurge,
};

// ─────────────────────────────────────────────────────────────────────────────
// Trash
// ─────────────────────────────────────────────────────────────────────────────

/** Root of the trash under the storage root. */
export const TRASH_DIR = "trash";

/** Files currently in the trash (`trash/<kind>/<file>`). */
export async function listTrash(): Promise<TrashEntry[]> {
  const entries: TrashEntry[] = [];
  let kinds: string[];
  try {
    kinds = await readdir(resolveStoragePath(TRASH_DIR));
  } catch {
    return entries;
  }
  for (const kind of kinds) {
    const dir = resolveStoragePath(TRASH_DIR, kind);
    if (!(await lstat(dir)).isDirectory()) continue;
    for (const name of await readdir(dir)) {
      const path = resolveStoragePath(TRASH_DIR, kind, name);
      const info = await lstat(path);
      if (!info.isFile()) continue;
      entries.push({ path: toStorageRelative(path), name, sizeBytes: info.size, modifiedAt: info.mtime });
    }
  }
  return entries;
}

/** Result of {@link executeTrashPurge}. */
export interface TrashPurgeResult {
  erased: number;
  /** Files already missing from the disk when the purge reached them. */
  missing: string[];
  bytes: number;
}

/**
 * Erases the planned files. For each, one audit line `DELETE` of entity
 * `TrashFile` (source and batch of the current audit context, site of the
 * deleted document when known). A file already missing is reported and the
 * purge goes on.
 * @param items - Files to erase ({@link planTrashPurge}).
 * @param retentionDays - Reminded in the audit comment.
 */
export async function executeTrashPurge(items: readonly TrashPurgeItem[], retentionDays: number): Promise<TrashPurgeResult> {
  const context = getAuditContext();
  const result: TrashPurgeResult = { erased: 0, missing: [], bytes: 0 };
  for (const item of items) {
    let missing = false;
    try {
      await unlink(resolveStoragePath(...item.path.split("/")));
      result.erased++;
      result.bytes += item.sizeBytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      missing = true;
      result.missing.push(item.path);
    }
    // Site of the deleted document: from the audit line of its deletion.
    const deletion = item.documentId
      ? await db.auditLog.findFirst({ where: { entityType: "Document", entityId: item.documentId, action: "DELETE" }, select: { siteId: true }, orderBy: { id: "desc" } })
      : null;
    await db.auditLog.create({
      data: {
        actorId: context?.actorId ?? null,
        action: "DELETE",
        source: "system",
        entityType: "TrashFile",
        entityId: (item.documentId ?? item.name).slice(0, 50),
        siteId: deletion?.siteId ?? null,
        beforeValue: JSON.stringify({ path: item.path, sizeBytes: item.sizeBytes, trashedAt: item.trashedAt.toISOString() }),
        afterValue: JSON.stringify({ erased: !missing, missing }),
        batchId: context?.batchId ?? null,
        comment: `Purge de la corbeille (plus de ${retentionDays} jours)${missing ? " : fichier déjà absent du disque" : ""}.`,
      },
    });
  }
  return result;
}

/** Erases the trash files older than TRASH_RETENTION_DAYS days. */
export async function runTrashPurge(context: JobContext): Promise<JobSummary> {
  const days = getEnv().TRASH_RETENTION_DAYS;
  const entries = await listTrash();
  const plan = planTrashPurge(entries, context.now, days);
  const result = await executeTrashPurge(plan, days);
  return { inTrash: entries.length, erased: result.erased, bytesFreed: result.bytes, missing: result.missing, retentionDays: days };
}

/** Job definition of the trash purge. */
export const purgeTrashJob: JobDefinition = {
  name: "purge-trash",
  labelFr: "Purge de la corbeille",
  descriptionFr: "Efface les documents supprimés depuis plus de 30 jours (TRASH_RETENTION_DAYS) ; chaque effacement est tracé.",
  daily: true,
  run: runTrashPurge,
};
