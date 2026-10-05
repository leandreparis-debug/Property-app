import { fromMercator, mercatorScale, type Point } from "./mercator";

/**
 * 2-D affine transformation [a, b, c, d, e, f]:
 * X = a·x + b·y + c ; Y = d·x + e·y + f.
 */
export type Affine = readonly [number, number, number, number, number, number];

/** A control point: pixel of the plan ↔ Web Mercator coordinate (metres). */
export interface ControlPoint {
  pixel: Point;
  mercator: Point;
}

/** Result of {@link solveAffine}. */
export interface AffineSolution {
  matrix: Affine;
  /** Root-mean-square error, in GROUND metres. */
  rmsErrorM: number;
  /** Error of each point, in ground metres (same order). */
  errorsM: number[];
  /** Rotation of the plan's x axis, degrees (counter-clockwise from east). */
  rotationDeg: number;
  /** Mean scale, Mercator metres per pixel (√|det|). */
  scale: number;
}

/** Raised when the points cannot define a transformation. */
export class DegenerateControlPointsError extends Error {
  constructor(message = "Points de contrôle alignés ou confondus : choisissez au moins 3 points non alignés, éloignés les uns des autres.") {
    super(message);
    this.name = "DegenerateControlPointsError";
  }
}

/**
 * Applies an affine transformation.
 * @param m - Matrix.
 * @param p - Point.
 */
export function applyAffine(m: Affine, [x, y]: Point): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

/**
 * Inverse transformation.
 * @param m - Matrix (invertible).
 * @throws {DegenerateControlPointsError} When the matrix is singular.
 */
export function invertAffine(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * e - b * d;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new DegenerateControlPointsError("Transformation non inversible.");
  return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det];
}

/** Solves the 3×3 system M·x = v (Cramer). */
function solve3(m: number[][], v: number[]): [number, number, number] | null {
  const det = (k: number[][]) =>
    k[0]![0]! * (k[1]![1]! * k[2]![2]! - k[1]![2]! * k[2]![1]!) - k[0]![1]! * (k[1]![0]! * k[2]![2]! - k[1]![2]! * k[2]![0]!) + k[0]![2]! * (k[1]![0]! * k[2]![1]! - k[1]![1]! * k[2]![0]!);
  const d = det(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  const col = (i: number) => m.map((row, r) => row.map((x, c) => (c === i ? v[r]! : x)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

/**
 * Affine transformation plan pixel → Web Mercator by least squares.
 * With exactly 3 points the fit is exact (zero error); with more, the error
 * of each point measures the consistency of the calibration.
 *
 * @param points - At least 3 control points, not aligned.
 * @returns Matrix, RMS and per-point errors in GROUND metres, rotation, scale.
 * @throws {DegenerateControlPointsError} Fewer than 3 points, or aligned / duplicate points.
 */
export function solveAffine(points: readonly ControlPoint[]): AffineSolution {
  if (points.length < 3) throw new DegenerateControlPointsError("Au moins 3 points de contrôle sont nécessaires.");
  // Centre the pixels (numerical stability), then solve the normal equations.
  const mx = points.reduce((s, p) => s + p.pixel[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p.pixel[1], 0) / points.length;
  const X = points.reduce((s, p) => s + p.mercator[0], 0) / points.length;
  const Y = points.reduce((s, p) => s + p.mercator[1], 0) / points.length;
  let sxx = 0, sxy = 0, syy = 0, sxX = 0, syX = 0, sxY = 0, syY = 0;
  for (const p of points) {
    const x = p.pixel[0] - mx;
    const y = p.pixel[1] - my;
    const u = p.mercator[0] - X;
    const v = p.mercator[1] - Y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxX += x * u;
    syX += y * u;
    sxY += x * v;
    syY += y * v;
  }
  // Aligned pixels: the covariance matrix is (nearly) singular.
  const spread = sxx + syy;
  if (spread === 0 || (sxx * syy - sxy * sxy) / (spread * spread) < 1e-6) throw new DegenerateControlPointsError();
  const normal = [
    [sxx, sxy, 0],
    [sxy, syy, 0],
    [0, 0, points.length],
  ];
  const rowX = solve3(normal, [sxX, syX, 0]);
  const rowY = solve3(normal, [sxY, syY, 0]);
  if (!rowX || !rowY) throw new DegenerateControlPointsError();
  const [a, b] = rowX;
  const [d, e] = rowY;
  const det = a * e - b * d;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new DegenerateControlPointsError("Les points de la carte sont alignés ou confondus.");
  const matrix: Affine = [a, b, X - a * mx - b * my, d, e, Y - d * mx - e * my];
  const errorsM = points.map((p) => {
    const [px, py] = applyAffine(matrix, p.pixel);
    const lat = fromMercator(p.mercator)[1];
    return Math.hypot(px - p.mercator[0], py - p.mercator[1]) / mercatorScale(lat);
  });
  const rmsErrorM = Math.sqrt(errorsM.reduce((s, e2) => s + e2 * e2, 0) / errorsM.length);
  return { matrix, rmsErrorM, errorsM, rotationDeg: (Math.atan2(d, a) * 180) / Math.PI, scale: Math.sqrt(Math.abs(det)) };
}
