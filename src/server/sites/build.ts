/**
 * PURE construction of the site index from the database rows (see index.ts
 * for the query): compliance evaluation, deadline bucket, external ids,
 * footprints. No database access: every rule of the DTO is unit-tested.
 */
import { evaluateSite, type ComplianceSite } from "@/domain/compliance";
import { referenceArea, toNumber, type NumericLike } from "@/domain/derived";
import { footprintSchema } from "@/domain/enrichment-format";
import { resolveDepartment } from "@/domain/geo";
import type { FootprintRecord } from "@/domain/map-data";
import { buildBuildingVolume, type DockSide } from "@/domain/volume/build";
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
  geometry: VolumeRow["geometry"];
}

/** What the volume of a site needs (a subset of {@link SiteRow}). */
export interface VolumeRow {
  id: string;
  code: string;
  latitude: NumericLike;
  longitude: NumericLike;
  technical?: {
    surveyedTotalArea?: NumericLike;
    totalWarehouseArea?: NumericLike;
    heightM?: NumericLike;
    cellCount?: number | null;
    dockCount?: number | null;
  } | null;
  geometry: { footprintGeoJson: string | null; heightM: NumericLike; dockSide?: string | null } | null;
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

/**
 * Footprints and generated 3D volumes of the rows: the stored footprint, or
 * an approximate rectangle from the reference area and the coordinates. A
 * site with neither gets no record. Height: SiteTechnical, else SiteGeometry,
 * else 12 m (estimated).
 * @param rows - Sites.
 */
export function footprintsFromRows(rows: readonly VolumeRow[]): FootprintRecord[] {
  const out: FootprintRecord[] = [];
  for (const row of rows) {
    const record = footprintOf(row);
    if (record) out.push(record);
  }
  return out;
}

/**
 * Footprint and volume of one site (see {@link footprintsFromRows}).
 * @param row - Site.
 * @returns The record, or null without footprint nor area/coordinates.
 */
export function footprintOf(row: VolumeRow): FootprintRecord | null {
  const lat = toNumber(row.latitude);
  const lon = toNumber(row.longitude);
  const center = lat !== null && lon !== null && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  const technicalHeight = toNumber(row.technical?.heightM);
  const volume = buildBuildingVolume({
    footprint: parseFootprint(row.geometry?.footprintGeoJson),
    heightM: technicalHeight !== null && technicalHeight > 0 ? technicalHeight : toNumber(row.geometry?.heightM),
    cellCount: row.technical?.cellCount ?? null,
    dockCount: row.technical?.dockCount ?? null,
    dockSide: parseDockSide(row.geometry?.dockSide),
    referenceArea: referenceArea(row.technical),
    center,
  });
  if (!volume) return null;
  return {
    id: row.id,
    code: row.code,
    geometry: volume.footprint,
    heightM: volume.meta.heightM,
    heightEstimated: volume.meta.heightEstimated,
    approximate: volume.meta.approximate,
    parts: volume.parts,
    meta: volume.meta,
  };
}

/** Stored dock side, `a` by default. */
export function parseDockSide(value: string | null | undefined): DockSide {
  return value === "b" ? "b" : "a";
}
