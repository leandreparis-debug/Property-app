import "server-only";
import { Prisma } from "../../../generated/prisma/client";
import { db } from "../db";
import type { ExistingSite, PreservationIndex } from "./plan";

/**
 * Database READS of the import: current state of the sites of the file,
 * owners of external ids, last writer of every field (preservation rule),
 * sites absent from the file. No write here.
 */

const TECHNICAL_FIELDS = new Set(["id", "siteId", "createdAt", "updatedAt", "version", "archivedAt"]);

function scalarFields(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (TECHNICAL_FIELDS.has(key)) continue;
    if (value !== null && typeof value === "object" && !(value instanceof Date) && !Prisma.Decimal.isDecimal(value)) continue;
    if (Array.isArray(value)) continue;
    out[key] = value;
  }
  return out;
}

/** Sources whose last write protects a field from being overwritten by the import. */
export const PROTECTED_AUDIT_SOURCES: ReadonlySet<string> = new Set(["ui", "enrichment"]);

/** State of the database relevant to one import run. */
export interface ImportState {
  /** Existing sites of the file, by upper-case code. */
  sites: Map<string, ExistingSite>;
  /** Owner site code of every external id, keyed `SYSTEM|VALUE` (upper case). */
  externalOwners: Map<string, string>;
  preservation: PreservationIndex;
  /** Sites in base but absent from the file (never modified by the import). */
  missingFromFile: { code: string; name: string }[];
}

/**
 * Loads everything the planner needs, in a handful of queries.
 * @param codes - Warehouse codes of the file.
 */
export async function loadImportState(codes: readonly string[]): Promise<ImportState> {
  const rows = codes.length
    ? await db.site.findMany({
        where: { code: { in: [...codes] } },
        include: {
          lease: true,
          serviceContract: true,
          technical: true,
          icpe: true,
          energyProfile: true,
          externalIds: true,
          buildingWorks: true,
          icpeHeadings: true,
          annualMetrics: true,
        },
      })
    : [];

  const sites = new Map<string, ExistingSite>();
  for (const row of rows) {
    const oneToOne: ExistingSite["oneToOne"] = {};
    const pairs = [
      ["lease", row.lease],
      ["serviceContract", row.serviceContract],
      ["technical", row.technical],
      ["icpe", row.icpe],
      ["energy", row.energyProfile],
    ] as const;
    for (const [key, value] of pairs) {
      if (value) oneToOne[key] = { id: value.id, fields: scalarFields(value as unknown as Record<string, unknown>) };
    }
    sites.set(row.code.toUpperCase(), {
      id: row.id,
      code: row.code,
      fields: scalarFields(row as unknown as Record<string, unknown>),
      oneToOne,
      externalIds: row.externalIds.map((e) => ({ id: e.id, system: e.system, value: e.value })),
      buildingWorks: row.buildingWorks.map((w) => ({ id: w.id, kind: w.kind, date: w.date, datePrecision: w.datePrecision })),
      icpeHeadings: row.icpeHeadings.map((h) => ({ id: h.id, code: h.code, regime: h.regime })),
      metrics: row.annualMetrics.map((m) => ({ id: m.id, metric: m.metric, year: m.year, value: m.value, source: m.source })),
    });
  }

  const owners = await db.siteExternalId.findMany({ select: { system: true, value: true, site: { select: { code: true } } } });
  const externalOwners = new Map(owners.map((o) => [`${o.system}|${o.value.toUpperCase()}`, o.site.code]));

  const upper = new Set(codes.map((c) => c.toUpperCase()));
  const all = await db.site.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } });
  const missingFromFile = all.filter((s) => !upper.has(s.code.toUpperCase()));

  const preservation = await loadPreservationIndex([...sites.values()].map((s) => s.id));
  return { sites, externalOwners, preservation, missingFromFile };
}

interface LastWrite {
  entity_type: string;
  entity_id: string;
  field: string | null;
  source: string;
  id: bigint;
}

/**
 * Builds the preservation index from `audit_logs`: for every (entity, field),
 * the most recent CREATE/UPDATE line (one windowed query).
 * @param siteIds - Sites concerned.
 */
export async function loadPreservationIndex(siteIds: readonly string[]): Promise<PreservationIndex> {
  const lastByField = new Map<string, LastWrite>();
  const lastByRecord = new Map<string, LastWrite>();
  for (let i = 0; i < siteIds.length; i += 500) {
    const chunk = siteIds.slice(i, i + 500);
    const lines = await db.$queryRaw<LastWrite[]>`
      SELECT entity_type, entity_id, field, source, id FROM (
        SELECT entity_type, entity_id, field, source, id,
               ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id, field ORDER BY id DESC) AS rn
        FROM audit_logs
        WHERE site_id IN (${Prisma.join(chunk)}) AND action IN ('CREATE', 'UPDATE')
      ) last_writes
      WHERE rn = 1`;
    for (const line of lines) {
      const record = `${line.entity_type}|${line.entity_id}`;
      lastByField.set(`${record}|${line.field ?? "*"}`, line);
      const previous = lastByRecord.get(record);
      if (!previous || line.id > previous.id) lastByRecord.set(record, line);
    }
  }
  const newest = (a: LastWrite | undefined, b: LastWrite | undefined) => (!a ? b : !b ? a : a.id > b.id ? a : b);
  return {
    isFieldPreserved(model, id, field) {
      const last = newest(lastByField.get(`${model}|${id}|${field}`), lastByField.get(`${model}|${id}|*`));
      return last !== undefined && PROTECTED_AUDIT_SOURCES.has(last.source);
    },
    isRecordPreserved(model, id) {
      const last = lastByRecord.get(`${model}|${id}`);
      return last !== undefined && PROTECTED_AUDIT_SOURCES.has(last.source);
    },
  };
}

/**
 * The import actor: must be an ACTIVE user whose role grants `import:run`.
 * @param email - Email given with `--actor`.
 * @returns The user, or `null`.
 */
export async function findActiveUser(email: string) {
  return db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, role: true, isActive: true },
  });
}
