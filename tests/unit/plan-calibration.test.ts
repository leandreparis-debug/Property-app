import { describe, expect, it } from "vitest";
import { fromMercator, mercatorScale, toMercator } from "@/domain/geometry";
import {
  calibrationQuality,
  controlPointsSchema,
  imageCorners,
  lngLatToPixel,
  parseStoredCalibration,
  pixelToLngLat,
  solveCalibration,
  type PlanControlPoint,
} from "@/domain/plan/calibration";

// A plan of 1 000 × 600 px at 0.2 m/px, north up, top-left corner at (4.9, 45.7).
const origin = toMercator([4.9, 45.7]);
const k = mercatorScale(45.7);
const truth = ([x, y]: [number, number]): [number, number] => fromMercator([origin[0] + x * 0.2 * k, origin[1] - y * 0.2 * k]);
const pts = (pixels: [number, number][]): PlanControlPoint[] => pixels.map((pixel) => ({ pixel, lngLat: truth(pixel) }));

describe("plan calibration", () => {
  it("quality thresholds: < 1 m precise, 1–3 m acceptable, > 3 m to check", () => {
    expect(calibrationQuality(0.4)).toBe("precise");
    expect(calibrationQuality(1)).toBe("acceptable");
    expect(calibrationQuality(3)).toBe("acceptable");
    expect(calibrationQuality(3.1)).toBe("check");
  });

  it("4 exact points: precise; corners and round trips", () => {
    const c = solveCalibration(pts([[0, 0], [1000, 0], [1000, 600], [0, 600]]));
    expect(c.rmsErrorM).toBeLessThan(0.01);
    expect(c.quality).toBe("precise");
    expect(c.suspect).toEqual([]);
    expect(c.rotationDeg).toBeCloseTo(0, 3);
    const corners = imageCorners(c.matrix, 1000, 600);
    expect(corners[0][0]).toBeCloseTo(4.9, 7);
    expect(corners[0][1]).toBeCloseTo(45.7, 7);
    expect(corners[2][1]).toBeLessThan(45.7); // bottom is south
    const p = lngLatToPixel(c.matrix, pixelToLngLat(c.matrix, [321, 123]));
    expect(p[0]).toBeCloseTo(321, 5);
    expect(p[1]).toBeCloseTo(123, 5);
  });

  it("one wrong point among 6 is flagged as suspect", () => {
    const points = pts([[0, 0], [1000, 0], [1000, 600], [0, 600], [500, 300], [250, 450]]);
    const [lon, lat] = points[4]!.lngLat;
    points[4] = { ...points[4]!, lngLat: fromMercator([toMercator([lon, lat])[0] + 25 * k, toMercator([lon, lat])[1]]) };
    const c = solveCalibration(points);
    expect(c.suspect).toEqual([4]);
    expect(c.quality).toBe("check");
  });

  it("schema: 3 points minimum, finite numbers, latitude bounds; stored values parsed", () => {
    expect(controlPointsSchema.safeParse(pts([[0, 0], [1, 0]])).success).toBe(false);
    expect(controlPointsSchema.safeParse([...pts([[0, 0], [1, 0]]), { pixel: [Number.NaN, 0], lngLat: [4.9, 45.7] }]).success).toBe(false);
    expect(controlPointsSchema.safeParse([...pts([[0, 0], [1, 0]]), { pixel: [0, 0], lngLat: [4.9, 89] }]).success).toBe(false);
    const points = pts([[0, 0], [1000, 0], [0, 600]]);
    const { matrix } = solveCalibration(points);
    const parsed = parseStoredCalibration(JSON.stringify(points), JSON.stringify({ matrix }));
    expect(parsed?.matrix).toEqual(matrix);
    expect(parseStoredCalibration("{bad", "{}")).toBeNull();
    expect(parseStoredCalibration(null, null)).toBeNull();
  });
});
