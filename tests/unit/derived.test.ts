import { describe, expect, it } from "vitest";
import {
  arbitrationDate,
  metricSeries,
  officeRatio,
  perSqm,
  referenceArea,
  toNumber,
  yearOverYear,
} from "@/domain/derived";
import { toIsoDate } from "@/domain/dates";

/** Minimal stand-in for Prisma's Decimal. */
const dec = (v: number) => ({ toNumber: () => v });

describe("toNumber", () => {
  it("accepts numbers, Decimals and numeric strings", () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(dec(3))).toBe(3);
    expect(toNumber("42.1")).toBe(42.1);
  });
  it("returns null for missing or invalid values", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe("referenceArea", () => {
  it("prefers the surveyed area", () => {
    expect(referenceArea({ surveyedTotalArea: dec(10100), totalWarehouseArea: 10000 })).toBe(10100);
  });
  it("falls back to the total warehouse area", () => {
    expect(referenceArea({ surveyedTotalArea: null, totalWarehouseArea: dec(10000) })).toBe(10000);
    expect(referenceArea({ surveyedTotalArea: 0, totalWarehouseArea: 10000 })).toBe(10000);
  });
  it("returns null when nothing is known", () => {
    expect(referenceArea({})).toBeNull();
    expect(referenceArea({ surveyedTotalArea: null, totalWarehouseArea: 0 })).toBeNull();
    expect(referenceArea(null)).toBeNull();
    expect(referenceArea(undefined)).toBeNull();
  });
});

describe("perSqm", () => {
  it("divides the value by the area", () => {
    expect(perSqm(520000, 10000)).toBe(52);
    expect(perSqm(dec(-1000), dec(500))).toBe(-2);
  });
  it("returns null for a missing value or area", () => {
    expect(perSqm(null, 10000)).toBeNull();
    expect(perSqm(100, null)).toBeNull();
    expect(perSqm(undefined, undefined)).toBeNull();
  });
  it("returns null for a zero or negative area", () => {
    expect(perSqm(100, 0)).toBeNull();
    expect(perSqm(100, -5)).toBeNull();
  });
  it("accepts a zero value", () => {
    expect(perSqm(0, 100)).toBe(0);
  });
});

describe("yearOverYear", () => {
  it("returns the variation in percentage points", () => {
    expect(yearOverYear(103.2, 100)).toBeCloseTo(3.2, 10);
    expect(yearOverYear(dec(90), dec(100))).toBeCloseTo(-10, 10);
    expect(yearOverYear(100, 100)).toBe(0);
  });
  it("uses the absolute previous value for negative bases", () => {
    expect(yearOverYear(-50, -100)).toBeCloseTo(50, 10);
  });
  it("returns null when the previous year is missing or zero", () => {
    expect(yearOverYear(100, null)).toBeNull();
    expect(yearOverYear(100, undefined)).toBeNull();
    expect(yearOverYear(100, 0)).toBeNull();
    expect(yearOverYear(null, 100)).toBeNull();
  });
});

describe("officeRatio", () => {
  it("returns the BLS share of the reference area in percentage points", () => {
    expect(officeRatio({ socialOfficeArea: 450, totalWarehouseArea: 10000 })).toBeCloseTo(4.5, 10);
    expect(officeRatio({ socialOfficeArea: dec(500), surveyedTotalArea: dec(10000), totalWarehouseArea: 8000 })).toBeCloseTo(5, 10);
  });
  it("returns null when an area is missing or zero", () => {
    expect(officeRatio({ socialOfficeArea: null, totalWarehouseArea: 10000 })).toBeNull();
    expect(officeRatio({ socialOfficeArea: 450 })).toBeNull();
    expect(officeRatio({ socialOfficeArea: 450, totalWarehouseArea: 0 })).toBeNull();
    expect(officeRatio(null)).toBeNull();
  });
});

describe("arbitrationDate", () => {
  it("is the notice date minus 6 months", () => {
    expect(toIsoDate(arbitrationDate({ noticeDate: "2027-03-31" }))).toBe("2026-09-30");
  });
  it("prefers the notice date over the exit date", () => {
    expect(
      toIsoDate(arbitrationDate({ noticeDate: "2027-01-15", nextExitDate: "2030-01-01", noticePeriodMonths: 6 })),
    ).toBe("2026-07-15");
  });
  it("otherwise uses next exit − notice period − 6 months", () => {
    expect(toIsoDate(arbitrationDate({ nextExitDate: "2028-06-30", noticePeriodMonths: 6 }))).toBe("2027-06-30");
    expect(toIsoDate(arbitrationDate({ nextExitDate: new Date("2028-01-31T00:00:00Z"), noticePeriodMonths: 3 }))).toBe("2027-04-30");
    expect(toIsoDate(arbitrationDate({ nextExitDate: "2028-06-30", noticePeriodMonths: 0 }))).toBe("2027-12-30");
  });
  it("returns null when data is insufficient", () => {
    expect(arbitrationDate({ nextExitDate: "2028-06-30" })).toBeNull();
    expect(arbitrationDate({ nextExitDate: "2028-06-30", noticePeriodMonths: null })).toBeNull();
    expect(arbitrationDate({ noticePeriodMonths: 6 })).toBeNull();
    expect(arbitrationDate({ nextExitDate: "2028-06-30", noticePeriodMonths: 2.5 })).toBeNull();
    expect(arbitrationDate({ nextExitDate: "2028-06-30", noticePeriodMonths: -1 })).toBeNull();
    expect(arbitrationDate({ noticeDate: "pas une date" })).toBeNull();
    expect(arbitrationDate({})).toBeNull();
    expect(arbitrationDate(null)).toBeNull();
  });
});

describe("metricSeries", () => {
  const rows = [
    { year: 2024, metric: "RENT", value: dec(110000) },
    { year: 2021, metric: "RENT", value: dec(100000) },
    { year: 2022, metric: "RENT", value: 105000 },
    { year: 2022, metric: "CHARGES", value: 9000 },
    { year: 2025, metric: "RENT", value: null },
  ];

  it("sorts by year and keeps only the requested metric", () => {
    expect(metricSeries(rows, "RENT").map((p) => p.year)).toEqual([2021, 2022, 2024, 2025]);
    expect(metricSeries(rows, "CHARGES")).toHaveLength(1);
    expect(metricSeries([], "GAS")).toEqual([]);
  });

  it("computes N-1 only against the calendar year N-1 (non-contiguous years)", () => {
    const series = metricSeries(rows, "RENT", 1000);
    expect(series[0]).toEqual({ year: 2021, value: 100000, perSqm: 100, yearOverYear: null });
    expect(series[1]?.yearOverYear).toBeCloseTo(5, 10);
    expect(series[2]).toMatchObject({ year: 2024, value: 110000, perSqm: 110, yearOverYear: null }); // 2023 missing
    expect(series[3]).toEqual({ year: 2025, value: null, perSqm: null, yearOverYear: null });
  });

  it("returns null per-m² values without an area", () => {
    expect(metricSeries(rows, "RENT").every((p) => p.perSqm === null)).toBe(true);
    expect(metricSeries(rows, "RENT", 0).every((p) => p.perSqm === null)).toBe(true);
  });

  it("does not compute per-m² values for metrics where it is irrelevant", () => {
    const parcels = [{ year: 2026, metric: "PARCELS", value: 5000 }];
    expect(metricSeries(parcels, "PARCELS", 1000)[0]?.perSqm).toBeNull();
  });
});
