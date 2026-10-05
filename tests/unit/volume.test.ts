import type { MultiPolygon, Polygon, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { fromMercator, geodesicArea, mercatorScale, toMercator } from "@/domain/geometry";
import { buildBuildingVolume, DEFAULT_VOLUME_HEIGHT_M, DOCK_SIZE_M, MAX_DOCKS, type VolumeInput } from "@/domain/volume/build";

/** A rectangle of `length` × `width` ground metres, rotated by `angle`°, around (lon, lat). */
function rectangle(lon: number, lat: number, length: number, width: number, angle = 0): Polygon {
  const [cx, cy] = toMercator([lon, lat]);
  const k = mercatorScale(lat);
  const r = (angle * Math.PI) / 180;
  const pts: Position[] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([s, t]) => {
    const u = (s! * length * k) / 2;
    const v = (t! * width * k) / 2;
    return fromMercator([cx + u * Math.cos(r) - v * Math.sin(r), cy + u * Math.sin(r) + v * Math.cos(r)]);
  });
  return { type: "Polygon", coordinates: [pts] };
}

const base: VolumeInput = { footprint: rectangle(3.06, 50.63, 300, 120, 25), heightM: 14, cellCount: 5, dockCount: 40, dockSide: "a", referenceArea: null, center: null };
const parts = (v: ReturnType<typeof buildBuildingVolume>, part: string) => v!.parts.features.filter((f) => f.properties.part === part);
const area = (g: Polygon | MultiPolygon) => geodesicArea(g);

/** Signed distance (ground m) of a point from the rectangle axis, across (normal side). */
function across(lon: number, lat: number, p: Position, angle: number): number {
  const [cx, cy] = toMercator([lon, lat]);
  const [x, y] = toMercator([p[0]!, p[1]!]);
  const r = (angle * Math.PI) / 180;
  return (-(x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)) / mercatorScale(lat);
}

describe("buildBuildingVolume", () => {
  it("N cells separated by firewalls; cells + firewalls cover the footprint", () => {
    const v = buildBuildingVolume(base)!;
    expect(v.meta).toMatchObject({ approximate: false, heightM: 14, heightEstimated: false, cells: 5, firewalls: 4 });
    expect(parts(v, "cell")).toHaveLength(5);
    expect(parts(v, "firewall")).toHaveLength(4);
    expect(parts(v, "edge")).toHaveLength(5);
    expect(v.meta.lengthM).toBeCloseTo(300, 1);
    expect(v.meta.widthM).toBeCloseTo(120, 1);
    expect(v.meta.axisAngleDeg).toBeCloseTo(25, 3);
    // Each firewall: 0.6 m × 120 m.
    for (const f of parts(v, "firewall")) expect(area(f.geometry)).toBeCloseTo(0.6 * 120, -0.5);
    const total = [...parts(v, "cell"), ...parts(v, "firewall")].reduce((s, f) => s + area(f.geometry), 0);
    expect(Math.abs(total - 300 * 120) / (300 * 120)).toBeLessThan(0.005);
    // Heights: cells at the roof, firewalls rise above it, parapet on the roof.
    expect(parts(v, "cell").every((f) => f.properties.heightM === 14 && f.properties.baseM === 0)).toBe(true);
    expect(parts(v, "firewall").every((f) => f.properties.heightM === 15)).toBe(true);
    expect(parts(v, "edge").every((f) => f.properties.baseM === 14 && f.properties.heightM > 14)).toBe(true);
  });

  it("a single cell when cellCount is missing or ≤ 1", () => {
    for (const cellCount of [null, 0, 1]) {
      const v = buildBuildingVolume({ ...base, cellCount })!;
      expect(v.meta.cells).toBe(1);
      expect(v.meta.firewalls).toBe(0);
    }
  });

  it("an L-shaped footprint: strips are clipped by it", () => {
    const [cx, cy] = toMercator([2.35, 48.85]);
    const k = mercatorScale(48.85);
    const L: Position[] = [[0, 0], [200, 0], [200, 60], [80, 60], [80, 140], [0, 140], [0, 0]].map(([x, y]) => fromMercator([cx + x! * k, cy + y! * k]));
    const footprint: Polygon = { type: "Polygon", coordinates: [L] };
    const v = buildBuildingVolume({ ...base, footprint, cellCount: 4 })!;
    const total = [...parts(v, "cell"), ...parts(v, "firewall")].reduce((s, f) => s + area(f.geometry), 0);
    expect(Math.abs(total - area(footprint)) / area(footprint)).toBeLessThan(0.005);
  });

  it("docks on side A or B, outside the footprint, evenly spread", () => {
    for (const side of ["a", "b"] as const) {
      const v = buildBuildingVolume({ ...base, dockSide: side })!;
      const docks = parts(v, "dock");
      expect(docks).toHaveLength(40);
      expect(v.meta.docks).toBe(40);
      for (const d of docks) {
        const ring = (d.geometry as Polygon).coordinates[0]!;
        const t = ring.slice(0, 4).map((p) => across(3.06, 50.63, p, 25));
        // Side a: across ∈ [-61.5, -60]; side b: [60, 61.5].
        const sign = side === "a" ? -1 : 1;
        for (const x of t) {
          expect(sign * x).toBeGreaterThanOrEqual(60 - 0.05);
          expect(sign * x).toBeLessThanOrEqual(60 + DOCK_SIZE_M.depth + 0.05);
        }
        expect(area(d.geometry)).toBeCloseTo(DOCK_SIZE_M.width * DOCK_SIZE_M.depth, 0);
        expect(d.properties.heightM).toBe(DOCK_SIZE_M.height);
      }
    }
  });

  it("at most 120 docks, and no more than fit on the facade", () => {
    const big = buildBuildingVolume({ ...base, footprint: rectangle(3.06, 50.63, 800, 150), dockCount: 500 })!;
    expect(big.meta.docks).toBe(MAX_DOCKS);
    expect(parts(big, "dock")).toHaveLength(MAX_DOCKS);
    const small = buildBuildingVolume({ ...base, footprint: rectangle(3.06, 50.63, 36, 20), dockCount: 50 })!;
    expect(small.meta.docks).toBe(10); // 36 m / 3.6 m
  });

  it("no footprint: approximate 2:1 east-west rectangle of the reference area; no area: no volume", () => {
    const v = buildBuildingVolume({ ...base, footprint: null, referenceArea: 20_000, center: { lon: 5.4, lat: 43.3 } })!;
    expect(v.meta.approximate).toBe(true);
    expect(area(v.footprint)).toBeCloseTo(20_000, -2);
    expect(v.meta.lengthM).toBeCloseTo(200, 3);
    expect(v.meta.widthM).toBeCloseTo(100, 3);
    expect(v.meta.axisAngleDeg % 180).toBeCloseTo(0, 6);
    expect(v.meta.cells).toBe(5);
    expect(buildBuildingVolume({ ...base, footprint: null, referenceArea: null, center: { lon: 5.4, lat: 43.3 } })).toBeNull();
    expect(buildBuildingVolume({ ...base, footprint: null, referenceArea: 20_000, center: null })).toBeNull();
    // An invalid (degenerate) footprint falls back to the rectangle.
    const flat: Polygon = { type: "Polygon", coordinates: [[[5, 43], [5.001, 43], [5.002, 43], [5, 43]]] };
    expect(buildBuildingVolume({ ...base, footprint: flat, referenceArea: 20_000, center: { lon: 5.4, lat: 43.3 } })).toBeNull();
  });

  it("estimated height: 12 m when unknown", () => {
    for (const heightM of [null, 0, Number.NaN]) {
      const v = buildBuildingVolume({ ...base, heightM })!;
      expect(v.meta).toMatchObject({ heightM: DEFAULT_VOLUME_HEIGHT_M, heightEstimated: true });
    }
  });

  it("runs in less than 5 ms per site", () => {
    const inputs = Array.from({ length: 200 }, (_, i) => ({ ...base, footprint: rectangle(2 + i / 100, 46 + i / 100, 250 + i, 110, i), cellCount: 1 + (i % 12), dockCount: i % 130 }));
    buildBuildingVolume(inputs[0]!); // warm-up
    const t0 = performance.now();
    for (const input of inputs) buildBuildingVolume(input);
    expect((performance.now() - t0) / inputs.length).toBeLessThan(5);
  });
});
