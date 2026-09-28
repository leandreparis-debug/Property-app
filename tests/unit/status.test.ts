import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_STATUSES,
  STATUS_META,
  STATUSES_BY_SEVERITY,
  compareStatusSeverity,
  getStatusLabel,
  isComplianceStatus,
  type ComplianceStatus,
} from "@/lib/status";

describe("status labels", () => {
  it("has a French label for every status", () => {
    expect(getStatusLabel("ok")).toBe("Conforme");
    expect(getStatusLabel("warning")).toBe("À surveiller");
    expect(getStatusLabel("critical")).toBe("Critique");
    expect(getStatusLabel("unknown")).toBe("Non évalué");
  });

  it("maps each status to its reserved color token", () => {
    for (const status of COMPLIANCE_STATUSES) {
      expect(STATUS_META[status].token).toBe(`--color-status-${status}`);
      expect(STATUS_META[status].bgClass).toBe(`bg-status-${status}`);
    }
  });

  it("makes ok the most discreet and critical the most salient", () => {
    expect(STATUS_META.ok.emphasis).toBe("subtle");
    expect(STATUS_META.critical.emphasis).toBe("salient");
  });
});

describe("compareStatusSeverity", () => {
  it("orders critical > warning > unknown > ok", () => {
    expect(compareStatusSeverity("critical", "warning")).toBeLessThan(0);
    expect(compareStatusSeverity("warning", "unknown")).toBeLessThan(0);
    expect(compareStatusSeverity("unknown", "ok")).toBeLessThan(0);
    expect(compareStatusSeverity("ok", "critical")).toBeGreaterThan(0);
    expect(compareStatusSeverity("warning", "warning")).toBe(0);
  });

  it("sorts a mixed array, most severe first", () => {
    const mixed: ComplianceStatus[] = [
      "ok", "unknown", "critical", "ok", "warning", "critical", "unknown", "warning",
    ];
    expect([...mixed].sort(compareStatusSeverity)).toEqual([
      "critical", "critical", "warning", "warning", "unknown", "unknown", "ok", "ok",
    ]);
  });

  it("ranks unknown above ok but below warning", () => {
    expect(["ok", "unknown", "warning"].sort(compareStatusSeverity as never)).toEqual([
      "warning", "unknown", "ok",
    ]);
  });

  it("keeps the display order consistent with the comparator", () => {
    expect([...COMPLIANCE_STATUSES].sort(compareStatusSeverity)).toEqual(STATUSES_BY_SEVERITY);
  });
});

describe("isComplianceStatus", () => {
  it("accepts known statuses only", () => {
    expect(isComplianceStatus("unknown")).toBe(true);
    expect(isComplianceStatus("Critique")).toBe(false);
    expect(isComplianceStatus(null)).toBe(false);
    expect(isComplianceStatus(3)).toBe(false);
  });
});
