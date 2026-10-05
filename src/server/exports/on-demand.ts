import "server-only";
import { auditValueText, entityLabel, type AuditFilters } from "@/domain/audit/view";
import { toCsvDocument, type CellValue } from "@/domain/export/csv";
import { buildDictionary, buildMetricsTable, buildSitesTable } from "@/domain/export/tables";
import { todayDateOnly, toIsoDate } from "@/domain/dates";
import { AuditAction, AuditSource } from "@/domain/enums";
import { applyFilters } from "@/domain/filters/apply";
import { parseFilters } from "@/domain/filters/url";
import { auditRows, countAudit } from "../audit/journal";
import { can } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { getSiteIndex } from "../sites/index";
import { loadExportData } from "./data";
import { tableCsv, xlsxBuffer } from "./writers";

/**
 * On-demand exports (step 11), with the SAME serializer as the nightly
 * export:
 * - the site list as filtered on `/sites` (`export:read`), XLSX or CSV;
 * - the audit journal as filtered on `/admin/audit` (`audit:read`), CSV,
 *   at most {@link AUDIT_EXPORT_MAX} lines.
 * Financial columns and values are left out without `finance:read`. Each
 * export leaves an `EXPORT` line in the audit journal (actor, date, scope,
 * rows), never the exported data itself.
 */

/** Maximum lines of an audit export. */
export const AUDIT_EXPORT_MAX = 50_000;

/** A file to download. */
export interface ExportFile {
  content: Uint8Array | string;
  fileName: string;
  rows: number;
}

/**
 * Records an on-demand export in the audit journal.
 * @param user - Who exported.
 * @param scope - `sites` or `audit`.
 * @param details - Format, filters, rows, truncation (no data).
 */
export async function recordExport(user: SessionUser, scope: "sites" | "audit", details: Record<string, unknown>): Promise<void> {
  await db.auditLog.create({
    data: { actorId: user.id, action: "EXPORT", source: "ui", entityType: "Export", entityId: scope, afterValue: JSON.stringify({ scope, ...details }) },
  });
}

/**
 * The site list, filtered like `/sites` (URL filters of the shared views;
 * archived sites are not in the list), as XLSX (Sites, Indicateurs annuels,
 * Dictionnaire) or CSV (Sites, French headers).
 * @param user - Reader (`export:read` checked by the route).
 * @param params - URL parameters (filters).
 * @param format - `xlsx` or `csv`.
 */
export async function exportSiteList(user: SessionUser, params: URLSearchParams, format: "xlsx" | "csv"): Promise<ExportFile> {
  const today = todayDateOnly();
  const filters = parseFilters(params);
  const ids = applyFilters(await getSiteIndex(today), filters).map((e) => e.id);
  const data = ids.length > 0 ? await loadExportData({ includeArchived: false, siteIds: ids }) : { sites: [], metrics: [], equipments: [], documents: [] };
  const options = { finance: can(user.role, "finance:read"), today };
  const sites = buildSitesTable(data.sites, data.metrics, options);
  const day = toIsoDate(today) ?? "";
  let file: ExportFile;
  if (format === "xlsx") {
    const metrics = buildMetricsTable(data.metrics, data.sites, options);
    file = { content: await xlsxBuffer([sites, metrics, buildDictionary([sites, metrics])]), fileName: `vigie-sites-${day}.xlsx`, rows: sites.rows.length };
  } else {
    file = { content: tableCsv(sites, "label"), fileName: `vigie-sites-${day}.csv`, rows: sites.rows.length };
  }
  const query = new URLSearchParams(params);
  query.delete("format");
  await recordExport(user, "sites", { format, filters: query.toString(), rows: file.rows, finance: options.finance });
  return file;
}

/** Columns of the audit CSV export (French headers). */
export const AUDIT_EXPORT_HEADER = ["Date", "Acteur", "Source", "Action", "Entité", "Identifiant", "Site", "Champ", "Clé du champ", "Ancienne valeur", "Nouvelle valeur", "Motif", "Lot"] as const;

/**
 * The audit journal filtered like `/admin/audit`, as CSV, at most
 * {@link AUDIT_EXPORT_MAX} lines (most recent first); financial values
 * masked without `finance:read`.
 * @param user - Reader (`audit:read` checked by the route).
 * @param filters - Journal filters.
 * @returns The file, and whether the cap was reached.
 */
export async function exportAuditJournal(user: SessionUser, filters: AuditFilters): Promise<ExportFile & { truncated: boolean; total: number }> {
  const finance = can(user.role, "finance:read");
  const total = await countAudit(filters);
  const rows: CellValue[][] = [];
  for await (const page of auditRows(filters, { finance, max: AUDIT_EXPORT_MAX })) {
    for (const r of page) {
      rows.push([
        r.occurredAt,
        r.actorLabel,
        AuditSource.is(r.source) ? AuditSource.label(r.source) : r.source,
        AuditAction.is(r.action) ? AuditAction.label(r.action) : r.action,
        entityLabel(r.entityType),
        r.entityId,
        r.siteCode,
        r.field ? r.fieldLabel : null,
        r.field,
        r.beforeValue === null ? null : auditValueText(r.beforeValue),
        r.afterValue === null ? null : auditValueText(r.afterValue),
        r.comment,
        r.batchId,
      ]);
    }
  }
  const truncated = total > AUDIT_EXPORT_MAX;
  await recordExport(user, "audit", { format: "csv", filters, rows: rows.length, total, truncated, finance });
  return { content: toCsvDocument(AUDIT_EXPORT_HEADER, rows), fileName: `vigie-journal-audit-${toIsoDate(todayDateOnly())}.csv`, rows: rows.length, truncated, total };
}
