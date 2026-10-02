/**
 * Automatic 3D volume of a warehouse, generated from the building data
 * (footprint, height, cells, docks). Pure and fast (< 5 ms per site): run by
 * the server for the map and the Plan tab.
 *
 * Every computation is done in Web Mercator metres around the site; ground
 * dimensions (dock size, firewall width) are converted with the local scale.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import {
  clipPolygons,
  closeRing,
  fromMercator,
  mercatorScale,
  openRing,
  orientedBoundingBox,
  signedArea,
  toMercator,
  type OrientedBox,
  type PolygonRings,
  type Ring,
} from "../geometry";

/** Height used when no height is known (m). */
export const DEFAULT_VOLUME_HEIGHT_M = 12;
/** Width of the firewall between two cells, in ground metres. */
export const FIREWALL_WIDTH_M = 0.6;
/** Firewalls rise above the roof by this height (m). */
export const FIREWALL_RISE_M = 1;
/** Dock volume: width along the facade, depth outward, height (ground metres). */
export const DOCK_SIZE_M = { width: 3.5, depth: 1.5, height: 4.5 } as const;
/** Minimum spacing of two docks along the facade (m): width + a small gap. */
export const DOCK_PITCH_M = 3.6;
/** At most this many docks are drawn. */
export const MAX_DOCKS = 120;
/** Width and rise of the roof edge (parapet) that outlines each cell (m). */
export const ROOF_EDGE_M = { width: 0.35, rise: 0.4 } as const;
/** Largest number of cells drawn (a warehouse has rarely more than 20). */
export const MAX_CELLS = 60;

/** Long side of the oriented rectangle carrying the docks. */
export type DockSide = "a" | "b";

/** Part of a volume. `edge` = parapet outlining the roof of a cell. */
export type VolumePart = "cell" | "firewall" | "dock" | "edge";

/** Properties of a volume feature (no financial field). */
export interface VolumePartProperties {
  part: VolumePart;
  /** 0-based index within its part (cell number, dock number…). */
  index: number;
  /** Top of the extrusion (m). */
  heightM: number;
  /** Bottom of the extrusion (m). */
  baseM: number;
}

/** Input of {@link buildBuildingVolume}. */
export interface VolumeInput {
  /** Footprint of `SiteGeometry` (WGS 84), or null. */
  footprint: Polygon | MultiPolygon | null;
  /** Building height (SiteTechnical, else SiteGeometry), or null. */
  heightM: number | null;
  cellCount: number | null;
  dockCount: number | null;
  dockSide: DockSide;
  /** Reference area (m²) used for the approximate rectangle, or null. */
  referenceArea: number | null;
  /** Site coordinates, center of the approximate rectangle, or null. */
  center: { lon: number; lat: number } | null;
}

/** Metadata of a generated volume. */
export interface VolumeMeta {
  /** No footprint: 2:1 east-west rectangle of the reference area. */
  approximate: boolean;
  heightM: number;
  heightEstimated: boolean;
  /** Cells actually generated. */
  cells: number;
  /** Docks actually generated (capped to {@link MAX_DOCKS} and to what fits). */
  docks: number;
  firewalls: number;
  dockSide: DockSide;
  /** Angle of the long axis from east (degrees, [0, 180)). */
  axisAngleDeg: number;
  /** Long and short sides of the oriented rectangle, in ground metres. */
  lengthM: number;
  widthM: number;
}

/** A generated volume. */
export interface BuildingVolume {
  /** Ground footprint (the real one, or the approximate rectangle). */
  footprint: Polygon | MultiPolygon;
  parts: FeatureCollection<Polygon | MultiPolygon, VolumePartProperties>;
  meta: VolumeMeta;
}

/** Positions rounded to 1e-7° (≈ 1 cm): smaller payload, stable output. */
const round = (v: number) => Math.round(v * 1e7) / 1e7;
const toLonLat = (p: readonly [number, number]): Position => {
  const [lon, lat] = fromMercator(p);
  return [round(lon), round(lat)];
};

function ringsToGeo(polygons: readonly PolygonRings[]): Polygon | MultiPolygon {
  const coords = polygons.map((rings) => rings.map((r) => closeRing(r).map(toLonLat)));
  return coords.length === 1 ? { type: "Polygon", coordinates: coords[0]! } : { type: "MultiPolygon", coordinates: coords };
}

function footprintToMercator(g: Polygon | MultiPolygon): PolygonRings[] {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys
    .map((rings) => rings.map((r) => openRing(r.map((p) => toMercator([p[0]!, p[1]!])))).filter((r) => r.length >= 3))
    .filter((rings) => rings.length > 0);
}

/** Rectangle of the oriented box between abscissas s0 and s1 along the axis, and ordinates t0, t1 across. */
function band(box: OrientedBox, s0: number, s1: number, t0: number, t1: number): Ring {
  const at = (s: number, t: number): [number, number] => [
    box.center[0] + s * box.axis[0] + t * box.normal[0],
    box.center[1] + s * box.axis[1] + t * box.normal[1],
  ];
  return [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
}

/** Thin quads along every edge of a ring, on its inner side: the parapet. */
function parapet(ring: Ring, width: number): PolygonRings[] {
  const ccw = signedArea(ring) >= 0;
  const out: PolygonRings[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < width) continue;
    // Inner normal: left of the edge for a counter-clockwise ring.
    const nx = ((ccw ? -dy : dy) / len) * width;
    const ny = ((ccw ? dx : -dx) / len) * width;
    out.push([[p, q, [q[0] + nx, q[1] + ny], [p[0] + nx, p[1] + ny]]]);
  }
  return out;
}

/** Approximate footprint: 2:1 east-west rectangle of `area` ground m², around `center`. */
function approximateRectangle(area: number, center: { lon: number; lat: number }): PolygonRings[] {
  const k = mercatorScale(center.lat);
  const halfL = (Math.sqrt(2 * area) / 2) * k;
  const halfW = (Math.sqrt(area / 2) / 2) * k;
  const [cx, cy] = toMercator([center.lon, center.lat]);
  return [[[[cx - halfL, cy - halfW], [cx + halfL, cy - halfW], [cx + halfL, cy + halfW], [cx - halfL, cy + halfW]]]];
}

const positiveInt = (v: number | null, max: number): number => (v !== null && Number.isFinite(v) && v >= 1 ? Math.min(Math.floor(v), max) : 0);

/**
 * Generates the 3D volume of a building.
 *
 * - Footprint: the one of `SiteGeometry`; without it, a 2:1 east-west
 *   rectangle of `referenceArea` centered on the site (`approximate`);
 *   without area either, no volume (`null`).
 * - Cells: the minimum oriented rectangle is cut into `cellCount` equal strips
 *   perpendicular to its long axis, each clipped by the footprint; 0.6 m
 *   firewalls separate them (rising 1 m above the roof). One cell when
 *   `cellCount` is missing or ≤ 1.
 * - Docks: `dockCount` boxes (3.5 × 1.5 × 4.5 m) evenly spread along the long
 *   side `dockSide` of the rectangle, outside of it; at most 120, and no more
 *   than fit on the facade.
 * - Height: `heightM`, else 12 m (`heightEstimated`).
 * @param input - Building data.
 * @returns The volume, or `null` without footprint and without area/center.
 */
export function buildBuildingVolume(input: VolumeInput): BuildingVolume | null {
  let polygons = input.footprint ? footprintToMercator(input.footprint) : [];
  let approximate = false;
  if (!polygons.length) {
    if (!input.center || !input.referenceArea || !(input.referenceArea > 0)) return null;
    polygons = approximateRectangle(input.referenceArea, input.center);
    approximate = true;
  }
  const box = orientedBoundingBox(polygons.flatMap((rings) => rings[0] ?? []));
  if (!box) return null;

  const [, lat] = fromMercator(box.center);
  const k = mercatorScale(lat);
  const known = input.heightM !== null && Number.isFinite(input.heightM) && input.heightM > 0;
  const heightM = known ? input.heightM! : DEFAULT_VOLUME_HEIGHT_M;
  const features: Feature<Polygon | MultiPolygon, VolumePartProperties>[] = [];
  const push = (rings: PolygonRings[], props: VolumePartProperties) => {
    if (rings.length) features.push({ type: "Feature", geometry: ringsToGeo(rings), properties: props });
  };

  // Cells and firewalls. `across` exceeds the box so the strips cover the whole footprint.
  const n = Math.max(1, positiveInt(input.cellCount, MAX_CELLS));
  const L = box.length;
  const across = box.width;
  const halfWall = (FIREWALL_WIDTH_M * k) / 2;
  let cells = 0;
  let firewalls = 0;
  for (let i = 0; i < n; i++) {
    const s0 = -L / 2 + (i * L) / n + (i > 0 ? halfWall : 0);
    const s1 = -L / 2 + ((i + 1) * L) / n - (i < n - 1 ? halfWall : 0);
    const cell = clipPolygons(polygons, band(box, s0, s1, -across, across));
    if (!cell.length) continue;
    push(cell, { part: "cell", index: cells, heightM, baseM: 0 });
    push(cell.flatMap((rings) => parapet(rings[0]!, ROOF_EDGE_M.width * k)), { part: "edge", index: cells, heightM: heightM + ROOF_EDGE_M.rise, baseM: heightM });
    cells++;
  }
  for (let i = 1; i < n; i++) {
    const s = -L / 2 + (i * L) / n;
    const wall = clipPolygons(polygons, band(box, s - halfWall, s + halfWall, -across, across));
    if (!wall.length) continue;
    push(wall, { part: "firewall", index: firewalls++, heightM: heightM + FIREWALL_RISE_M, baseM: 0 });
  }

  // Docks, outside the long side a (t = -width/2) or b (t = +width/2).
  const fit = Math.floor(L / k / DOCK_PITCH_M + 1e-6);
  const docks = Math.min(positiveInt(input.dockCount, MAX_DOCKS), fit);
  const sign = input.dockSide === "b" ? 1 : -1;
  const t0 = (sign * box.width) / 2;
  const t1 = t0 + sign * DOCK_SIZE_M.depth * k;
  const halfDock = (DOCK_SIZE_M.width * k) / 2;
  for (let i = 0; i < docks; i++) {
    const s = -L / 2 + ((i + 0.5) * L) / docks;
    push([[band(box, s - halfDock, s + halfDock, Math.min(t0, t1), Math.max(t0, t1))]], { part: "dock", index: i, heightM: DOCK_SIZE_M.height, baseM: 0 });
  }

  return {
    footprint: approximate || !input.footprint ? ringsToGeo(polygons) : input.footprint,
    parts: { type: "FeatureCollection", features },
    meta: {
      approximate,
      heightM,
      heightEstimated: !known,
      cells,
      docks,
      firewalls,
      dockSide: input.dockSide,
      axisAngleDeg: box.angleDeg,
      lengthM: L / k,
      widthM: box.width / k,
    },
  };
}
