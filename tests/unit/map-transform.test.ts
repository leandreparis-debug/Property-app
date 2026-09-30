import { describe, expect, it } from "vitest";
import { toDateOnly } from "@/domain/dates";
import { DEFAULT_BUILDING_HEIGHT_M } from "@/domain/map-dto";
import { buildMapSitesData, parseFootprint, type MapSiteRow } from "@/server/map/transform";

const TODAY = toDateOnly("2026-09-28")!;
const square = JSON.stringify({ type: "Polygon", coordinates: [[[4.9, 45.7], [4.901, 45.7], [4.901, 45.701], [4.9, 45.701], [4.9, 45.7]]] });

const row = (over: Partial<MapSiteRow> = {}): MapSiteRow => ({
  id: "s1",
  code: "T-1",
  name: "Entrepôt Test",
  isActive: true,
  addressLine: "1 rue",
  postalCode: "69800",
  city: "Saint-Priest",
  departmentCode: "69",
  region: "ARA",
  portfolio: "P",
  typology: "T",
  operatingMode: null,
  logisticsOperator: null,
  hasCoordinates: true,
  latitude: 45.7,
  longitude: 4.9,
  lease: { code: "B", holdingEntity: "E", endDate: toDateOnly("2035-01-01"), nextExitDate: toDateOnly("2032-01-01"), noticeDate: toDateOnly("2031-06-30"), noticePeriodMonths: 6, renewalConditionsSigned: false },
  technical: { totalWarehouseArea: 20000, landArea: 50000, socialOfficeArea: 500, dockCount: 20 },
  icpe: { holder: "X", headingsCount: 1 },
  geometry: null,
  ...over,
});

describe("buildMapSitesData", () => {
  it("builds the points with the expected properties", () => {
    const data = buildMapSitesData([row()], TODAY);
    expect(data.evaluatedOn).toBe("2026-09-28");
    expect(data.points.features).toHaveLength(1);
    const f = data.points.features[0]!;
    expect(f.geometry.coordinates).toEqual([4.9, 45.7]);
    expect(f.properties).toMatchObject({ id: "s1", code: "T-1", status: "ok", statusRank: 0, totalArea: 20000, hasFootprint: true, isActive: true, completeness: 100 });
    // No footprint but an area: approximate volume.
    expect(data.footprints.features[0]!.properties.approximate).toBe(true);
    expect(buildMapSitesData([row({ technical: null })], TODAY).points.features[0]!.properties.hasFootprint).toBe(false);
  });

  it("the DTO carries no financial or detailed lease field (list of keys)", () => {
    const data = buildMapSitesData([row({ geometry: { footprintGeoJson: square, heightM: 10 } }), row({ id: "s2", code: "T-2", latitude: null })], TODAY);
    const keys = new Set<string>();
    const collect = (o: unknown) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
        keys.add(k);
        if (k !== "coordinates") collect(v);
      }
    };
    collect(data);
    for (const k of keys) expect(k).not.toMatch(/rent|amount|price|loyer|montant|lease|notice|endDate|exit|holding|indexation|vlm/i);
    expect(Object.keys(data.points.features[0]!.properties).sort()).toEqual(
      ["code", "city", "completeness", "departmentCode", "hasFootprint", "id", "isActive", "name", "reasonCount", "reasons", "region", "status", "statusRank", "totalArea"].sort(),
    );
    expect(Object.keys(data.unlocated[0]!).sort()).toEqual(["city", "code", "id", "name", "status"]);
  });

  it("a site without coordinates goes to the unlocated list", () => {
    const data = buildMapSitesData([row({ latitude: null, longitude: null }), row({ id: "s3", code: "T-3", latitude: 95, longitude: 4 })], TODAY);
    expect(data.points.features).toHaveLength(0);
    expect(data.unlocated.map((u) => u.code)).toEqual(["T-1", "T-3"]);
  });

  it("footprints: default height and heightEstimated; invalid geometry → approximate volume", () => {
    const data = buildMapSitesData(
      [
        row({ geometry: { footprintGeoJson: square, heightM: null } }),
        row({ id: "s2", code: "T-2", geometry: { footprintGeoJson: square, heightM: 14.5 } }),
        row({ id: "s3", code: "T-3", geometry: { footprintGeoJson: "{bad", heightM: 3 } }),
      ],
      TODAY,
    );
    expect(data.footprints.features.map((f) => f.properties)).toEqual([
      { id: "s1", code: "T-1", status: "ok", heightM: DEFAULT_BUILDING_HEIGHT_M, heightEstimated: true, approximate: false },
      { id: "s2", code: "T-2", status: "ok", heightM: 14.5, heightEstimated: false, approximate: false },
      { id: "s3", code: "T-3", status: "ok", heightM: 3, heightEstimated: false, approximate: true },
    ]);
    // Volumes: one feature per cell, the docks of a site merged; tagged with the site.
    const s2 = data.volumes.features.filter((f) => f.properties.siteId === "s2");
    expect(s2.filter((f) => f.properties.part === "cell")).toHaveLength(1);
    expect(s2.find((f) => f.properties.part === "dock")!.geometry.type).toBe("MultiPolygon");
    expect(data.volumes.features.every((f) => f.properties.approximate === (f.properties.siteId === "s3"))).toBe(true);
    expect(parseFootprint(JSON.stringify({ type: "Point", coordinates: [1, 2] }))).toBeNull();
  });

  it("reasons truncated to 3 and sorted; all of them in reasonsById", () => {
    const worst = row({
      addressLine: null,
      lease: { code: null, holdingEntity: null, endDate: toDateOnly("2026-01-01"), nextExitDate: toDateOnly("2026-06-01"), noticeDate: toDateOnly("2026-10-15"), noticePeriodMonths: 6, renewalConditionsSigned: false },
      icpe: null,
      portfolio: null,
      typology: null,
      technical: null,
    });
    const data = buildMapSitesData([worst], TODAY);
    const props = data.points.features[0]!.properties;
    expect(props.status).toBe("critical");
    expect(props.reasons).toHaveLength(3);
    expect(props.reasons.every((r) => r.severity === "critical")).toBe(true);
    expect(props.reasonCount).toBeGreaterThan(3);
    expect(data.reasonsById.s1).toHaveLength(props.reasonCount);
  });

  it("counts per status; inactive → unknown; sorted with critical on top", () => {
    const data = buildMapSitesData(
      [row({ id: "a", code: "A" }), row({ id: "b", code: "B", isActive: false }), row({ id: "c", code: "C", city: null }), row({ id: "d", code: "D", latitude: null })],
      TODAY,
    );
    expect(data.counts).toEqual({ ok: 2, warning: 1, critical: 0, unknown: 1 });
    expect(data.points.features.map((f) => f.properties.statusRank)).toEqual([0, 1, 2]);
  });
});
