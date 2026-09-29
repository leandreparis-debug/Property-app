/**
 * Pure derivation of the national map data from the site index — used by
 * the server (GET /api/map/sites) and by the browser on FILTERED entries.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { COMPLIANCE_STATUSES, STATUS_META } from "@/lib/status";
import { MAX_POINT_REASONS, type MapSitesData } from "./map-dto";
import type { SiteIndexEntry } from "./site-index";

/** A building footprint of a site (no status: taken from the index). */
export interface FootprintRecord {
  id: string;
  code: string;
  geometry: Polygon | MultiPolygon;
  heightM: number;
  heightEstimated: boolean;
}

/**
 * Map data of some index entries.
 * @param entries - Entries to draw (all of them, or the filtered ones).
 * @param footprints - Footprints of the sites (any site; filtered here).
 * @param evaluatedOn - Business date of the evaluation (YYYY-MM-DD).
 */
export function mapDataFromIndex(entries: readonly SiteIndexEntry[], footprints: readonly FootprintRecord[], evaluatedOn: string): MapSitesData {
  const byId = new Map(footprints.map((f) => [f.id, f]));
  const data: MapSitesData = {
    evaluatedOn,
    points: { type: "FeatureCollection", features: [] },
    footprints: { type: "FeatureCollection", features: [] },
    unlocated: [],
    counts: Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, 0])) as MapSitesData["counts"],
    reasonsById: {},
  };
  for (const e of entries) {
    data.counts[e.status]++;
    data.reasonsById[e.id] = e.reasons;
    if (e.lat === null || e.lon === null) {
      data.unlocated.push({ id: e.id, code: e.code, name: e.name, city: e.city, status: e.status });
      continue;
    }
    const footprint = byId.get(e.id);
    data.points.features.push({
      type: "Feature",
      id: e.id,
      geometry: { type: "Point", coordinates: [e.lon, e.lat] },
      properties: {
        id: e.id,
        code: e.code,
        name: e.name,
        city: e.city,
        departmentCode: e.departmentCode,
        region: e.region,
        isActive: e.isActive,
        status: e.status,
        statusRank: e.statusRank,
        reasons: e.reasons.slice(0, MAX_POINT_REASONS),
        reasonCount: e.reasons.length,
        completeness: e.completeness,
        totalArea: e.totalArea,
        hasFootprint: footprint !== undefined,
      },
    });
    if (footprint) {
      data.footprints.features.push({
        type: "Feature",
        id: e.id,
        geometry: footprint.geometry,
        properties: { id: e.id, code: e.code, status: e.status, heightM: footprint.heightM, heightEstimated: footprint.heightEstimated },
      });
    }
  }
  data.points.features.sort((a, b) => a.properties.statusRank - b.properties.statusRank || a.properties.name.localeCompare(b.properties.name, "fr"));
  data.unlocated.sort((a, b) => STATUS_META[b.status].severity - STATUS_META[a.status].severity || a.name.localeCompare(b.name, "fr"));
  return data;
}
