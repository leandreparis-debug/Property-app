import "server-only";
import { AUDIT_PAGE_SIZE, fieldLabel, maskAuditLine, type AuditCursor, type AuditFilters } from "@/domain/audit/view";
import { zonedTimeToInstant } from "@/domain/ops/schedule";
import { BUSINESS_TIME_ZONE } from "@/domain/dates";
import type { Prisma } from "../prisma";
import { db } from "../db";

/**
 * Reading of the audit journal for `/admin/audit` and its CSV export:
 * filters → `WHERE`, KEYSET pagination on (date, id) descending, lines
 * enriched with the actor, the site, the field label and the financial
 * masking of `src/domain/audit/view.ts`. Read-only.
 */

/** A line as displayed or exported. */
export interface AuditRow {
  id: bigint;
  occurredAt: Date;
  actorId: string | null;
  /** Name or email of the actor; « Système » without actor. */
  actorLabel: string;
  action: string;
  source: string;
  entityType: string;
  entityId: string;
  siteId: string | null;
  siteCode: string | null;
  field: string | null;
  fieldLabel: string;
  beforeValue: string | null;
  afterValue: string | null;
  /** A financial value was hidden from this reader. */
  masked: boolean;
  batchId: string | null;
  comment: string | null;
}

/** Instant of 00:00 (Paris) of a `YYYY-MM-DD` day, plus `days`. */
function parisMidnight(day: string, days = 0): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return zonedTimeToInstant(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 0, 0, BUSINESS_TIME_ZONE);
}

/**
 * `WHERE` clause of the filters. The site filter (part of a code or a
 * name) is resolved to site ids first, archived sites included.
 * @returns The clause, or `null` when it cannot match anything (unknown site).
 */
export async function auditWhere(filters: AuditFilters): Promise<Prisma.AuditLogWhereInput | null> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (filters.from) and.push({ occurredAt: { gte: parisMidnight(filters.from) } });
  if (filters.to) and.push({ occurredAt: { lt: parisMidnight(filters.to, 1) } });
  if (filters.actor) and.push({ actorId: filters.actor === "system" ? null : filters.actor });
  if (filters.source) and.push({ source: filters.source });
  if (filters.action) and.push({ action: filters.action });
  if (filters.entity) and.push({ entityType: filters.entity });
  if (filters.field) and.push({ field: filters.field });
  if (filters.batch) and.push({ batchId: filters.batch });
  if (filters.siteId) and.push({ siteId: filters.siteId });
  if (filters.site) {
    const sites = await db.site.findMany({
      where: { OR: [{ code: { contains: filters.site } }, { name: { contains: filters.site } }] },
      select: { id: true },
      take: 500,
    });
    if (sites.length === 0) return null;
    and.push({ siteId: { in: sites.map((s) => s.id) } });
  }
  return and.length > 0 ? { AND: and } : {};
}

/** Keyset condition: strictly after the cursor in (date, id) descending order. */
function afterCursor(cursor: AuditCursor): Prisma.AuditLogWhereInput {
  return { OR: [{ occurredAt: { lt: cursor.at } }, { occurredAt: cursor.at, id: { lt: cursor.id } }] };
}

type RawLine = Awaited<ReturnType<typeof db.auditLog.findMany>>[number];

/** Metric code of `AnnualMetric` lines (current row, else the creation or deletion line). */
async function metricCodes(lines: readonly RawLine[]): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  const fromJson = (json: string | null) => {
    try {
      const value = json ? (JSON.parse(json) as { metric?: unknown }) : null;
      return typeof value?.metric === "string" ? value.metric : null;
    } catch {
      return null;
    }
  };
  for (const l of lines) {
    if (l.entityType !== "AnnualMetric" || l.field !== null) continue;
    const code = fromJson(l.afterValue) ?? fromJson(l.beforeValue);
    if (code) codes.set(l.entityId, code);
  }
  const missing = [...new Set(lines.filter((l) => l.entityType === "AnnualMetric" && !codes.has(l.entityId)).map((l) => l.entityId))];
  if (missing.length === 0) return codes;
  for (const m of await db.annualMetric.findMany({ where: { id: { in: missing } }, select: { id: true, metric: true } })) codes.set(m.id, m.metric);
  const stillMissing = missing.filter((id) => !codes.has(id));
  if (stillMissing.length > 0) {
    const records = await db.auditLog.findMany({
      where: { entityType: "AnnualMetric", entityId: { in: stillMissing }, field: null },
      select: { entityId: true, beforeValue: true, afterValue: true },
    });
    for (const r of records) {
      const code = fromJson(r.afterValue) ?? fromJson(r.beforeValue);
      if (code && !codes.has(r.entityId)) codes.set(r.entityId, code);
    }
  }
  return codes;
}

/**
 * Enriches raw lines: actor label, site code, field label, financial masking.
 * @param lines - Lines read from `audit_logs`.
 * @param finance - The reader holds `finance:read`.
 */
export async function enrichAuditLines(lines: readonly RawLine[], finance: boolean): Promise<AuditRow[]> {
  const actorIds = [...new Set(lines.map((l) => l.actorId).filter((id): id is string => id !== null))];
  const siteIds = [...new Set(lines.map((l) => l.siteId).filter((id): id is string => id !== null))];
  const [actors, sites, metrics] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [],
    siteIds.length ? db.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, code: true } }) : [],
    finance ? new Map<string, string>() : metricCodes(lines),
  ]);
  const actorLabel = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
  const siteCode = new Map(sites.map((s) => [s.id, s.code]));
  return lines.map((l) => {
    const values = maskAuditLine(l, { finance, metricCode: metrics.get(l.entityId) ?? null });
    return {
      id: l.id,
      occurredAt: l.occurredAt,
      actorId: l.actorId,
      actorLabel: l.actorId ? (actorLabel.get(l.actorId) ?? l.actorId) : "Système",
      action: l.action,
      source: l.source,
      entityType: l.entityType,
      entityId: l.entityId,
      siteId: l.siteId,
      siteCode: l.siteId ? (siteCode.get(l.siteId) ?? null) : null,
      field: l.field,
      fieldLabel: fieldLabel(l.entityType, l.field),
      beforeValue: values.beforeValue,
      afterValue: values.afterValue,
      masked: values.masked,
      batchId: l.batchId,
      comment: l.comment,
    };
  });
}

/** One page of the journal. */
export interface AuditPage {
  rows: AuditRow[];
  /** Cursor of the next page, `null` on the last one. */
  next: AuditCursor | null;
}

/**
 * One page of the journal, most recent first.
 * @param filters - Filters of the URL.
 * @param options - Reader's financial permission, cursor, page size.
 */
export async function listAuditPage(filters: AuditFilters, options: { finance: boolean; cursor?: AuditCursor | null; pageSize?: number }): Promise<AuditPage> {
  const where = await auditWhere(filters);
  if (where === null) return { rows: [], next: null };
  const size = options.pageSize ?? AUDIT_PAGE_SIZE;
  const lines = await db.auditLog.findMany({
    where: options.cursor ? { AND: [where, afterCursor(options.cursor)] } : where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: size + 1,
  });
  const page = lines.slice(0, size);
  const last = page.at(-1);
  return { rows: await enrichAuditLines(page, options.finance), next: lines.length > size && last ? { at: last.occurredAt, id: last.id } : null };
}

/**
 * Number of lines matching the filters.
 * @param filters - Filters of the URL.
 */
export async function countAudit(filters: AuditFilters): Promise<number> {
  const where = await auditWhere(filters);
  return where === null ? 0 : db.auditLog.count({ where });
}

/**
 * Every line matching the filters (most recent first), page by page by
 * keyset, at most `max` lines — CSV export of the journal.
 * @param filters - Filters.
 * @param options - Reader's financial permission, cap, page size.
 */
export async function* auditRows(filters: AuditFilters, options: { finance: boolean; max: number; pageSize?: number }): AsyncGenerator<AuditRow[]> {
  let cursor: AuditCursor | null = null;
  let left = options.max;
  while (left > 0) {
    const page: AuditPage = await listAuditPage(filters, { finance: options.finance, cursor, pageSize: Math.min(options.pageSize ?? 1000, left) });
    if (page.rows.length > 0) yield page.rows;
    left -= page.rows.length;
    if (!page.next) return;
    cursor = page.next;
  }
}

/** Accounts for the actor filter (name or email), by email. */
export async function auditActorOptions(): Promise<{ id: string; label: string }[]> {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { email: "asc" } });
  return users.map((u) => ({ id: u.id, label: u.name ? `${u.name} (${u.email})` : u.email }));
}
