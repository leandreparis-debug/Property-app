import { describe, expect, it } from "vitest";
import {
  METRICS,
  METRIC_CODES,
  getMetric,
  isMetricCode,
  metricCodeSchema,
  metricsByDomain,
} from "@/domain/metrics";

describe("metric catalogue", () => {
  it("has unique codes", () => {
    expect(new Set(METRIC_CODES).size).toBe(METRICS.length);
  });

  it("gives every metric a unit, a French label, a domain and source columns", () => {
    for (const m of METRICS) {
      expect(m.unit, m.code).toMatch(/\S/);
      expect(m.labelFr, m.code).toMatch(/\S/);
      expect(["FINANCIAL", "ENERGY", "ACTIVITY"]).toContain(m.domain);
      expect(m.sourceColumns.length, m.code).toBeGreaterThan(0);
      expect(typeof m.perSqmRelevant).toBe("boolean");
    }
  });

  it("uses upper snake case codes that fit the NVARCHAR(40) column", () => {
    for (const code of METRIC_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(code.length).toBeLessThanOrEqual(40);
    }
  });

  it("contains the 15 metrics of the specification", () => {
    expect(METRIC_CODES).toEqual([
      "RENT", "RENT_COLLECTED", "CHARGES", "CHARGES_PROVISION", "INSURANCE", "PROPERTY_TAX",
      "TAXES_TOTAL", "OFFICE_TAX", "PARKING_TAX", "ELECTRICITY", "GAS", "WATER",
      "HEADCOUNT_FTE", "MERCHANDISE_REVENUE", "PARCELS",
    ]);
    expect(getMetric("ELECTRICITY")).toMatchObject({ domain: "ENERGY", unit: "kWh" });
    expect(getMetric("WATER").unit).toBe("m³");
    expect(getMetric("PARCELS")).toMatchObject({ domain: "ACTIVITY", unit: "colis", perSqmRelevant: false });
  });

  it("maps no spreadsheet column twice", () => {
    const columns = METRICS.flatMap((m) => m.sourceColumns);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("validates codes", () => {
    expect(metricCodeSchema.safeParse("RENT").success).toBe(true);
    expect(metricCodeSchema.safeParse("RENT_PER_SQM").success).toBe(false);
    expect(isMetricCode("GAS")).toBe(true);
    expect(isMetricCode("gas")).toBe(false);
    expect(isMetricCode(null)).toBe(false);
  });

  it("groups metrics by domain", () => {
    expect(metricsByDomain("ENERGY").map((m) => m.code)).toEqual(["ELECTRICITY", "GAS", "WATER"]);
    expect(metricsByDomain("ACTIVITY")).toHaveLength(3);
    expect(metricsByDomain("FINANCIAL")).toHaveLength(9);
  });
});

describe("metricValueSchema", () => {
  it("accepts values that round-trip exactly", async () => {
    const { metricValueSchema } = await import("@/domain/metrics");
    for (const v of [0, -1, 1234.5678, 99_999_999_999.9999, -99_999_999_999.9999]) {
      expect(metricValueSchema.safeParse(v).success, String(v)).toBe(true);
    }
  });
  it("rejects values beyond the driver precision, NaN and more than 4 decimals", async () => {
    const { metricValueSchema } = await import("@/domain/metrics");
    for (const v of [1e11, -1e11, 12_345_678_901_234.5678, Number.NaN, Infinity, 1.23456]) {
      expect(metricValueSchema.safeParse(v).success, String(v)).toBe(false);
    }
  });
});
