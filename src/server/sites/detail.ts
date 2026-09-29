import "server-only";
import { Prisma } from "../../../generated/prisma/client";
import { evaluateSite, type ComplianceEvaluation } from "@/domain/compliance";
import { toDateOnly } from "@/domain/dates";
import { metricSeries, referenceArea, toNumber, type MetricSeriesPoint } from "@/domain/derived";
import { geodesicArea } from "@/domain/geo/area";
import { DEFAULT_BUILDING_HEIGHT_M } from "@/domain/map-dto";
import { METRIC_CODES, type MetricCode } from "@/domain/metrics";
import { occupancyCostSeries, type OccupancyCostYear } from "@/domain/site-sheet/occupancy-cost";
import { resolveProvenanceLabel, type FieldProvenance } from "@/domain/site-sheet/provenance";
import { groupPublicData, type PublicDataGroup } from "@/domain/site-sheet/public-data";
import { sortWorks } from "@/domain/site-sheet/works";
import type { MultiPolygon, Polygon } from "geojson";
import { db } from "../db";
import { parseFootprint } from "./build";

export { resolveProvenanceLabel, type FieldProvenance } from "@/domain/site-sheet/provenance";

/**
 * Data of the site sheet (/sites/[id]), read-only.
 *
 * - {@link getSiteDetail}: ONE Prisma call for the site and every relation,
 *   then pure derivations (compliance, metric series, occupancy cost,
 *   footprint area, public-data groups). Decimals and BigInts are converted
 *   to numbers so the result can cross the server → client boundary.
 * - {@link getFieldProvenance}: ONE windowed query on `audit_logs`
 *   (index `site_id`): the last write of every (entity, field).
 */

/** Shape of a site id (cuid): anything else is a 404 without touching the database. */
const SITE_ID = /^[A-Za-z0-9_-]{1,30}$/;

/** Whether a string can be a site id. */
export function isWellFormedSiteId(id: string): boolean {
  return SITE_ID.test(id);
}

/** Converts Prisma values to plain ones: Decimal → number, BigInt → number, DATE columns kept as Date. */
type Plain<T> = T extends Prisma.Decimal ? number : T extends bigint ? number : T extends Date ? Date : T;
type PlainRecord<T> = { [K in keyof T]: Plain<T[K]> };

function plain<T extends object>(record: T): PlainRecord<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Prisma.Decimal.isDecimal(value)) out[key] = toNumber(value as Prisma.Decimal);
    else if (typeof value === "bigint") out[key] = Number(value);
    else out[key] = value;
  }
  return out as PlainRecord<T>;
}

const DETAIL_INCLUDE = {
  externalIds: { select: { id: true, system: true, value: true }, orderBy: [{ system: "asc" }, { value: "asc" }] },
  lease: true,
  serviceContract: true,
  technical: true,
  buildingWorks: true,
  icpe: true,
  icpeHeadings: { orderBy: { code: "asc" } },
  energyProfile: true,
  annualMetrics: { select: { id: true, year: true, metric: true, value: true, source: true } },
  geometry: true,
  documents: { include: { uploadedBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } },
  publicData: { select: { provider: true, key: true, valueJson: true, fetchedAt: true } },
} satisfies Prisma.SiteInclude;

type SiteWithRelations = Prisma.SiteGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Scalar fields of the site (plain values). */
export type SiteScalars = PlainRecord<Omit<SiteWithRelations, keyof typeof DETAIL_INCLUDE>>;

/** A stored document (metadata only). */
export interface SiteDocument {
  id: string;
  category: string;
  title: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  uploadedByName: string | null;
}

/** Footprint of the building. */
export interface SiteFootprint {
  geometry: Polygon | MultiPolygon;
  /** Geodesic area of the footprint (m²). */
  areaM2: number;
  heightM: number;
  /** Height unknown: {@link DEFAULT_BUILDING_HEIGHT_M} is used. */
  heightEstimated: boolean;
  source: string | null;
  fetchedAt: Date | null;
}

/** Everything the site sheet shows. */
export interface SiteDetail {
  site: SiteScalars;
  externalIds: { id: string; system: string; value: string }[];
  lease: PlainRecord<NonNullable<SiteWithRelations["lease"]>> | null;
  serviceContract: PlainRecord<NonNullable<SiteWithRelations["serviceContract"]>> | null;
  technical: PlainRecord<NonNullable<SiteWithRelations["technical"]>> | null;
  icpe: PlainRecord<NonNullable<SiteWithRelations["icpe"]>> | null;
  energyProfile: PlainRecord<NonNullable<SiteWithRelations["energyProfile"]>> | null;
  /** Works in chronological order. */
  buildingWorks: { id: string; kind: string; date: Date | null; datePrecision: string | null; description: string | null }[];
  icpeHeadings: { id: string; code: string; regime: string | null; label: string | null }[];
  /** Series of every metric that has at least one row (per m² on the reference area). */
  metrics: Partial<Record<MetricCode, MetricSeriesPoint[]>>;
  /** Id of each stored metric row, keyed `METRIC|year` (provenance lookup). */
  metricRowIds: Record<string, string>;
  /** Years present in the metric rows, ascending. */
  metricYears: number[];
  occupancyCost: OccupancyCostYear[];
  /** Reference area (m²): surveyed total, otherwise total warehouse area. */
  referenceArea: number | null;
  evaluation: ComplianceEvaluation;
  footprint: SiteFootprint | null;
  publicData: PublicDataGroup[];
  documents: SiteDocument[];
}

/**
 * The site sheet data.
 * @param id - Site id (untrusted: malformed ids give `null`).
 * @param today - Today's business date (injected).
 * @returns The detail, or `null` for an unknown or malformed id. Archived
 *   sites are returned (the page shows an « archivé » banner).
 */
export async function getSiteDetail(id: string, today: Date): Promise<SiteDetail | null> {
  if (!isWellFormedSiteId(id)) return null;
  const row = await db.site.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) return null;

  const { externalIds, lease, serviceContract, technical, buildingWorks, icpe, icpeHeadings, energyProfile, annualMetrics, geometry, documents, publicData, ...scalars } = row;
  const site = plain(scalars);
  const plainLease = lease ? plain(lease) : null;
  const plainTechnical = technical ? plain(technical) : null;
  const area = referenceArea(plainTechnical);

  const metrics: Partial<Record<MetricCode, MetricSeriesPoint[]>> = {};
  const metricRowIds: Record<string, string> = {};
  const rows = annualMetrics.map((m) => ({ year: m.year, metric: m.metric, value: toNumber(m.value) }));
  for (const m of annualMetrics) metricRowIds[`${m.metric}|${m.year}`] = m.id;
  for (const code of METRIC_CODES) {
    const series = metricSeries(rows, code, area);
    if (series.length > 0) metrics[code] = series;
  }

  const hasCoordinates = site.latitude !== null && site.longitude !== null;
  const evaluation = evaluateSite(
    {
      ...site,
      hasCoordinates,
      lease: plainLease
        ? {
            code: plainLease.code,
            holdingEntity: plainLease.holdingEntity,
            endDate: toDateOnly(plainLease.endDate),
            nextExitDate: toDateOnly(plainLease.nextExitDate),
            noticeDate: toDateOnly(plainLease.noticeDate),
            noticePeriodMonths: plainLease.noticePeriodMonths,
            renewalConditionsSigned: plainLease.renewalConditionsSigned,
          }
        : null,
      technical: plainTechnical,
      icpe: { holder: icpe?.holder ?? null, headingsCount: icpeHeadings.length },
    },
    today,
  );

  const shape = parseFootprint(geometry?.footprintGeoJson);
  const height = toNumber(geometry?.heightM);
  const footprint: SiteFootprint | null = shape
    ? {
        geometry: shape,
        areaM2: geodesicArea(shape),
        heightM: height !== null && height > 0 ? height : DEFAULT_BUILDING_HEIGHT_M,
        heightEstimated: !(height !== null && height > 0),
        source: geometry?.source ?? null,
        fetchedAt: geometry?.fetchedAt ?? null,
      }
    : null;

  return {
    site,
    externalIds,
    lease: plainLease,
    serviceContract: serviceContract ? plain(serviceContract) : null,
    technical: plainTechnical,
    icpe: icpe ? plain(icpe) : null,
    energyProfile: energyProfile ? plain(energyProfile) : null,
    buildingWorks: sortWorks(buildingWorks.map((w) => ({ id: w.id, kind: w.kind, date: w.date, datePrecision: w.datePrecision, description: w.description }))),
    icpeHeadings: icpeHeadings.map((h) => ({ id: h.id, code: h.code, regime: h.regime, label: h.label })),
    metrics,
    metricRowIds,
    metricYears: [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b),
    occupancyCost: occupancyCostSeries(rows, area),
    referenceArea: area,
    evaluation,
    footprint,
    publicData: groupPublicData(publicData),
    documents: documents.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes === null ? null : Number(d.sizeBytes),
      createdAt: d.createdAt,
      uploadedByName: d.uploadedBy?.name ?? d.uploadedBy?.email ?? null,
    })),
  };
}

interface ProvenanceLine {
  id: bigint;
  entity_type: string;
  entity_id: string;
  field: string | null;
  source: string;
  occurred_at: Date;
  batch_id: string | null;
  comment: string | null;
  actor_name: string | null;
  actor_email: string | null;
}

/** Last writes of a site, keyed `EntityType|entityId|field` (`*` for a record creation). */
export interface ProvenanceIndex {
  readonly lines: ReadonlyMap<string, FieldProvenance & { id: bigint }>;
}

/**
 * Last write of every (entity, field) of a site, from `audit_logs`: ONE
 * windowed query on the `site_id` index. A record creation (field `NULL`)
 * counts as a write of every field of the record.
 * @param siteId - Site.
 */
export async function getFieldProvenance(siteId: string): Promise<ProvenanceIndex> {
  const lines = await db.$queryRaw<ProvenanceLine[]>`
    SELECT last.id, last.entity_type, last.entity_id, last.field, last.source, last.occurred_at, last.batch_id, last.comment,
           u.name AS actor_name, u.email AS actor_email
    FROM (
      SELECT id, entity_type, entity_id, field, source, occurred_at, batch_id, actor_id, comment,
             ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id, field ORDER BY id DESC) AS rn
      FROM audit_logs
      WHERE site_id = ${siteId} AND action IN ('CREATE', 'UPDATE')
    ) last
    LEFT JOIN users u ON u.id = last.actor_id
    WHERE last.rn = 1`;
  const map = new Map<string, FieldProvenance & { id: bigint }>();
  for (const line of lines) {
    map.set(`${line.entity_type}|${line.entity_id}|${line.field ?? "*"}`, {
      id: BigInt(line.id),
      source: line.source,
      occurredAt: line.occurred_at,
      actorName: line.actor_name ?? line.actor_email,
      batchId: line.batch_id,
      comment: line.comment,
    });
  }
  return { lines: map };
}

/**
 * Provenance of one field: the newest of its last update and of the record creation.
 * @param index - Result of {@link getFieldProvenance}.
 * @param entityType - Prisma model (e.g. « Lease »).
 * @param entityId - Record id (missing record → `null`).
 * @param field - Field name.
 */
export function provenanceOf(index: ProvenanceIndex, entityType: string, entityId: string | null | undefined, field: string): FieldProvenance | null {
  if (!entityId) return null;
  const update = index.lines.get(`${entityType}|${entityId}|${field}`);
  const creation = index.lines.get(`${entityType}|${entityId}|*`);
  const newest = !update ? creation : !creation ? update : update.id > creation.id ? update : creation;
  if (!newest) return null;
  const { id: _id, ...provenance } = newest;
  return provenance;
}

/** Label and kind of a provenance, as passed to the client tooltip. */
export interface ProvenanceHint {
  label: string;
  /** The value comes from the public-data enrichment (« source publique » icon). */
  enrichment: boolean;
}

/** Hint of a field (label resolved on the server). */
export function provenanceHint(index: ProvenanceIndex, entityType: string, entityId: string | null | undefined, field: string): ProvenanceHint | null {
  const p = provenanceOf(index, entityType, entityId, field);
  return p ? { label: resolveProvenanceLabel(p), enrichment: p.source === "enrichment" } : null;
}

/**
 * Whether a site exists (archived included). Malformed ids answer `false`
 * without a query. Used before streaming so that the 404 is a real one.
 * @param id - Untrusted site id.
 */
export async function siteExists(id: string): Promise<boolean> {
  if (!isWellFormedSiteId(id)) return false;
  return (await db.site.count({ where: { id } })) > 0;
}
