/**
 * Pure derivation of the national map data from the site index — used by
 * the server (GET /api/map/sites) and by the browser on FILTERED entries.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { COMPLIANCE_STATUSES, STATUS_META } from "@/lib/status";
import { MAX_POINT_REASONS, type MapSitesData, type MapVolumeProperties } from "./map-dto";
import type { VolumeMeta, VolumePartProperties } from "./volume/build";
import type { SiteIndexEntry } from "./site-index";

/**
 * A building footprint of a site and its generated 3D volume (no status:
 * taken from the index; no financial field). `geometry` is the approximate
 * rectangle when `approximate` is true.
 */
export interface FootprintRecord {
  id: string;
  code: string;
  geometry: Polygon | MultiPolygon;
  heightM: number;
  heightEstimated: boolean;
  /** No footprint: 2:1 rectangle of the reference area (see volume/build.ts). */
  approximate: boolean;
  /** Parts of the volume (cells, firewalls, docks, roof edges). */
  parts: FeatureCollection<Polygon | MultiPolygon, VolumePartProperties>;
  meta: VolumeMeta;
}

/** Parts drawn one feature per element (alternating tones); the others are merged per site. */
const INDIVIDUAL_PARTS = new Set(["cell"]);

/**
 * Volume features of a footprint for the map: one feature per cell, and one
 * MultiPolygon per other part (firewalls, docks, roof edges) to keep the
 * payload small.
 * @param f - Footprint record.
 */
export function volumeFeatures(f: FootprintRecord): Feature<Polygon | MultiPolygon, MapVolumeProperties>[] {
  const out: Feature<Polygon | MultiPolygon, MapVolumeProperties>[] = [];
  const merged = new Map<string, { props: VolumePartProperties; polygons: Position[][][] }>();
  for (const part of f.parts.features) {
    const { properties: p, geometry: g } = part;
    if (INDIVIDUAL_PARTS.has(p.part)) {
      out.push({ type: "Feature", geometry: g, properties: { siteId: f.id, code: f.code, ...p, approximate: f.approximate } });
      continue;
    }
    const entry = merged.get(p.part) ?? { props: p, polygons: [] };
    entry.polygons.push(...(g.type === "Polygon" ? [g.coordinates] : g.coordinates));
    merged.set(p.part, entry);
  }
  for (const { props, polygons } of merged.values()) {
    out.push({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: polygons }, properties: { siteId: f.id, code: f.code, ...props, index: -1, approximate: f.approximate } });
  }
  return out;
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
    volumes: { type: "FeatureCollection", features: [] },
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
        properties: { id: e.id, code: e.code, status: e.status, heightM: footprint.heightM, heightEstimated: footprint.heightEstimated, approximate: footprint.approximate },
      });
      data.volumes.features.push(...volumeFeatures(footprint));
    }
  }
  data.points.features.sort((a, b) => a.properties.statusRank - b.properties.statusRank || a.properties.name.localeCompare(b.properties.name, "fr"));
  data.unlocated.sort((a, b) => STATUS_META[b.status].severity - STATUS_META[a.status].severity || a.name.localeCompare(b.name, "fr"));
  return data;
}
