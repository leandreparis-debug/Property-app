import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDateOnly } from "@/domain/dates";
import { SITE_INDEX_KEYS } from "@/domain/site-index";
import { getMapSites } from "@/server/map/sites";
import { getSiteIndex } from "@/server/sites/index";
import { disconnectAll, raw, resetDatabase } from "./helpers";

const TODAY = toDateOnly("2026-09-29")!;
const d = (iso: string) => toDateOnly(iso)!;

beforeAll(async () => {
  await resetDatabase();
  await raw.site.create({
    data: {
      code: "IDX-1",
      name: "Entrepôt Index",
      isActive: true,
      addressLine: "1 rue",
      postalCode: "69800",
      city: "Saint-Priest",
      departmentCode: "69",
      region: "Auvergne-Rhône-Alpes",
      portfolio: "Portefeuille",
      occupyingBu: "BU Est",
      typology: "Entrepôt",
      logisticsOperator: "Exploitant",
      latitude: 45.7,
      longitude: 4.95,
      externalIds: { create: [{ system: "QLIK_SENSE", value: "QS-1" }, { system: "AL_CODE", value: "AL-1" }, { system: "RAMSES", value: "R-1" }] },
      lease: {
        create: {
          code: "BAIL-IDX",
          holdingEntity: "SCI",
          endDate: d("2035-12-31"),
          nextExitDate: d("2032-12-31"),
          noticeDate: d("2027-01-15"), // arbitration 2026-07-15 → overdue
          noticePeriodMonths: 6,
          renewalConditionsSigned: false,
          economicRentPerSqm: 55,
          marketRentValue: 1_000_000,
        },
      },
      technical: { create: { totalWarehouseArea: 20000 } },
      icpe: { create: { holder: "Exploitant" } },
      geometry: { create: { footprintGeoJson: JSON.stringify({ type: "Polygon", coordinates: [[[4.95, 45.7], [4.951, 45.7], [4.951, 45.701], [4.95, 45.701], [4.95, 45.7]]] }), heightM: 11 } },
    },
  });
  await raw.site.create({ data: { code: "IDX-ARCH", name: "Archivé", archivedAt: new Date() } });
});

afterAll(disconnectAll);

describe("getSiteIndex", () => {
  it("expected fields, external ids, deadline bucket; archived sites excluded", async () => {
    const index = await getSiteIndex(TODAY);
    expect(index.map((e) => e.code)).toEqual(["IDX-1"]);
    const e = index[0]!;
    expect(Object.keys(e).sort()).toEqual([...SITE_INDEX_KEYS].sort());
    expect(e).toMatchObject({ departmentName: "Rhône", occupyingBu: "BU Est", lat: 45.7, lon: 4.95, totalArea: 20000, leaseDeadlineBucket: "overdue", status: "critical" });
    expect(e.externalIds).toEqual({ qlik: ["QS-1"], al: ["AL-1"], ramses: ["R-1"], leaseCode: "BAIL-IDX" });
  });

  it("no amount and no exact lease date (keys and values)", async () => {
    const index = await getSiteIndex(TODAY);
    const keys = new Set<string>();
    const walk = (o: unknown) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
        keys.add(k);
        walk(v);
      }
    };
    walk(index);
    for (const k of keys) expect(k).not.toMatch(/rent|amount|price|loyer|montant|date|notice|exit|end$|holding|market/i);
    const json = JSON.stringify(index);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).not.toContain("1000000");
  });
});

describe("getMapSites (contract unchanged)", () => {
  it("points, footprints, unlocated, counts, reasons", async () => {
    const data = await getMapSites(TODAY);
    expect(Object.keys(data).sort()).toEqual(["counts", "evaluatedOn", "footprints", "points", "reasonsById", "unlocated"]);
    expect(data.evaluatedOn).toBe("2026-09-29");
    expect(data.points.features.map((f) => f.properties.code)).toEqual(["IDX-1"]);
    expect(data.footprints.features[0]!.properties).toMatchObject({ code: "IDX-1", heightM: 11, heightEstimated: false, status: "critical" });
    expect(data.counts).toEqual({ ok: 0, warning: 0, critical: 1, unknown: 0 });
  });
});
