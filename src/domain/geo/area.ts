/**
 * Geodesic area of a GeoJSON footprint (WGS 84), pure.
 *
 * Spherical-excess formula of Chamberlain & Duquette (« Some algorithms for
 * polygons on a sphere », JPL 2007) on the authalic sphere (same total area
 * as the WGS 84 ellipsoid). For a building-sized polygon in metropolitan
 * France the error against the ellipsoid is well under 1 %.
 */
import type { MultiPolygon, Polygon, Position } from "geojson";

/** Radius of the WGS 84 authalic sphere, in metres. */
export const AUTHALIC_RADIUS_M = 6_371_007.181;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Signed area of a ring (m²); the sign depends on the winding order. */
function ringArea(ring: readonly Position[]): number {
  const n = ring.length;
  if (n < 4) return 0;
  let sum = 0;
  // The ring is closed (first = last): iterate over the n-1 distinct vertices.
  const m = n - 1;
  for (let i = 0; i < m; i++) {
    const prev = ring[(i - 1 + m) % m]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % m]!;
    sum += (rad(next[0]!) - rad(prev[0]!)) * Math.sin(rad(cur[1]!));
  }
  return (sum * AUTHALIC_RADIUS_M * AUTHALIC_RADIUS_M) / 2;
}

function polygonArea(rings: readonly (readonly Position[])[]): number {
  const [outer, ...holes] = rings;
  if (!outer) return 0;
  return Math.max(0, Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0));
}

/**
 * Geodesic area of a footprint, holes subtracted.
 * @param geometry - Polygon or MultiPolygon in WGS 84 (lon, lat).
 * @returns The area in m² (0 for a degenerate geometry).
 */
export function geodesicArea(geometry: Polygon | MultiPolygon): number {
  if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
  return geometry.coordinates.reduce((s, p) => s + polygonArea(p), 0);
}
