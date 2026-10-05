/**
 * Calibration of a plan image (pure): control points (plan pixel ↔ map
 * position), affine transform pixel → Web Mercator, quality of the fit,
 * image corners for the MapLibre `image` source, and conversions used to
 * place equipments on the plan.
 */
import { z } from "zod";
import { applyAffine, fromMercator, invertAffine, mercatorScale, solveAffine, toMercator, type Affine, type AffineSolution } from "../geometry";

/** A control point: pixel of the plan (x right, y down) and [lon, lat]. */
export interface PlanControlPoint {
  pixel: [number, number];
  lngLat: [number, number];
}

/** Minimum number of points; 4 to 6 are recommended. */
export const MIN_CONTROL_POINTS = 3;
export const RECOMMENDED_CONTROL_POINTS = 4;
/** At most this many points are stored. */
export const MAX_CONTROL_POINTS = 20;

const finite = z.number().refine(Number.isFinite, { error: "Valeur numérique attendue." });

/** zod schema of the control points (stored in `control_points_json`). */
export const controlPointsSchema = z
  .array(
    z.object({
      pixel: z.tuple([finite, finite]),
      lngLat: z.tuple([finite.refine((v) => Math.abs(v) <= 180, { error: "Longitude invalide." }), finite.refine((v) => Math.abs(v) <= 85, { error: "Latitude invalide." })]),
    }),
  )
  .min(MIN_CONTROL_POINTS, { error: "Au moins 3 points de contrôle sont nécessaires." })
  .max(MAX_CONTROL_POINTS, { error: `${MAX_CONTROL_POINTS} points de contrôle au maximum.` });

/** zod schema of `transform_json`. */
export const transformSchema = z.object({ matrix: z.tuple([finite, finite, finite, finite, finite, finite]) });

/** Quality of a calibration from its RMS error. */
export type CalibrationQuality = "precise" | "acceptable" | "check";

/** Thresholds of {@link calibrationQuality} (m). */
export const QUALITY_THRESHOLDS_M = { precise: 1, acceptable: 3 } as const;

/** French labels of the qualities. */
export const QUALITY_LABELS: Readonly<Record<CalibrationQuality, string>> = {
  precise: "Calibration précise",
  acceptable: "Acceptable",
  check: "Vérifiez les points",
};

/**
 * Quality of a calibration: < 1 m precise, 1–3 m acceptable, > 3 m to check.
 * @param rmsErrorM - RMS error in ground metres.
 */
export function calibrationQuality(rmsErrorM: number): CalibrationQuality {
  if (rmsErrorM < QUALITY_THRESHOLDS_M.precise) return "precise";
  if (rmsErrorM <= QUALITY_THRESHOLDS_M.acceptable) return "acceptable";
  return "check";
}

/** Result of {@link solveCalibration}. */
export interface Calibration extends AffineSolution {
  /** Indexes of the points whose error exceeds twice the mean error. */
  suspect: number[];
  quality: CalibrationQuality;
}

/**
 * Solves the calibration of control points (least squares, errors in ground
 * metres at the points' latitude).
 * @param points - At least 3 control points, not aligned.
 * @throws {DegenerateControlPointsError} With fewer than 3 or aligned points.
 */
export function solveCalibration(points: readonly PlanControlPoint[]): Calibration {
  const solution = solveAffine(points.map((p) => ({ pixel: p.pixel, mercator: toMercator(p.lngLat) })));
  const mean = solution.errorsM.reduce((s, e) => s + e, 0) / (solution.errorsM.length || 1);
  const suspect = mean > 0.05 ? solution.errorsM.flatMap((e, i) => (e > 2 * mean ? [i] : [])) : [];
  return { ...solution, suspect, quality: calibrationQuality(solution.rmsErrorM) };
}

/**
 * Plan pixel → [lon, lat].
 * @param matrix - Transform pixel → Mercator.
 * @param pixel - Plan pixel.
 */
export function pixelToLngLat(matrix: Affine, pixel: readonly [number, number]): [number, number] {
  return fromMercator(applyAffine(matrix, pixel));
}

/**
 * [lon, lat] → plan pixel (inverse transform).
 * @param matrix - Transform pixel → Mercator.
 * @param lngLat - Position.
 */
export function lngLatToPixel(matrix: Affine, lngLat: readonly [number, number]): [number, number] {
  return applyAffine(invertAffine(matrix), toMercator(lngLat));
}

/**
 * The four corners of the image, in the order of the MapLibre `image` source
 * (top-left, top-right, bottom-right, bottom-left), as [lon, lat].
 * @param matrix - Transform pixel → Mercator.
 * @param width - Image width (px).
 * @param height - Image height (px).
 */
export function imageCorners(matrix: Affine, width: number, height: number): [[number, number], [number, number], [number, number], [number, number]] {
  return [pixelToLngLat(matrix, [0, 0]), pixelToLngLat(matrix, [width, 0]), pixelToLngLat(matrix, [width, height]), pixelToLngLat(matrix, [0, height])];
}

/**
 * Moves a position by a ground offset (keyboard moves: 0.5 m, 5 m with Shift).
 * @param lngLat - Start position.
 * @param eastM - Offset towards the east (m).
 * @param northM - Offset towards the north (m).
 */
export function offsetLngLat(lngLat: readonly [number, number], eastM: number, northM: number): [number, number] {
  const k = mercatorScale(lngLat[1]);
  const [x, y] = toMercator(lngLat);
  return fromMercator([x + eastM * k, y + northM * k]);
}

/**
 * Parses stored control points and transform (null when missing or invalid).
 * @param controlPointsJson - `control_points_json`.
 * @param transformJson - `transform_json`.
 */
export function parseStoredCalibration(controlPointsJson: string | null, transformJson: string | null): { points: PlanControlPoint[]; matrix: Affine } | null {
  if (!controlPointsJson || !transformJson) return null;
  try {
    const points = controlPointsSchema.safeParse(JSON.parse(controlPointsJson));
    const transform = transformSchema.safeParse(JSON.parse(transformJson));
    return points.success && transform.success ? { points: points.data, matrix: transform.data.matrix } : null;
  } catch {
    return null;
  }
}
