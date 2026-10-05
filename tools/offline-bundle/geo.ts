/**
 * Pure geometry helpers of the offline-bundle tool (WGS 84, lon/lat order as
 * in GeoJSON). Precision is that of a local spherical approximation, largely
 * enough for building-scale comparisons (a few metres to a few kilometres).
 */
import type { Footprint } from "../../src/domain/enrichment-format";

/** [longitude, latitude]. */
export type LonLat = readonly [number, number];

/** Mean Earth radius (m), IUGG. */
export const EARTH_RADIUS_M = 6_371_008.8;

const RAD = Math.PI / 180;

/**
 * Great-circle distance (haversine formula).
 * @returns Distance in metres.
 */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bounding box (west, south, east, north) of a circle around a point.
 * @param center - Centre.
 * @param radiusM - Radius in metres.
 */
export function bboxAround(center: LonLat, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / (EARTH_RADIUS_M * RAD);
  const dLon = dLat / Math.max(Math.cos(center[1] * RAD), 1e-6);
  return [center[0] - dLon, center[1] - dLat, center[0] + dLon, center[1] + dLat];
}

/** Ray casting on one ring (boundary counted as inside is not guaranteed). */
function inRing(point: LonLat, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygons of a footprint (a Polygon is a one-element MultiPolygon). */
export function polygonsOf(geometry: Footprint): number[][][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * Point-in-polygon test (holes excluded), Polygon or MultiPolygon.
 */
export function pointInFootprint(point: LonLat, geometry: Footprint): boolean {
  return polygonsOf(geometry).some(
    (polygon) => polygon[0] !== undefined && inRing(point, polygon[0]) && !polygon.slice(1).some((hole) => inRing(point, hole)),
  );
}

/** Planar area of one ring projected around its first vertex (m², unsigned). */
function ringAreaM2(ring: readonly (readonly number[])[]): number {
  const origin = ring[0];
  if (!origin || ring.length < 4) return 0;
  const [lon0, lat0] = origin as [number, number];
  const kx = EARTH_RADIUS_M * RAD * Math.cos(lat0 * RAD);
  const ky = EARTH_RADIUS_M * RAD;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    sum += (x1 - lon0) * kx * ((y2 - lat0) * ky) - (x2 - lon0) * kx * ((y1 - lat0) * ky);
  }
  return Math.abs(sum) / 2;
}

/**
 * Area of a footprint in m² (outer rings minus holes), local equirectangular
 * projection — error below 0.1 % at building scale.
 */
export function footprintAreaM2(geometry: Footprint): number {
  let total = 0;
  for (const polygon of polygonsOf(geometry)) {
    const [outer, ...holes] = polygon;
    if (!outer) continue;
    total += ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
  }
  return Math.max(0, total);
}

/** Vertex average of the outer rings (good enough as a label/distance anchor). */
export function footprintCentroid(geometry: Footprint): LonLat {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const polygon of polygonsOf(geometry)) {
    const outer = polygon[0] ?? [];
    for (const p of outer.slice(0, -1)) {
      x += p[0] ?? 0;
      y += p[1] ?? 0;
      n++;
    }
  }
  return n === 0 ? [0, 0] : [x / n, y / n];
}

/**
 * Distance from a point to a footprint: 0 inside, else the distance to the
 * nearest vertex (upper bound, sufficient for the 200 m / 1 km thresholds).
 */
export function distanceToFootprintM(point: LonLat, geometry: Footprint): number {
  if (pointInFootprint(point, geometry)) return 0;
  let best = Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const p of polygon[0] ?? []) best = Math.min(best, haversineMeters(point, [p[0] ?? 0, p[1] ?? 0]));
  }
  return best;
}

/**
 * Normalised name for fuzzy comparison: lower case, no accents, no legal forms
 * or punctuation.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sas|sasu|sa|sarl|snc|sci|eurl|ste|societe|et|de|du|des|la|le|les|l|d)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Similarity of two names (0–1): Dice coefficient on character bigrams of the
 * normalised names; 1 when one normalised name contains the other.
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    const t = s.replace(/ /g, "");
    for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  let common = 0;
  let total = 0;
  for (const [k, v] of bx) {
    common += Math.min(v, by.get(k) ?? 0);
    total += v;
  }
  for (const v of by.values()) total += v;
  return total === 0 ? 0 : (2 * common) / total;
}
