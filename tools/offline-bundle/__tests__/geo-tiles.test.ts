import { describe, expect, it } from "vitest";
import type { Footprint } from "../../../src/domain/enrichment-format";
import { bboxAround, footprintAreaM2, haversineMeters, nameSimilarity, normalizeName, pointInFootprint } from "../geo";
import { lonLatToTile, tileToLonLat, tilesAround, tilesBounds, tilesForSites, xyzToTmsRow } from "../tiles";

/** Square of `side` metres centred on (lon, lat). */
export function square(lon: number, lat: number, side: number): Footprint {
  const dx = side / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const dy = side / 2 / 110_574;
  return { type: "Polygon", coordinates: [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]] };
}

describe("distances", () => {
  it("haversine: Paris → Lyon ≈ 391.5 km, zero on the same point", () => {
    expect(Math.abs(haversineMeters([2.3522, 48.8566], [4.8357, 45.764]) / 1000 - 391.5)).toBeLessThan(1);
    expect(haversineMeters([4.9, 45.7], [4.9, 45.7])).toBe(0);
  });

  it("bboxAround covers the radius in every direction", () => {
    const [w, s, e, n] = bboxAround([4.9, 45.7], 500);
    expect(haversineMeters([4.9, 45.7], [4.9, n])).toBeCloseTo(500, 0);
    expect(haversineMeters([4.9, 45.7], [e, 45.7])).toBeCloseTo(500, 0);
    expect(w).toBeLessThan(4.9);
    expect(s).toBeLessThan(45.7);
  });
});

describe("footprints", () => {
  it("area of a 100 m square ≈ 10 000 m² (< 0.5 %)", () => {
    expect(Math.abs(footprintAreaM2(square(4.9, 45.7, 100)) - 10_000)).toBeLessThan(50);
  });

  it("holes are subtracted, MultiPolygon parts are added", () => {
    const outer = square(4.9, 45.7, 100).coordinates as number[][][];
    const hole = square(4.9, 45.7, 50).coordinates as number[][][];
    const holed: Footprint = { type: "Polygon", coordinates: [outer[0]!, hole[0]!] as never };
    expect(Math.abs(footprintAreaM2(holed) - 7_500)).toBeLessThan(75);
    const multi: Footprint = { type: "MultiPolygon", coordinates: [square(4.9, 45.7, 100).coordinates, square(4.91, 45.7, 100).coordinates] as never };
    expect(Math.abs(footprintAreaM2(multi) - 20_000)).toBeLessThan(200); // < 1 %
  });

  it("point in polygon, outside, in a hole", () => {
    const outer = square(4.9, 45.7, 100).coordinates as number[][][];
    const hole = square(4.9, 45.7, 20).coordinates as number[][][];
    expect(pointInFootprint([4.9, 45.7], square(4.9, 45.7, 100))).toBe(true);
    expect(pointInFootprint([4.91, 45.7], square(4.9, 45.7, 100))).toBe(false);
    expect(pointInFootprint([4.9, 45.7], { type: "Polygon", coordinates: [outer[0]!, hole[0]!] as never })).toBe(false);
  });
});

describe("names", () => {
  it("normalises accents, legal forms and punctuation", () => {
    expect(normalizeName("Société Logistique de l'Est SAS")).toBe("logistique est");
  });

  it("similarity: identical, contained, different", () => {
    expect(nameSimilarity("LOGISTIQUE FICTIVE SAS", "Logistique Fictive")).toBe(1);
    expect(nameSimilarity("Entrepôt Fictif Lyon-Est", "ENTREPOT FICTIF LYON EST SNC")).toBe(1);
    expect(nameSimilarity("Entrepôt Lyon", "Chimie Voisine")).toBeLessThan(0.3);
    expect(nameSimilarity("", "x")).toBe(0);
  });
});

describe("tiles", () => {
  it("lonLatToTile matches the reference values (z0, z1, Paris z15)", () => {
    expect(lonLatToTile([0, 0], 0)).toEqual({ z: 0, x: 0, y: 0 });
    expect(lonLatToTile([-1, 1], 1)).toEqual({ z: 1, x: 0, y: 0 });
    expect(lonLatToTile([1, -1], 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(lonLatToTile([2.3522, 48.8566], 15)).toEqual({ z: 15, x: 16598, y: 11273 });
  });

  it("tileToLonLat is the north-west corner (round trip)", () => {
    const t = lonLatToTile([4.9, 45.7], 17);
    const [lon, lat] = tileToLonLat(t);
    expect(lon).toBeLessThanOrEqual(4.9);
    expect(lat).toBeGreaterThanOrEqual(45.7);
    expect(lonLatToTile([lon + 1e-9, lat - 1e-9], 17)).toEqual(t);
  });

  it("tilesAround a 500 m radius: a small block at z15, about a hundred tiles at z18", () => {
    const z15 = tilesAround([4.9, 45.7], 500, 15).length;
    const z18 = tilesAround([4.9, 45.7], 500, 18).length;
    expect(z15).toBeGreaterThanOrEqual(1);
    expect(z15).toBeLessThanOrEqual(4);
    // z18 tiles are ≈ 107 m wide at 45.7° N: 1 km → 10–12 tiles per side.
    expect(z18).toBeGreaterThanOrEqual(100);
    expect(z18).toBeLessThanOrEqual(144);
  });

  it("tilesForSites deduplicates overlapping sites and sorts z, x, y", () => {
    const one = tilesForSites([[4.9, 45.7]], 500, 15, 18);
    const twice = tilesForSites([[4.9, 45.7], [4.9001, 45.7001]], 500, 15, 18);
    expect(twice.length).toBeLessThan(one.length * 2);
    expect(twice.map((t) => t.z)).toEqual([...twice.map((t) => t.z)].sort((a, b) => a - b));
    expect(new Set(twice.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(twice.length);
  });

  it("TMS row and bounds", () => {
    expect(xyzToTmsRow({ z: 1, x: 0, y: 0 })).toBe(1);
    expect(xyzToTmsRow({ z: 3, x: 2, y: 5 })).toBe(2);
    const b = tilesBounds([{ z: 1, x: 0, y: 0 }]);
    expect(b?.[0]).toBe(-180);
    expect(b?.[2]).toBe(0);
    expect(tilesBounds([])).toBeNull();
  });
});
