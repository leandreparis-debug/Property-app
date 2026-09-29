/**
 * PURE construction of the site index from the database rows (see index.ts
 * for the query): compliance evaluation, deadline bucket, external ids,
 * footprints. No database access: every rule of the DTO is unit-tested.
 */
import { evaluateSite, type ComplianceSite } from "@/domain/compliance";
import { referenceArea, toNumber, type NumericLike } from "@/domain/derived";
import { footprintSchema } from "@/domain/enrichment-format";
import { resolveDepartment } from "@/domain/geo";
import { DEFAULT_BUILDING_HEIGHT_M } from "@/domain/map-dto";
import type { FootprintRecord } from "@/domain/map-data";
import { leaseDeadlineBucket, type SiteIndexEntry } from "@/domain/site-index";
import { STATUS_META } from "@/lib/status";
import type { MultiPolygon, Polygon } from "geojson";

/** A site row as read from the database. */
export interface SiteRow extends ComplianceSite {
  id: string;
  latitude: NumericLike;
  longitude: NumericLike;
  occupyingBu?: string | null;
  externalIds?: readonly { system: string; value: string }[];
  geometry: { footprintGeoJson: string | null; heightM: NumericLike } | null;
}

/** Parses a stored footprint; null when missing or invalid. */
export function parseFootprint(json: string | null | undefined): Polygon | MultiPolygon | null {
  if (!json) return null;
  try {
    const parsed = footprintSchema.safeParse(JSON.parse(json));
    return parsed.success ? (parsed.data as Polygon | MultiPolygon) : null;
  } catch {
    return null;
  }
}

/** Valid WGS 84 position of a row, or null. */
function position(row: SiteRow): { lat: number; lon: number } | null {
  const lat = toNumber(row.latitude);
  const lon = toNumber(row.longitude);
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const values = (ids: SiteRow["externalIds"], system: string) =>
  (ids ?? []).filter((e) => e.system === system).map((e) => e.value).sort((a, b) => a.localeCompare(b, "fr"));

/**
 * Index entry of one row.
 * @param row - Site row.
 * @param today - Today's business date (injected).
 */
export function buildSiteIndexEntry(row: SiteRow, today: Date): SiteIndexEntry {
  const pos = position(row);
  const evaluation = evaluateSite({ ...row, hasCoordinates: pos !== null }, today);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    city: row.city,
    departmentCode: row.departmentCode,
    departmentName: resolveDepartment(row.departmentCode)?.name ?? null,
    region: row.region,
    lat: pos?.lat ?? null,
    lon: pos?.lon ?? null,
    portfolio: row.portfolio,
    occupyingBu: row.occupyingBu ?? null,
    typology: row.typology,
    logisticsOperator: row.logisticsOperator,
    isActive: row.isActive !== false,
    status: evaluation.status,
    statusRank: STATUS_META[evaluation.status].severity,
    reasons: evaluation.reasons,
    completeness: evaluation.completeness,
    totalArea: referenceArea(row.technical),
    leaseDeadlineBucket: leaseDeadlineBucket(row.lease, today),
    externalIds: {
      qlik: values(row.externalIds, "QLIK_SENSE"),
      al: values(row.externalIds, "AL_CODE"),
      ramses: values(row.externalIds, "RAMSES"),
      leaseCode: row.lease?.code ?? null,
    },
  };
}

/**
 * The site index, sorted by severity then name.
 * @param rows - Non-archived sites.
 * @param today - Today's business date.
 */
export function buildSiteIndex(rows: readonly SiteRow[], today: Date): SiteIndexEntry[] {
  return rows
    .map((r) => buildSiteIndexEntry(r, today))
    .sort((a, b) => b.statusRank - a.statusRank || a.name.localeCompare(b.name, "fr"));
}

/** Footprints of the rows (valid geometries only; 12 m by default). */
export function footprintsFromRows(rows: readonly Pick<SiteRow, "id" | "code" | "geometry">[]): FootprintRecord[] {
  const out: FootprintRecord[] = [];
  for (const row of rows) {
    const geometry = parseFootprint(row.geometry?.footprintGeoJson);
    if (!geometry) continue;
    const height = toNumber(row.geometry?.heightM);
    const known = height !== null && height > 0;
    out.push({ id: row.id, code: row.code, geometry, heightM: known ? height : DEFAULT_BUILDING_HEIGHT_M, heightEstimated: !known });
  }
  return out;
}
