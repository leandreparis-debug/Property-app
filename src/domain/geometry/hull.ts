import type { Point } from "./mercator";

/** z component of (b − a) × (c − a): > 0 for a left (counter-clockwise) turn. */
export function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * Convex hull (Andrew's monotone chain), O(n log n).
 * Duplicate and collinear points are removed; the hull is returned
 * counter-clockwise, without repeating the first point.
 * @param points - Any points (at least one).
 * @returns The hull vertices (1 or 2 points for degenerate inputs).
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const unique = sorted.filter((p, i) => i === 0 || p[0] !== sorted[i - 1]![0] || p[1] !== sorted[i - 1]![1]);
  if (unique.length < 3) return unique;
  const lower: Point[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Signed area of a ring (shoelace formula): > 0 when counter-clockwise.
 * @param ring - Vertices, closed or not.
 */
export function signedArea(ring: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
