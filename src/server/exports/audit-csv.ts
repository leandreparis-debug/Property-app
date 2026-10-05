import "server-only";
import type { CellValue } from "@/domain/export/csv";
import { db } from "../db";

/**
 * The audit journal as CSV rows, read by KEYSET pagination on the id (never
 * OFFSET), so the whole journal can be streamed whatever its size.
 */

/** Columns of `audit_logs.csv` (technical names of the table). */
export const AUDIT_CSV_HEADER = [
  "id",
  "occurred_at",
  "actor_id",
  "actor_email",
  "action",
  "source",
  "entity_type",
  "entity_id",
  "site_id",
  "field",
  "before_value",
  "after_value",
  "batch_id",
  "comment",
] as const;

/** Rows per page. */
export const AUDIT_PAGE_SIZE = 5000;

/**
 * Every audit line, oldest first, page by page.
 * @param pageSize - Rows per query.
 */
export async function* auditCsvPages(pageSize = AUDIT_PAGE_SIZE): AsyncGenerator<CellValue[][]> {
  const emails = new Map((await db.user.findMany({ select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  let after = 0n;
  for (;;) {
    const page = await db.auditLog.findMany({ where: { id: { gt: after } }, orderBy: { id: "asc" }, take: pageSize });
    if (page.length === 0) return;
    after = page.at(-1)!.id;
    yield page.map((l) => [
      l.id,
      l.occurredAt,
      l.actorId,
      l.actorId ? (emails.get(l.actorId) ?? null) : null,
      l.action,
      l.source,
      l.entityType,
      l.entityId,
      l.siteId,
      l.field,
      l.beforeValue,
      l.afterValue,
      l.batchId,
      l.comment,
    ]);
    if (page.length < pageSize) return;
  }
}
