import "server-only";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_NAME } from "@/config/app";
import { toIsoDate } from "@/domain/dates";
import { exportFolderName, TMP_PREFIX } from "@/domain/export/retention";
import { buildDictionary, buildDocumentsTable, buildEquipmentTable, buildMetricsTable, buildSitesTable, type ExportTable } from "@/domain/export/tables";
import { toCsvDocument } from "@/domain/export/csv";
import { UserRole } from "@/domain/enums";
import { db } from "../db";
import type { JobContext, JobDefinition, JobSummary } from "../ops/types";
import { ensureStorageDir, resolveStoragePath } from "../storage";
import packageJson from "../../../package.json";
import { AUDIT_CSV_HEADER, auditCsvPages } from "./audit-csv";
import { loadExportData } from "./data";
import { applyRetention, EXPORTS_DIR, MANIFEST_FILE, type ExportManifest, type ManifestFile } from "./store";
import { fileDigest, tableCsv, writeCsvStream, xlsxBuffer } from "./writers";

/**
 * The NIGHTLY EXPORT (job `nightly-export`): a complete, self-describing copy
 * of the data, readable without the application — financial data and
 * archived sites included. It is NOT a database backup (see
 * docs/exploitation.md).
 *
 * Built in `exports/.tmp-<runId>/`, then renamed atomically to
 * `exports/<YYYY-MM-DD>T<HHmm>_<id court>/`; on failure the temporary folder
 * is deleted. The retention policy runs at the end.
 */

/** Test hooks of {@link runNightlyExport}. */
export interface NightlyExportHooks {
  /** Called once the files are written, before the manifest (failure injection). */
  beforeManifest?: (tmpDir: string) => Promise<void> | void;
}

/** Last migration applied to the database (manifest). */
async function lastMigration(): Promise<string | null> {
  try {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT TOP 1 migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC, migration_name DESC`;
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes a complete export and applies the retention policy.
 * @param context - Run context (id, business date, clock).
 * @param hooks - Test hooks.
 * @returns Summary: folder, sites, files, retention.
 */
export async function runNightlyExport(context: JobContext, hooks: NightlyExportHooks = {}): Promise<JobSummary> {
  await ensureStorageDir(EXPORTS_DIR);
  const tmpName = `${TMP_PREFIX}${context.runId}`;
  const tmp = resolveStoragePath(EXPORTS_DIR, tmpName);
  await mkdir(tmp, { recursive: false });

  try {
    const options = { finance: true, today: context.businessDate };
    const data = await loadExportData({ includeArchived: true });
    const sites = buildSitesTable(data.sites, data.metrics, options);
    const metrics = buildMetricsTable(data.metrics, data.sites, options);
    const equipment = buildEquipmentTable(data.equipments);
    const documents = buildDocumentsTable(data.documents);
    const tables: ExportTable[] = [sites, metrics, equipment, documents];

    const files: ManifestFile[] = [];
    const record = async (name: string, rows: number) => files.push({ name, rows, ...(await fileDigest(join(tmp, name))) });

    await writeFile(join(tmp, "vigie-export.xlsx"), await xlsxBuffer([...tables, buildDictionary(tables)]), { flag: "wx" });
    await record("vigie-export.xlsx", sites.rows.length);
    for (const [name, table] of [
      ["sites.csv", sites],
      ["annual_metrics.csv", metrics],
      ["equipment.csv", equipment],
      ["documents.csv", documents],
    ] as const) {
      await writeFile(join(tmp, name), tableCsv(table), { flag: "wx" });
      await record(name, table.rows.length);
    }

    // Users: identity, role and status only (never a password hash nor a session).
    const users = await db.user.findMany({ select: { id: true, email: true, name: true, role: true, isActive: true }, orderBy: { email: "asc" } });
    await writeFile(
      join(tmp, "users.csv"),
      toCsvDocument(
        ["id", "email", "name", "role", "role_label", "status"],
        users.map((u) => [u.id, u.email, u.name, u.role, UserRole.is(u.role) ? UserRole.label(u.role) : u.role, u.isActive ? "active" : "inactive"]),
      ),
      { flag: "wx" },
    );
    await record("users.csv", users.length);

    const auditRows = await writeCsvStream(join(tmp, "audit_logs.csv"), AUDIT_CSV_HEADER, auditCsvPages());
    await record("audit_logs.csv", auditRows);

    await hooks.beforeManifest?.(tmp);
    const manifest: ExportManifest = {
      application: APP_NAME,
      version: packageJson.version,
      lastMigration: await lastMigration(),
      createdAt: context.now.toISOString(),
      businessDate: toIsoDate(context.businessDate) ?? "",
      runId: context.runId,
      sites: sites.rows.length,
      files,
    };
    await writeFile(join(tmp, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });

    const folder = exportFolderName(context.now, context.runId);
    await rename(tmp, resolveStoragePath(EXPORTS_DIR, folder));
    const retention = await applyRetention(context.now);
    return {
      folder,
      sites: sites.rows.length,
      files: files.length,
      bytes: files.reduce((s, f) => s + f.bytes, 0),
      auditLines: auditRows,
      deletedExports: retention.deleted,
      orphanTmpRemoved: retention.tmpRemoved,
    };
  } catch (error) {
    await rm(tmp, { recursive: true, force: true });
    throw error;
  }
}

/** Job definition of the nightly export. */
export const nightlyExportJob: JobDefinition = {
  name: "nightly-export",
  labelFr: "Export nocturne",
  descriptionFr: "Copie complète des données (XLSX, CSV, journal d'audit), puis application de la rétention.",
  daily: true,
  run: (context) => runNightlyExport(context),
};
