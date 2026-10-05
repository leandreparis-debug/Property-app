/**
 * Building footprint provider — BD TOPO v3 « batiment » layer through the
 * Géoplateforme WFS (GetFeature, GeoJSON output).
 *
 * Request: every building intersecting the 250 m box around the site.
 * Selection: the building CONTAINING the site point wins; otherwise the
 * LARGEST building within 250 m (lower confidence: never applied
 * automatically, see the apply threshold). Produces the footprint, the height
 * (`hauteur`, 0 = unknown in BD TOPO), the source reference (`cleabs`) and the
 * area — compared on the application side with `totalWarehouseArea`
 * (the export does not carry areas).
 */
import { footprintSchema, type Footprint } from "../../../src/domain/enrichment-format";
import { BUILDING_RULES, ENDPOINTS } from "../config";
import { bboxAround, distanceToFootprintM, footprintAreaM2, pointInFootprint, polygonsOf, type LonLat } from "../geo";
import { withQuery } from "../http";
import { asArray, asNumber, asRecord, asString, entry, fetchEntry, round, skipped, type ParsedResult, type Provider } from "./types";

/** A candidate building. */
export interface BuildingCandidate {
  id: string | null;
  footprint: Footprint;
  areaM2: number;
  heightM: number | null;
  nature: string | null;
  usage: string | null;
  distanceM: number;
  containsPoint: boolean;
}

/** Confidence of a footprint containing the site point / of the largest nearby. */
export const BUILDING_CONFIDENCE = { contains: 0.9, largest: 0.6 } as const;

/** Keeps [lon, lat] only; swaps axes when the service answered in lat/lon order. */
function toLonLat2d(geometry: Footprint, reference: LonLat): Footprint {
  const first = polygonsOf(geometry)[0]?.[0]?.[0];
  // In metropolitan France lat > 41 > |lon|: detect a (lat, lon) answer.
  const swapped = first !== undefined && Math.abs((first[0] ?? 0) - reference[1]) < 1 && Math.abs((first[1] ?? 0) - reference[0]) < 1;
  const fix = (p: readonly number[]): [number, number] => (swapped ? [p[1] ?? 0, p[0] ?? 0] : [p[0] ?? 0, p[1] ?? 0]);
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: geometry.coordinates.map((r) => r.map(fix)) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly) => poly.map((r) => r.map(fix))) };
}

/**
 * Candidate buildings of a WFS response around a point.
 * @param json - GeoJSON FeatureCollection.
 * @param point - Site position.
 * @param radiusM - Search radius.
 */
export function parseBuildings(json: unknown, point: LonLat, radiusM: number = BUILDING_RULES.radiusM): BuildingCandidate[] {
  const out: BuildingCandidate[] = [];
  for (const f of asArray(asRecord(json)?.features)) {
    const feature = asRecord(f);
    const parsed = footprintSchema.safeParse(feature?.geometry);
    if (!parsed.success) continue;
    const footprint = toLonLat2d(parsed.data, point);
    const props = asRecord(feature?.properties) ?? {};
    const distanceM = distanceToFootprintM(point, footprint);
    if (distanceM > radiusM) continue;
    const height = asNumber(props.hauteur);
    out.push({
      id: asString(props.cleabs) ?? asString(feature?.id),
      footprint,
      areaM2: footprintAreaM2(footprint),
      heightM: height !== null && height > 0 ? height : null,
      nature: asString(props.nature),
      usage: asString(props.usage_1),
      distanceM: Math.round(distanceM),
      containsPoint: distanceM === 0,
    });
  }
  return out;
}

/**
 * Chooses the building: the one containing the point, else the largest.
 * @returns The chosen building and how it was chosen, or null.
 */
export function selectBuilding(candidates: readonly BuildingCandidate[]): { building: BuildingCandidate; selection: "contains" | "largest" } | null {
  const containing = candidates.filter((c) => c.containsPoint).sort((a, b) => b.areaM2 - a.areaM2)[0];
  if (containing) return { building: containing, selection: "contains" };
  const largest = [...candidates].sort((a, b) => b.areaM2 - a.areaM2)[0];
  return largest ? { building: largest, selection: "largest" } : null;
}

/** Point-in-footprint re-export for tests. */
export { pointInFootprint };

/** The buildings provider. */
export const buildingsProvider: Provider = {
  name: "buildings",
  priority: "P1",
  sources: ["ign-bdtopo"],

  async fetch(ctx, http) {
    if (!ctx.position) return { skipped: "Position inconnue (ni coordonnées ni géocodage)", responses: [] };
    const [west, south, east, north] = bboxAround(ctx.position, BUILDING_RULES.radiusM);
    const url = withQuery(ENDPOINTS.wfs, {
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: ENDPOINTS.wfsBuildingsLayer,
      OUTPUTFORMAT: "application/json",
      SRSNAME: "EPSG:4326",
      // WFS 2.0 + EPSG:4326 URN: latitude first.
      BBOX: `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)},urn:ogc:def:crs:EPSG::4326`,
      COUNT: 500,
    });
    return { responses: [await fetchEntry(http, "buildings", "wfs", url)] };
  },

  parse(raw, ctx): ParsedResult {
    if (raw.skipped || !ctx.position) return skipped(raw.skipped ?? "Position inconnue");
    const candidates = parseBuildings(entry(raw, "wfs")?.json, ctx.position);
    const chosen = selectBuilding(candidates);
    if (!chosen) return { status: "not_found", data: { candidates: 0, radiusM: BUILDING_RULES.radiusM }, proposals: [], publicData: {} };

    const { building, selection } = chosen;
    const confidence = BUILDING_CONFIDENCE[selection];
    const sourceRef = building.id ? `BDTOPO_V3:batiment/${building.id}`.slice(0, 100) : null;
    const how = selection === "contains" ? "bâtiment contenant le point du site" : `plus grand bâtiment à moins de ${BUILDING_RULES.radiusM} m (${building.distanceM} m)`;
    const evidence = `BD TOPO ${building.id ?? "?"} — ${how}, ${Math.round(building.areaM2)} m² au sol`;
    const proposals: ParsedResult["proposals"] = [{ target: "SiteGeometry.footprintGeoJson", value: building.footprint, confidence, evidence }];
    if (building.heightM !== null) {
      proposals.push({ target: "SiteGeometry.heightM", value: round(building.heightM, 2), confidence, evidence });
    }
    return {
      status: "ok",
      data: {
        selection,
        sourceRef,
        areaM2: Math.round(building.areaM2),
        heightM: building.heightM,
        nature: building.nature,
        usage: building.usage,
        distanceM: building.distanceM,
        candidates: candidates.length,
      },
      proposals,
      publicData: {},
    };
  },

  contribute(parsed) {
    const footprint = parsed.proposals.find((p) => p.target === "SiteGeometry.footprintGeoJson");
    return footprint ? { footprint: footprint.value as Footprint } : {};
  },
};
