import { convexHull } from "./hull";
import type { Point } from "./mercator";

/** Minimum-area oriented bounding rectangle. */
export interface OrientedBox {
  center: [number, number];
  /** Unit vector of the long axis. */
  axis: [number, number];
  /** Unit vector of the short axis (axis rotated by +90°). */
  normal: [number, number];
  /** Length of the long side. */
  length: number;
  /** Length of the short side. */
  width: number;
  /** Angle of the long axis from the x axis (east), in degrees, in [0, 180). */
  angleDeg: number;
  /** The four corners, counter-clockwise: long side « a » is corners[0]→corners[1]. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Minimum-area oriented bounding rectangle (rotating calipers): the optimal
 * rectangle has a side collinear with an edge of the convex hull, so every
 * hull edge direction is tried.
 * @param points - Points (e.g. every vertex of a footprint), in metres.
 * @returns The rectangle, or `null` with fewer than 3 non-collinear points.
 */
export function orientedBoundingBox(points: readonly Point[]): OrientedBox | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best: { area: number; ux: number; uy: number; minU: number; maxU: number; minV: number; maxV: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uy;
      const v = -p[0] * uy + p[1] * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area - 1e-9) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  if (!best) return null;
  let { ux, uy } = best;
  let du = best.maxU - best.minU;
  let dv = best.maxV - best.minV;
  let cu = (best.maxU + best.minU) / 2;
  let cv = (best.maxV + best.minV) / 2;
  // Express the rectangle with its LONG side along `axis`.
  if (dv > du) {
    [ux, uy] = [-uy, ux];
    [du, dv] = [dv, du];
    [cu, cv] = [cv, -cu];
  }
  // Canonical direction: angle in [0, 180).
  if (uy < 0 || (uy === 0 && ux < 0)) {
    ux = -ux;
    uy = -uy;
    cu = -cu;
    cv = -cv;
  }
  const center: [number, number] = [cu * ux - cv * uy, cu * uy + cv * ux];
  const axis: [number, number] = [ux, uy];
  const normal: [number, number] = [-uy, ux];
  const at = (s: number, t: number): [number, number] => [center[0] + (s * du * ux) / 2 + (t * dv * normal[0]) / 2, center[1] + (s * du * uy) / 2 + (t * dv * normal[1]) / 2];
  return {
    center,
    axis,
    normal,
    length: du,
    width: dv,
    angleDeg: ((Math.atan2(uy, ux) * 180) / Math.PI + 180) % 180,
    corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
  };
}
