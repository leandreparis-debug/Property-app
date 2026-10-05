import { describe, expect, it } from "vitest";
import {
  applyAffine,
  clipPolygons,
  convexHull,
  DegenerateControlPointsError,
  fromMercator,
  invertAffine,
  mercatorScale,
  orientedBoundingBox,
  polygonsArea,
  signedArea,
  solveAffine,
  toMercator,
  type ControlPoint,
  type Point,
} from "@/domain/geometry";

const rotate = ([x, y]: Point, deg: number, [cx, cy]: Point = [0, 0]): [number, number] => {
  const r = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
};

describe("Web Mercator", () => {
  it("round trip lon/lat → metres → lon/lat", () => {
    for (const p of [[2.35, 48.85], [-4.48, 48.39], [7.75, 43.7], [0, 0], [3.06, 50.63]] as const) {
      const [lon, lat] = fromMercator(toMercator(p));
      expect(lon).toBeCloseTo(p[0], 10);
      expect(lat).toBeCloseTo(p[1], 10);
    }
    const [x0, y0] = toMercator([0, 0]);
    expect(x0).toBeCloseTo(0, 6);
    expect(y0).toBeCloseTo(0, 6);
    expect(mercatorScale(60)).toBeCloseTo(2, 10);
  });
});

describe("convexHull", () => {
  it("removes interior, collinear and duplicate points; counter-clockwise", () => {
    const hull = convexHull([[0, 0], [2, 0], [1, 0], [2, 2], [0, 2], [1, 1], [0, 0], [2, 2], [0, 1]]);
    expect(hull).toHaveLength(4);
    expect(new Set(hull.map((p) => p.join(",")))).toEqual(new Set(["0,0", "2,0", "2,2", "0,2"]));
    expect(signedArea(hull)).toBeCloseTo(4);
  });

  it("degenerate inputs: collinear points only, a single point", () => {
    expect(convexHull([[0, 0], [1, 1], [2, 2], [3, 3]]).length).toBeLessThan(3);
    expect(convexHull([[5, 5], [5, 5]]).length).toBeLessThan(3);
    expect(orientedBoundingBox([[0, 0], [1, 1], [2, 2]])).toBeNull();
  });
});

describe("orientedBoundingBox", () => {
  it("finds a 200 × 80 rectangle rotated by 30° (angle and sides to 0.1)", () => {
    const rect: Point[] = [[-100, -40], [100, -40], [100, 40], [-100, 40]];
    const center: Point = [652_000, 6_862_000];
    const pts = rect.map((p) => rotate([p[0] + center[0], p[1] + center[1]], 30, center));
    // Interior points must not change anything.
    const box = orientedBoundingBox([...pts, center, rotate([center[0] + 50, center[1]], 30, center)])!;
    expect(box.angleDeg).toBeCloseTo(30, 1);
    expect(box.length).toBeCloseTo(200, 1);
    expect(box.width).toBeCloseTo(80, 1);
    expect(box.center[0]).toBeCloseTo(center[0], 1);
    expect(box.center[1]).toBeCloseTo(center[1], 1);
    expect(Math.hypot(...box.axis)).toBeCloseTo(1, 10);
    expect(signedArea(box.corners)).toBeCloseTo(16_000, 1); // counter-clockwise
  });

  it("the long axis is always the axis, angle in [0, 180)", () => {
    const tall = orientedBoundingBox([[0, 0], [10, 0], [10, 100], [0, 100]])!;
    expect(tall.angleDeg).toBeCloseTo(90, 6);
    expect(tall.length).toBeCloseTo(100);
    expect(tall.width).toBeCloseTo(10);
    const tilted = orientedBoundingBox(([[0, 0], [100, 0], [100, 10], [0, 10]] as Point[]).map((p) => rotate(p, 150)))!;
    expect(tilted.angleDeg).toBeCloseTo(150, 6);
  });
});

describe("clipPolygons", () => {
  it("an L shape cut into strips: the areas add up (to 0.5 %)", () => {
    // L: 100 × 100 minus the 60 × 60 top-right square = 6 400 m².
    const L: Point[] = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]];
    const total = Math.abs(signedArea(L));
    expect(total).toBe(6_400);
    const box = orientedBoundingBox(L)!;
    const n = 5;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      // Strip i across the long axis of the oriented box.
      const s0 = -box.length / 2 + (i * box.length) / n;
      const s1 = s0 + box.length / n;
      const w = box.width; // generous: the strip covers the whole shape across
      const at = (s: number, t: number): [number, number] => [box.center[0] + s * box.axis[0] + t * box.normal[0], box.center[1] + s * box.axis[1] + t * box.normal[1]];
      const strip = [at(s0, -w), at(s1, -w), at(s1, w), at(s0, w)];
      const parts = clipPolygons([[L.map((p) => [p[0], p[1]] as [number, number])]], strip);
      sum += polygonsArea(parts);
    }
    expect(Math.abs(sum - total) / total).toBeLessThan(0.005);
  });

  it("multipolygons and holes; a clipper outside gives nothing", () => {
    const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    const clipper = square(0, 0, 100);
    const parts = clipPolygons([[square(10, 10, 20), square(15, 15, 5)], [square(90, 90, 20)], [square(500, 500, 10)]], clipper);
    expect(parts).toHaveLength(2);
    expect(polygonsArea(parts)).toBeCloseTo(400 - 25 + 100);
    expect(clipPolygons([[square(200, 200, 10)]], clipper)).toEqual([]);
  });
});

describe("solveAffine / applyAffine / invertAffine", () => {
  // A plan of 2 000 × 1 000 px, 0.1 m per pixel, rotated by 20°, y down (image).
  const origin = toMercator([3.06, 50.63]);
  const scale = mercatorScale(50.63) * 0.1;
  const truth = (px: Point): [number, number] => {
    const [x, y] = rotate([px[0] * scale, -px[1] * scale], 20);
    return [origin[0] + x, origin[1] + y];
  };
  const pts = (pixels: Point[]): ControlPoint[] => pixels.map((pixel) => ({ pixel, mercator: truth(pixel) }));

  it("3 exact points: zero error, rotation and scale recovered", () => {
    const sol = solveAffine(pts([[0, 0], [2000, 0], [0, 1000]]));
    expect(sol.rmsErrorM).toBeLessThan(1e-6);
    expect(sol.errorsM.every((e) => e < 1e-6)).toBe(true);
    expect(sol.rotationDeg).toBeCloseTo(20, 6);
    expect(sol.scale).toBeCloseTo(scale, 9);
    const [x, y] = applyAffine(sol.matrix, [1234, 567]);
    const [tx, ty] = truth([1234, 567]);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(1e-6);
  });

  it("noise: one corner of a square displaced by δ gives an error of δ/4 on each point", () => {
    const control = pts([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]);
    const delta = 2 * mercatorScale(50.63); // 2 ground metres
    control[2] = { pixel: control[2]!.pixel, mercator: [control[2]!.mercator[0] + delta, control[2]!.mercator[1]] };
    const sol = solveAffine(control);
    expect(sol.rmsErrorM).toBeCloseTo(0.5, 2);
    for (const e of sol.errorsM) expect(e).toBeCloseTo(0.5, 2);
  });

  it("aligned or too few points: explicit error", () => {
    expect(() => solveAffine(pts([[0, 0], [100, 100], [200, 200], [300, 300]]))).toThrow(DegenerateControlPointsError);
    expect(() => solveAffine(pts([[0, 0], [100, 0]]))).toThrow("Au moins 3 points");
    expect(() => solveAffine(pts([[0, 0], [0, 0], [0, 0]]))).toThrow(/alignés ou confondus/);
    // Pixels fine, but the map points are aligned.
    const collapsed: ControlPoint[] = ([[0, 0], [100, 0], [0, 100]] as Point[]).map((pixel, i) => ({ pixel, mercator: [origin[0] + i, origin[1] + i] }));
    expect(() => solveAffine(collapsed)).toThrow(DegenerateControlPointsError);
  });

  it("invertAffine(applyAffine(p)) gives p back", () => {
    const { matrix } = solveAffine(pts([[0, 0], [2000, 0], [2000, 1000], [0, 1000], [700, 300]]));
    const inverse = invertAffine(matrix);
    for (const p of [[0, 0], [123.4, 987.6], [2000, 1000], [-50, 3000]] as const) {
      const back = applyAffine(inverse, applyAffine(matrix, p));
      expect(back[0]).toBeCloseTo(p[0], 6);
      expect(back[1]).toBeCloseTo(p[1], 6);
    }
    expect(() => invertAffine([1, 2, 0, 2, 4, 0])).toThrow(DegenerateControlPointsError);
  });
});
