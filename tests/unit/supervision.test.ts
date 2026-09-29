import { describe, expect, it } from "vitest";
import { computeSupervision, roundedPercentages } from "@/domain/supervision";
import { entry } from "./site-index-fixtures";

describe("roundedPercentages", () => {
  it("totals 100 exactly", () => {
    for (const counts of [[1, 1, 1], [1, 2, 3, 4], [7, 0, 0, 0], [33, 33, 34], [1, 5, 3, 21]]) {
      expect(roundedPercentages(counts).reduce((s, v) => s + v, 0)).toBe(100);
    }
    expect(roundedPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundedPercentages([0, 0])).toEqual([0, 0]);
  });
});

describe("computeSupervision", () => {
  it("empty list", () => {
    const s = computeSupervision([]);
    expect(s).toMatchObject({ total: 0, leaseAlerts: 0, averageCompleteness: null, totalArea: 0, anomalies: [], regions: [] });
    expect(s.shares.every((x) => x.pct === 0 && x.count === 0)).toBe(true);
  });

  it("indicators", () => {
    const s = computeSupervision([
      entry({ code: "A", name: "A", status: "critical", statusRank: 3, region: "Corse", leaseDeadlineBucket: "overdue", completeness: 50, totalArea: 1000 }),
      entry({ code: "B", name: "B", status: "warning", statusRank: 2, region: "Bretagne", leaseDeadlineBucket: "lt3m", completeness: 70, totalArea: 2000 }),
      entry({ code: "C", name: "C", status: "warning", statusRank: 2, region: "Bretagne", leaseDeadlineBucket: "gt12m", completeness: 90, totalArea: null }),
      entry({ code: "D", name: "D", status: "ok", region: "Bretagne", leaseDeadlineBucket: "lt6m", completeness: 100 }),
    ]);
    expect(s.total).toBe(4);
    expect(s.shares.map((x) => [x.status, x.count, x.pct])).toEqual([["critical", 1, 25], ["warning", 2, 50], ["unknown", 0, 0], ["ok", 1, 25]]);
    expect(s.leaseAlerts).toBe(3);
    expect(s.averageCompleteness).toBe(78);
    expect(s.totalArea).toBe(23000);
    expect(s.anomalies.map((e) => e.code)).toEqual(["A", "B", "C"]);
    expect(s.regions.map((r) => [r.region, r.counts.critical, r.total])).toEqual([["Corse", 1, 1], ["Bretagne", 0, 3]]);
    expect(s.deadlines.find((d) => d.bucket === "overdue")?.count).toBe(1);
  });
});
