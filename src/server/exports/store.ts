import "server-only";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseExportFolderName, selectExportsToDelete, TMP_PREFIX, type ExportFolder, type RetentionPolicy } from "@/domain/export/retention";
import { getEnv } from "@/lib/env";
import { resolveStoragePath } from "../storage";

/**
 * The nightly exports on disk: `STORAGE_ROOT/exports/<YYYY-MM-DD>T<HHmm>_<id>/`,
 * each with a `manifest.json`. Listing, reading and retention.
 */

/** Sub-folder of the storage root holding the exports. */
export const EXPORTS_DIR = "exports";
/** Name of the manifest file. */
export const MANIFEST_FILE = "manifest.json";

/** One file of an export, as described by its manifest. */
export interface ManifestFile {
  name: string;
  rows: number;
  bytes: number;
  sha256: string;
}

/** Content of `manifest.json`. */
export interface ExportManifest {
  application: string;
  version: string;
  lastMigration: string | null;
  createdAt: string;
  businessDate: string;
  runId: string;
  sites: number;
  files: ManifestFile[];
}

/** An export folder and its manifest (when complete). */
export interface StoredExport extends ExportFolder {
  manifest: ExportManifest | null;
}

/** Retention policy from the environment. */
export function retentionPolicy(): RetentionPolicy {
  const env = getEnv();
  return { days: env.EXPORT_RETENTION_DAYS, months: env.EXPORT_RETENTION_MONTHS };
}

async function readManifest(dir: string): Promise<ExportManifest | null> {
  try {
    return JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")) as ExportManifest;
  } catch {
    return null;
  }
}

/**
 * Export folders, most recent first (temporary folders excluded).
 */
export async function listExports(): Promise<StoredExport[]> {
  let names: string[];
  try {
    names = await readdir(resolveStoragePath(EXPORTS_DIR));
  } catch {
    return [];
  }
  const found: StoredExport[] = [];
  for (const name of names) {
    const createdAt = parseExportFolderName(name);
    if (!createdAt) continue;
    const dir = resolveStoragePath(EXPORTS_DIR, name);
    if (!(await stat(dir)).isDirectory()) continue;
    const manifest = await readManifest(dir);
    found.push({ name, createdAt, complete: manifest !== null, manifest });
  }
  return found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** The most recent complete export, if any. */
export async function latestExport(): Promise<StoredExport | null> {
  return (await listExports()).find((e) => e.complete) ?? null;
}

/**
 * Applies the retention policy: deletes the selected export folders and the
 * orphan temporary folders (`.tmp-*`) except `keepTmp`.
 * @param now - Current instant.
 * @param keepTmp - Temporary folder of a run in progress, never deleted.
 * @returns Names of the deleted folders.
 */
export async function applyRetention(now: Date, keepTmp?: string): Promise<{ deleted: string[]; tmpRemoved: string[] }> {
  const exports = await listExports();
  const deleted = selectExportsToDelete(exports, now, retentionPolicy());
  for (const name of deleted) await rm(resolveStoragePath(EXPORTS_DIR, name), { recursive: true, force: true });
  const tmpRemoved: string[] = [];
  let names: string[] = [];
  try {
    names = await readdir(resolveStoragePath(EXPORTS_DIR));
  } catch {
    // No exports folder yet.
  }
  for (const name of names) {
    if (name.startsWith(TMP_PREFIX) && name !== keepTmp) {
      await rm(resolveStoragePath(EXPORTS_DIR, name), { recursive: true, force: true });
      tmpRemoved.push(name);
    }
  }
  return { deleted, tmpRemoved };
}

/** File names allowed in an export folder (downloads are limited to them). */
export const EXPORT_FILE_NAMES = [
  "vigie-export.xlsx",
  "sites.csv",
  "annual_metrics.csv",
  "equipment.csv",
  "documents.csv",
  "users.csv",
  "audit_logs.csv",
  MANIFEST_FILE,
] as const;
