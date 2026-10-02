import { describe, expect, it } from "vitest";
import { addDays, addMonths, toDateOnly } from "@/domain/dates";
import { leaseDeadlineBucket, SITE_INDEX_KEYS } from "@/domain/site-index";
import { buildSiteIndex, type SiteRow } from "@/server/sites/build";

const TODAY = toDateOnly("2026-09-29")!;

/** Lease whose arbitration (notice − 6 months) falls on `arbitration`. */
const byArbitration = (arbitration: Date) => ({ noticeDate: addMonths(arbitration, 6), nextExitDate: null, endDate: null, renewalConditionsSigned: false });

describe("leaseDeadlineBucket", () => {
  it("renewed when the renewal conditions are signed, whatever the dates", () => {
    expect(leaseDeadlineBucket({ noticeDate: addDays(TODAY, -300), renewalConditionsSigned: true }, TODAY)).toBe("renewed");
    expect(leaseDeadlineBucket({ renewalConditionsSigned: true }, TODAY)).toBe("renewed");
  });

  it("unknown without lease or without any date", () => {
    expect(leaseDeadlineBucket(null, TODAY)).toBe("unknown");
    expect(leaseDeadlineBucket({ renewalConditionsSigned: false }, TODAY)).toBe("unknown");
  });

  it("each bucket boundary (arbitration date)", () => {
    const at = (d: Date) => leaseDeadlineBucket(byArbitration(d), TODAY);
    expect(at(addDays(TODAY, -1))).toBe("overdue");
    expect(at(TODAY)).toBe("lt3m");
    expect(at(addDays(addMonths(TODAY, 3), -1))).toBe("lt3m");
    expect(at(addMonths(TODAY, 3))).toBe("lt6m");
    expect(at(addDays(addMonths(TODAY, 6), -1))).toBe("lt6m");
    expect(at(addMonths(TODAY, 6))).toBe("lt12m");
    expect(at(addDays(addMonths(TODAY, 12), -1))).toBe("lt12m");
    expect(at(addMonths(TODAY, 12))).toBe("gt12m");
  });

  it("reference: arbitration, else next exit, else end date", () => {
    expect(leaseDeadlineBucket({ nextExitDate: addMonths(TODAY, 2), endDate: addMonths(TODAY, 30) }, TODAY)).toBe("lt3m");
    expect(leaseDeadlineBucket({ endDate: addDays(TODAY, -2) }, TODAY)).toBe("overdue");
    // Arbitration = next exit − notice period − 6 months.
    expect(leaseDeadlineBucket({ nextExitDate: addMonths(TODAY, 14), noticePeriodMonths: 6, endDate: addMonths(TODAY, 40) }, TODAY)).toBe("lt3m");
  });
});

describe("buildSiteIndex", () => {
  const row = (over: Partial<SiteRow> = {}): SiteRow => ({
    id: "a",
    code: "A-1",
    name: "Alpha",
    isActive: true,
    addressLine: "1 rue",
    postalCode: "75001",
    city: "Paris",
    departmentCode: "75",
    region: "Île-de-France",
    portfolio: "P",
    typology: "T",
    operatingMode: null,
    logisticsOperator: "Op",
    occupyingBu: "BU",
    hasCoordinates: true,
    latitude: 48.86,
    longitude: 2.35,
    externalIds: [{ system: "QLIK_SENSE", value: "Q-2" }, { system: "QLIK_SENSE", value: "Q-1" }, { system: "AL_CODE", value: "AL9" }],
    lease: { code: "BAIL-1", holdingEntity: "SCI", endDate: toDateOnly("2035-01-01"), nextExitDate: toDateOnly("2032-01-01"), noticeDate: toDateOnly("2031-06-30"), noticePeriodMonths: 6, renewalConditionsSigned: false },
    technical: { totalWarehouseArea: 12000 },
    icpe: { holder: "H", headingsCount: 1 },
    geometry: null,
    ...over,
  });

  it("entry fields, department name, external ids sorted, deadline bucket", () => {
    const [e] = buildSiteIndex([row()], TODAY);
    expect(Object.keys(e!).sort()).toEqual([...SITE_INDEX_KEYS].sort());
    expect(e).toMatchObject({ departmentName: "Paris", lat: 48.86, lon: 2.35, totalArea: 12000, leaseDeadlineBucket: "gt12m", occupyingBu: "BU" });
    expect(e!.externalIds).toEqual({ qlik: ["Q-1", "Q-2"], al: ["AL9"], ramses: [], leaseCode: "BAIL-1" });
  });

  it("no amount nor exact lease date in the entry (keys, recursively)", () => {
    const keys = new Set<string>();
    const walk = (o: unknown) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
        keys.add(k);
        walk(v);
      }
    };
    walk(buildSiteIndex([row()], TODAY));
    for (const k of keys) expect(k).not.toMatch(/rent|amount|price|loyer|montant|date|notice|exit|end|holding|indexation/i);
    expect(JSON.stringify(buildSiteIndex([row()], TODAY))).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("unlocated site: lat/lon null; sorted most severe first", () => {
    const index = buildSiteIndex([row({ id: "b", code: "B", name: "Beta", latitude: null }), row({ id: "c", code: "C", name: "Gamma", city: null })], TODAY);
    expect(index.map((e) => e.code)).toEqual(["C", "B"]);
    expect(index[1]).toMatchObject({ lat: null, lon: null });
  });
});
