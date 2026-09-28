/**
 * PURE transformation of the site rows into the national map DTO: compliance
 * evaluation, points, footprints, unlocated sites, counts. No database access
 * (see sites.ts), so every rule of the DTO is unit-tested.
 */
import { evaluateSite, type ComplianceSite } from "@/domain/compliance";
import { toIsoDate } from "@/domain/dates";
import { referenceArea, toNumber, type NumericLike } from "@/domain/derived";
import { footprintSchema } from "@/domain/enrichment-format";
import {
  DEFAULT_BUILDING_HEIGHT_M,
  MAX_POINT_REASONS,
  type MapFootprintProperties,
  type MapSiteProperties,
  type MapSitesData,
} from "@/domain/map-dto";
import { COMPLIANCE_STATUSES, STATUS_META } from "@/lib/status";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

/** A site row as read for the map (see sites.ts). */
export interface MapSiteRow extends ComplianceSite {
  id: string;
  latitude: NumericLike;
  longitude: NumericLike;
  geometry: { footprintGeoJson: string | null; heightM: NumericLike } | null;
}

const validLonLat = (lon: number | null, lat: number | null): lon is number => lon !== null && lat !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

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

/**
 * Builds the map DTO.
 * @param rows - Non-archived sites with their relations.
 * @param today - Today's business date (injected).
 */
export function buildMapSitesData(rows: readonly MapSiteRow[], today: Date): MapSitesData {
  const data: MapSitesData = {
    evaluatedOn: toIsoDate(today) ?? "",
    points: { type: "FeatureCollection", features: [] },
    footprints: { type: "FeatureCollection", features: [] },
    unlocated: [],
    counts: Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, 0])) as MapSitesData["counts"],
    reasonsById: {},
  };

  for (const row of rows) {
    const lat = toNumber(row.latitude);
    const lon = toNumber(row.longitude);
    const located = validLonLat(lon, lat);
    const evaluation = evaluateSite({ ...row, hasCoordinates: located }, today);
    data.counts[evaluation.status]++;
    data.reasonsById[row.id] = evaluation.reasons;

    if (!located) {
      data.unlocated.push({ id: row.id, code: row.code, name: row.name, city: row.city, status: evaluation.status });
      continue;
    }
    const footprint = parseFootprint(row.geometry?.footprintGeoJson);
    const properties: MapSiteProperties = {
      id: row.id,
      code: row.code,
      name: row.name,
      city: row.city,
      departmentCode: row.departmentCode,
      region: row.region,
      isActive: row.isActive !== false,
      status: evaluation.status,
      statusRank: STATUS_META[evaluation.status].severity,
      reasons: evaluation.reasons.slice(0, MAX_POINT_REASONS),
      reasonCount: evaluation.reasons.length,
      completeness: evaluation.completeness,
      totalArea: referenceArea(row.technical),
      hasFootprint: footprint !== null,
    };
    const point: Feature<Point, MapSiteProperties> = { type: "Feature", id: row.id, geometry: { type: "Point", coordinates: [lon, lat as number] }, properties };
    data.points.features.push(point);

    if (footprint) {
      const height = toNumber(row.geometry?.heightM);
      const known = height !== null && height > 0;
      const fp: Feature<Polygon | MultiPolygon, MapFootprintProperties> = {
        type: "Feature",
        id: row.id,
        geometry: footprint,
        properties: { id: row.id, code: row.code, status: evaluation.status, heightM: known ? height : DEFAULT_BUILDING_HEIGHT_M, heightEstimated: !known },
      };
      data.footprints.features.push(fp);
    }
  }

  data.points.features.sort((a, b) => a.properties.statusRank - b.properties.statusRank || a.properties.name.localeCompare(b.properties.name, "fr"));
  data.unlocated.sort((a, b) => STATUS_META[b.status].severity - STATUS_META[a.status].severity || a.name.localeCompare(b.name, "fr"));
  return data;
}
