/**
 * Sources and layers of the SITES, drawn above any basemap (full or
 * fallback). The status colors appear only here.
 *
 * Visual hierarchy, from discreet to salient:
 * - ok: small (3.5), 55 % opacity;
 * - unknown: hollow grey ring;
 * - warning: filled, radius 6;
 * - critical: filled, radius 7, with a PULSING HALO on a separate layer
 *   (only its paint properties are animated).
 * Critical sites are drawn on top (circle-sort-key = statusRank).
 *
 * Clusters (up to zoom 7) are surface-2 discs whose ring takes the color of
 * the MOST SEVERE site they contain; their count is an HTML marker in Geist
 * Mono (see NationalMap), so no glyph is needed.
 */
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from "maplibre-gl";
import type { MapSitesData } from "@/domain/map-dto";
import { ACCENT, ACCENT_VOLUME, NEUTRAL, STATUS_COLORS, VOLUME_COLORS } from "../style/theme";

/** Source and layer ids. */
export const SITES_SOURCE = "sites";
export const FOOTPRINTS_SOURCE = "footprints";
export const VOLUMES_SOURCE = "volumes";
/** Global state holding the id of the selected site (volume in accent). */
export const SELECTED_SITE_STATE = "selectedSiteId";
export const LAYER = {
  clusters: "site-clusters",
  halo: "site-critical-halo",
  points: "site-points",
  selected: "site-selected",
  volumeSolid: "volume-solid",
  volumeApprox: "volume-approximate",
  volumeEdges: "volume-edges",
  footprintEdge: "footprint-edge",
  footprintEdgeApprox: "footprint-edge-approximate",
} as const;

/** Clustering parameters. */
export const CLUSTER = { maxZoom: 7, radius: 44 } as const;

/** Minimum zoom of the footprints. */
export const FOOTPRINT_MIN_ZOOM = 14;

const countStatus = (status: string): ExpressionSpecification => ["+", ["case", ["==", ["get", "status"], status], 1, 0]];

/** Aggregates of a cluster: number of critical, warning and unknown sites. */
export const CLUSTER_PROPERTIES = {
  critical: countStatus("critical"),
  warning: countStatus("warning"),
  unknown: countStatus("unknown"),
} as const;

/** Worst severity of a cluster, as a status name. */
export const CLUSTER_WORST_STATUS: ExpressionSpecification = [
  "case",
  [">", ["get", "critical"], 0], "critical",
  [">", ["get", "warning"], 0], "warning",
  [">", ["get", "unknown"], 0], "unknown",
  "ok",
];

/** Status name → color expression over a status expression. */
export function statusColor(status: ExpressionSpecification): ExpressionSpecification {
  return ["match", status, "critical", STATUS_COLORS.critical, "warning", STATUS_COLORS.warning, "unknown", STATUS_COLORS.unknown, STATUS_COLORS.ok];
}

/** GeoJSON source of the points, clustered. */
export function sitesSource(data: MapSitesData["points"]): GeoJSONSourceSpecification {
  return {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: CLUSTER.maxZoom,
    clusterRadius: CLUSTER.radius,
    clusterProperties: CLUSTER_PROPERTIES,
    promoteId: "id",
  };
}

/** GeoJSON source of the volume parts. */
export function volumesSource(data: MapSitesData["volumes"]): GeoJSONSourceSpecification {
  return { type: "geojson", data };
}

/** GeoJSON source of the footprints. */
export function footprintsSource(data: MapSitesData["footprints"]): GeoJSONSourceSpecification {
  return { type: "geojson", data, promoteId: "id" };
}

const STATUS = ["get", "status"] as ExpressionSpecification;
const NOT_CLUSTER: ExpressionSpecification = ["!", ["has", "point_count"]];

/** Cluster discs. */
export const CLUSTERS_LAYER: CircleLayerSpecification = {
  id: LAYER.clusters,
  type: "circle",
  source: SITES_SOURCE,
  filter: ["has", "point_count"],
  paint: {
    "circle-color": NEUTRAL.surface2,
    "circle-opacity": 0.92,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 20, 20, 100, 28],
    "circle-stroke-width": 2,
    "circle-stroke-color": statusColor(CLUSTER_WORST_STATUS),
    "circle-pitch-alignment": "viewport",
  },
};

/** Halo of the critical sites (radius and opacity animated). */
export const HALO_LAYER: CircleLayerSpecification = {
  id: LAYER.halo,
  type: "circle",
  source: SITES_SOURCE,
  filter: ["all", NOT_CLUSTER, ["==", STATUS, "critical"]],
  paint: {
    "circle-color": STATUS_COLORS.critical,
    "circle-radius": 12,
    "circle-opacity": 0.25,
    "circle-blur": 0.6,
    "circle-pitch-alignment": "viewport",
  },
};

/** Halo animation range (radius, opacity) — one cycle ≈ 1.8 s. */
export const HALO_PULSE = { minRadius: 8, maxRadius: 20, maxOpacity: 0.45, periodMs: 1800 } as const;

/**
 * Halo paint at a phase of the pulse.
 * @param phase - 0 → 1.
 */
export function haloAt(phase: number): { radius: number; opacity: number } {
  const p = ((phase % 1) + 1) % 1;
  return {
    radius: HALO_PULSE.minRadius + (HALO_PULSE.maxRadius - HALO_PULSE.minRadius) * p,
    opacity: HALO_PULSE.maxOpacity * (1 - p),
  };
}

/** Individual sites. */
export const POINTS_LAYER: CircleLayerSpecification = {
  id: LAYER.points,
  type: "circle",
  source: SITES_SOURCE,
  filter: NOT_CLUSTER,
  layout: { "circle-sort-key": ["get", "statusRank"] },
  paint: {
    "circle-radius": ["match", STATUS, "critical", 7, "warning", 6, "unknown", 4.5, 3.5],
    "circle-color": statusColor(STATUS),
    "circle-opacity": ["match", STATUS, "ok", 0.55, "unknown", 0, 0.95],
    "circle-stroke-color": ["match", STATUS, "unknown", STATUS_COLORS.unknown, NEUTRAL.surface1],
    "circle-stroke-width": ["match", STATUS, "unknown", 1.5, "ok", 0, 1],
    "circle-stroke-opacity": 0.9,
    "circle-pitch-alignment": "viewport",
  },
};

/** Ring around the selected site (accent). */
export const SELECTED_LAYER: CircleLayerSpecification = {
  id: LAYER.selected,
  type: "circle",
  source: SITES_SOURCE,
  filter: ["==", ["get", "code"], ""],
  paint: {
    "circle-radius": 13,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": ACCENT,
    "circle-stroke-width": 2,
    "circle-pitch-alignment": "viewport",
  },
};

const PART = ["get", "part"] as ExpressionSpecification;
const APPROXIMATE: ExpressionSpecification = ["boolean", ["get", "approximate"], false];
const IS_SELECTED: ExpressionSpecification = ["==", ["get", "siteId"], ["to-string", ["global-state", SELECTED_SITE_STATE]]];

/** Neutral color of a volume part; the selected site's cells in accent. */
const VOLUME_COLOR: ExpressionSpecification = [
  "case",
  ["all", IS_SELECTED, ["==", PART, "cell"]], ACCENT_VOLUME,
  ["all", IS_SELECTED, ["==", PART, "edge"]], ACCENT,
  ["==", PART, "dock"], VOLUME_COLORS.dock,
  ["==", PART, "firewall"], VOLUME_COLORS.firewall,
  ["==", PART, "edge"], VOLUME_COLORS.edge,
  ["==", ["%", ["get", "index"], 2], 0], VOLUME_COLORS.cellEven,
  VOLUME_COLORS.cellOdd,
];

const extrusion = (id: string, filter: ExpressionSpecification, opacity: number): FillExtrusionLayerSpecification => ({
  id,
  type: "fill-extrusion",
  source: VOLUMES_SOURCE,
  minzoom: FOOTPRINT_MIN_ZOOM,
  filter,
  paint: {
    "fill-extrusion-color": VOLUME_COLOR,
    "fill-extrusion-height": ["get", "heightM"],
    "fill-extrusion-base": ["get", "baseM"],
    "fill-extrusion-opacity": opacity,
    "fill-extrusion-vertical-gradient": true,
  },
});

/** Generated volume (footprint known): cells, firewalls, docks. */
export const VOLUME_SOLID_LAYER = extrusion(LAYER.volumeSolid, ["all", ["!", APPROXIMATE], ["!=", PART, "edge"]], 0.92);
/** Approximate volume (no footprint): translucent, only its parapets stay solid (wireframe look). */
export const VOLUME_APPROX_LAYER = extrusion(LAYER.volumeApprox, ["all", APPROXIMATE, ["!=", PART, "edge"]], 0.22);
/** Roof edges (parapets) of every cell: the fine lines of the roofs. */
export const VOLUME_EDGES_LAYER = extrusion(LAYER.volumeEdges, ["==", PART, "edge"], 0.95);

/** Ground edge of the footprint, in the site's status color. */
export const FOOTPRINT_EDGE_LAYER: LineLayerSpecification = {
  id: LAYER.footprintEdge,
  type: "line",
  source: FOOTPRINTS_SOURCE,
  minzoom: FOOTPRINT_MIN_ZOOM,
  filter: ["!", APPROXIMATE],
  paint: {
    "line-color": ["case", ["boolean", ["feature-state", "selected"], false], ACCENT, statusColor(STATUS)],
    "line-width": 2,
    "line-opacity": 0.9,
  },
};

/** Ground edge of an approximate footprint: same colors, dashed. */
export const FOOTPRINT_EDGE_APPROX_LAYER: LineLayerSpecification = {
  ...FOOTPRINT_EDGE_LAYER,
  id: LAYER.footprintEdgeApprox,
  filter: APPROXIMATE,
  paint: { ...FOOTPRINT_EDGE_LAYER.paint, "line-dasharray": [2, 2] },
};

/** Site layers in drawing order (bottom → top). */
export const SITE_LAYERS = [FOOTPRINT_EDGE_LAYER, FOOTPRINT_EDGE_APPROX_LAYER, VOLUME_SOLID_LAYER, VOLUME_APPROX_LAYER, VOLUME_EDGES_LAYER, CLUSTERS_LAYER, HALO_LAYER, POINTS_LAYER, SELECTED_LAYER] as const;
