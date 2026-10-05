import { cross, signedArea } from "./hull";
import type { Point } from "./mercator";

/** A ring: vertices WITHOUT the closing point. */
export type Ring = [number, number][];
/** A polygon: outer ring then holes. */
export type PolygonRings = Ring[];

/** Removes the closing point of a GeoJSON ring (first = last). */
export function openRing(ring: readonly Point[]): Ring {
  const out = ring.map((p) => [p[0], p[1]] as [number, number]);
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

/** Closes a ring for GeoJSON (first point repeated at the end). */
export function closeRing(ring: Ring): Ring {
  return ring.length ? [...ring, [ring[0]![0], ring[0]![1]]] : ring;
}

function intersect(a: Point, b: Point, c: Point, d: Point): [number, number] {
  // Intersection of segment ab with the infinite line cd.
  const a1 = d[1] - c[1];
  const b1 = c[0] - d[0];
  const c1 = a1 * c[0] + b1 * c[1];
  const a2 = b[1] - a[1];
  const b2 = a[0] - b[0];
  const c2 = a2 * a[0] + b2 * a[1];
  const det = a1 * b2 - a2 * b1;
  if (det === 0) return [b[0], b[1]];
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/**
 * Sutherland–Hodgman: clips a ring (any shape) by a CONVEX ring. The subject
 * may be concave; the result may then contain zero-width bridges, harmless
 * for display and for the area.
 * @param subject - Ring to clip (open).
 * @param clipper - Convex ring (open, either orientation).
 * @returns The clipped ring (open), possibly empty.
 */
export function clipRing(subject: readonly Point[], clipper: readonly Point[]): Ring {
  const convex = signedArea(clipper) < 0 ? [...clipper].reverse() : [...clipper];
  let output: Ring = subject.map((p) => [p[0], p[1]] as [number, number]);
  for (let i = 0; i < convex.length && output.length; i++) {
    const c = convex[i]!;
    const d = convex[(i + 1) % convex.length]!;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const pIn = cross(c, d, p) >= 0;
      const qIn = cross(c, d, q) >= 0;
      if (pIn) {
        output.push(p);
        if (!qIn) output.push(intersect(p, q, c, d));
      } else if (qIn) {
        output.push(intersect(p, q, c, d));
      }
    }
  }
  return Math.abs(signedArea(output)) > 1e-9 ? output : [];
}

/**
 * Clips a polygon with holes, or a multipolygon, by a convex ring.
 * @param polygons - Polygons (outer ring then holes, open rings).
 * @param clipper - Convex ring.
 * @returns The non-empty clipped polygons.
 */
export function clipPolygons(polygons: readonly PolygonRings[], clipper: readonly Point[]): PolygonRings[] {
  const out: PolygonRings[] = [];
  for (const [outer, ...holes] of polygons) {
    if (!outer) continue;
    const clipped = clipRing(outer, clipper);
    if (!clipped.length) continue;
    out.push([clipped, ...holes.map((h) => clipRing(h, clipper)).filter((h) => h.length)]);
  }
  return out;
}

/** Area of polygons (holes subtracted), in the unit² of the coordinates. */
export function polygonsArea(polygons: readonly PolygonRings[]): number {
  return polygons.reduce((sum, [outer, ...holes]) => sum + Math.abs(signedArea(outer ?? [])) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0), 0);
}
