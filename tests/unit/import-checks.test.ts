import { describe, expect, it } from "vitest";
import {
  checkArbitrationDate,
  checkCoordinates,
  checkDepartmentRegion,
  checkPerSqm,
  checkStatusActivity,
  checkWater,
  rejectDuplicateCodes,
} from "@/server/import/checks";
import { likelyAreaBasis, waterStatistics } from "@/server/import/report";
import type { SiteDraft } from "@/server/import/types";

function draft(overrides: Partial<Record<"site" | "lease" | "technical", Record<string, unknown>>> = {}, extra: Partial<SiteDraft> = {}): SiteDraft {
  const d: SiteDraft = {
    row: 5,
    code: "SMP-X",
    entities: {
      site: new Map(Object.entries(overrides.site ?? {})),
      lease: new Map(Object.entries(overrides.lease ?? {})),
      serviceContract: new Map(),
      technical: new Map(Object.entries(overrides.technical ?? {})),
      icpe: new Map(),
      energy: new Map(),
    },
    externalIds: new Map(),
    buildingWorks: new Map(),
    icpeHeadings: undefined,
    metrics: new Map(),
    sheetModifiedAt: null,
    sheet: { perSqm: [], arbitrationDate: null },
    references: [],
  };
  return { ...d, ...extra };
}

describe("checkCoordinates", () => {
  it("keeps coordinates inside metropolitan France", () => {
    const d = draft({ site: { latitude: 45.71, longitude: 4.95 } });
    expect(checkCoordinates(d)).toEqual([]);
    expect(d.entities.site.get("coordinatesSource")).toBe("import");
  });

  it("detects and corrects swapped latitude/longitude", () => {
    const d = draft({ site: { latitude: 4.95, longitude: 45.71 } });
    const issues = checkCoordinates(d);
    expect(issues[0]).toMatchObject({ severity: "warning", kind: "swapped_coordinates" });
    expect([d.entities.site.get("latitude"), d.entities.site.get("longitude")]).toEqual([45.71, 4.95]);
  });

  it("nulls coordinates outside France", () => {
    const d = draft({ site: { latitude: 40.41, longitude: -3.7 } });
    expect(checkCoordinates(d)[0]?.kind).toBe("coordinates_outside_france");
    expect(d.entities.site.get("latitude")).toBeNull();
    expect(d.entities.site.get("coordinatesSource")).toBeNull();
  });

  it("drops incomplete coordinates and ignores absent columns", () => {
    const d = draft({ site: { latitude: 45.7, longitude: null } });
    expect(checkCoordinates(d)[0]?.kind).toBe("incomplete_coordinates");
    expect(checkCoordinates(draft())).toEqual([]);
  });
});

describe("checkDepartmentRegion", () => {
  it("warns when the department is not in the region", () => {
    expect(checkDepartmentRegion(draft({ site: { departmentCode: "2A", region: "Bretagne" } }))[0]).toMatchObject({ kind: "department_region_mismatch" });
    expect(checkDepartmentRegion(draft({ site: { departmentCode: "69", region: "Auvergne-Rhône-Alpes" } }))).toEqual([]);
    expect(checkDepartmentRegion(draft({ site: { departmentCode: "69" } }))).toEqual([]);
  });
});

describe("checkStatusActivity", () => {
  it.each([
    ["Fermé", true, 1],
    ["Fermé définitivement", true, 1],
    ["Vacant", true, 1],
    ["En exploitation", false, 1],
    ["En exploitation", true, 0],
    ["Fermé", false, 0],
    ["Autre statut", true, 0],
  ])("STATUT %j + EN ACTIVITE %s → %d warning(s)", (status, active, count) => {
    expect(checkStatusActivity(draft({ site: { status, isActive: active } }))).toHaveLength(count);
  });
});

describe("checkArbitrationDate", () => {
  const d = (arbitration: string, lease: Record<string, unknown>) =>
    draft({ lease }, { sheet: { perSqm: [], arbitrationDate: new Date(arbitration) } });

  it("accepts the arbitration date computed from the notice date", () => {
    expect(checkArbitrationDate(d("2027-06-30T00:00:00Z", { noticeDate: new Date("2027-12-31T00:00:00Z") }))).toEqual([]);
  });

  it("warns when it differs", () => {
    const issues = checkArbitrationDate(d("2025-01-01T00:00:00Z", { noticeDate: new Date("2027-12-31T00:00:00Z") }));
    expect(issues[0]).toMatchObject({ kind: "arbitration_date_mismatch", original: "2025-01-01", retained: "2027-06-30" });
  });

  it("warns when it cannot be recomputed", () => {
    expect(checkArbitrationDate(d("2025-01-01T00:00:00Z", {}))[0]?.message).toMatch(/non recalculable/);
    expect(checkArbitrationDate(draft())).toEqual([]);
  });
});

describe("checkPerSqm", () => {
  const withRent = (sheetValue: number, technical: Record<string, unknown>) => {
    const d = draft({ technical });
    d.metrics.set("RENT|2024", { metric: "RENT", year: 2024, value: 520000, column: "LOYER 2024" });
    d.sheet.perSqm.push({ column: "LOYER 2024 /M²", metric: "RENT", year: 2024, value: sheetValue });
    return d;
  };

  it("finds which area the sheet used", () => {
    const result = checkPerSqm(withRent(52, { totalWarehouseArea: 10000, leaseWarehouseArea: 10400, surveyedTotalArea: 10150 }));
    expect(result.issues).toEqual([]);
    expect(result.matches).toEqual([["total"]]);
    expect(checkPerSqm(withRent(50, { totalWarehouseArea: 10000, leaseWarehouseArea: 10400 })).matches).toEqual([["lease"]]);
  });

  it("tolerates 1 % and warns beyond on every basis", () => {
    expect(checkPerSqm(withRent(52.5, { totalWarehouseArea: 10000 })).issues).toEqual([]);
    const result = checkPerSqm(withRent(99.99, { totalWarehouseArea: 10000, leaseWarehouseArea: 10400 }));
    expect(result.issues[0]).toMatchObject({ kind: "per_sqm_mismatch", column: "LOYER 2024 /M²", original: "99.99", retained: "52.00" });
    expect(result.matches).toEqual([[]]);
  });

  it("skips values without area or metric", () => {
    expect(checkPerSqm(withRent(52, {})).matches).toEqual([]);
  });

  it("summarises the likely basis", () => {
    expect(likelyAreaBasis([["total"], ["total", "reference"], []]).likelyBasis).toBe("total");
    expect(likelyAreaBasis([["total", "lease"]]).label).toMatch(/indiscernables/);
    expect(likelyAreaBasis([[]]).label).toMatch(/aucune surface/);
    expect(likelyAreaBasis([]).label).toMatch(/aucune valeur/);
  });
});

describe("checkWater", () => {
  const withWater = (m3: number) => {
    const d = draft({ technical: { totalWarehouseArea: 10000 } });
    d.metrics.set("WATER|2023", { metric: "WATER", year: 2023, value: m3, column: "2023 EAU" });
    return d;
  };

  it("accepts plausible m³ values", () => {
    expect(checkWater(withWater(1200))).toEqual({ issues: [], ratios: [0.12] });
  });

  it("flags values that look like litres", () => {
    const result = checkWater(withWater(1_200_000));
    expect(result.issues[0]).toMatchObject({ kind: "water_magnitude" });
  });

  it("produces a global statistic", () => {
    expect(waterStatistics([0.1, 0.12, 0.15]).verdict).toBe("cohérent avec des m³");
    expect(waterStatistics([120, 110, 0.1]).verdict).toMatch(/litres/);
    expect(waterStatistics([]).medianM3PerSqm).toBeNull();
  });
});

describe("rejectDuplicateCodes", () => {
  it("keeps the first row and rejects the others with an error", () => {
    const a = draft({}, { row: 4, code: "SMP-1" });
    const b = draft({}, { row: 9, code: "smp-1" });
    const c = draft({}, { row: 10, code: "SMP-2" });
    const result = rejectDuplicateCodes([a, b, c]);
    expect(result.kept).toEqual([a, c]);
    expect(result.rejected).toEqual([b]);
    expect(result.issues[0]).toMatchObject({ severity: "error", kind: "duplicate_code", row: 9 });
    expect(result.issues[0]?.message).toMatch(/ligne 4/);
  });
});
