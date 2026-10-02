import "server-only";
import { toDateOnly } from "@/domain/dates";
import { AuditSource } from "@/domain/enums";
import { formatFieldValue, type FieldDefinition } from "@/domain/fields";
import { db } from "../db";

/** Maximum number of history entries returned. */
export const HISTORY_LIMIT = 50;

/** One change of a field, formatted for display. */
export interface FieldHistoryEntry {
  id: string;
  /** ISO instant. */
  at: string;
  by: string | null;
  source: string;
  sourceLabel: string;
  /** Previous value, formatted (« — » when empty). */
  before: string;
  /** New value, formatted. */
  after: string;
  comment: string | null;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Audit JSON (Decimal and dates as strings) → typed value for `formatFieldValue`. */
function typed(def: FieldDefinition, json: unknown, precision: unknown): unknown {
  if (json === null || json === undefined) return null;
  switch (def.type) {
    case "area":
    case "money":
    case "moneyPerSqm":
    case "number":
    case "integer":
    case "months":
      return Number(json);
    case "date":
      return toDateOnly(String(json));
    case "dateWithPrecision":
      return { date: toDateOnly(String(json)), precision: typeof precision === "string" ? precision : "day" };
    default:
      return json;
  }
}

/**
 * History of one field of a site, newest first (at most {@link HISTORY_LIMIT}
 * entries), from `audit_logs`: the record creation and every update of the
 * field, with author, source, previous → new value (formatted with
 * `formatFieldValue`) and reason.
 * @param siteId - Site.
 * @param def - Registry field.
 */
export async function getFieldHistory(siteId: string, def: FieldDefinition): Promise<FieldHistoryEntry[]> {
  const fields = def.precisionKey ? [def.key, def.precisionKey] : [def.key];
  const lines = await db.auditLog.findMany({
    where: { siteId, entityType: def.entity, OR: [{ field: { in: fields } }, { field: null, action: "CREATE" }] },
    orderBy: { id: "desc" },
    take: HISTORY_LIMIT * 2,
  });
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(lines.flatMap((l) => (l.actorId ? [l.actorId] : [])))] } }, select: { id: true, name: true, email: true } });
  const names = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
  // Precision lines of the same batch (dates with precision).
  const precisionOf = new Map<string, { before: unknown; after: unknown }>();
  for (const l of lines) if (def.precisionKey && l.field === def.precisionKey) precisionOf.set(`${l.batchId ?? l.id}|${l.entityId}`, { before: parseJson(l.beforeValue), after: parseJson(l.afterValue) });

  const out: FieldHistoryEntry[] = [];
  for (const l of lines) {
    let before: unknown;
    let after: unknown;
    let precisionBefore: unknown;
    let precisionAfter: unknown;
    if (l.field === null) {
      const record = parseJson(l.afterValue) as Record<string, unknown> | null;
      if (!record || record[def.key] === undefined || record[def.key] === null) continue; // creation without this field
      before = null;
      after = record[def.key];
      precisionAfter = def.precisionKey ? record[def.precisionKey] : undefined;
    } else if (l.field === def.key) {
      before = parseJson(l.beforeValue);
      after = parseJson(l.afterValue);
      const p = precisionOf.get(`${l.batchId ?? l.id}|${l.entityId}`);
      precisionBefore = p?.before;
      precisionAfter = p?.after;
    } else continue;
    out.push({
      id: String(l.id),
      at: l.occurredAt.toISOString(),
      by: l.actorId ? (names.get(l.actorId) ?? null) : null,
      source: l.source,
      sourceLabel: l.source === "import" ? "Import du tableur" : l.source === "ui" ? "Saisie" : l.source === "enrichment" ? "Enrichissement (source publique)" : AuditSource.is(l.source) ? AuditSource.label(l.source) : l.source,
      before: formatFieldValue(def, typed(def, before, precisionBefore)),
      after: formatFieldValue(def, typed(def, after, precisionAfter)),
      comment: l.comment,
    });
    if (out.length >= HISTORY_LIMIT) break;
  }
  return out;
}
