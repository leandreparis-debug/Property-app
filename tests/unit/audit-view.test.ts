import { describe, expect, it } from "vitest";
import { auditQuery, auditValueText, decodeCursor, encodeCursor, fieldLabel, MASKED_VALUE, maskAuditLine, parseAuditFilters } from "@/domain/audit/view";

const masked = JSON.stringify(MASKED_VALUE);

describe("maskAuditLine (without finance:read)", () => {
  const ctx = { finance: false };

  it("masks both values of a financial registry field", () => {
    expect(maskAuditLine({ entityType: "Lease", field: "marketRentValue", beforeValue: '"120000"', afterValue: '"125000"' }, ctx)).toEqual({ beforeValue: masked, afterValue: masked, masked: true });
    // A null value stays null (it reveals nothing).
    expect(maskAuditLine({ entityType: "Lease", field: "rentComments", beforeValue: null, afterValue: '"révisé"' }, ctx)).toEqual({ beforeValue: null, afterValue: masked, masked: true });
  });

  it("leaves non-financial fields of the same entity alone", () => {
    const line = { entityType: "Lease", field: "endDate", beforeValue: '"2027-03-31T00:00:00.000Z"', afterValue: null };
    expect(maskAuditLine(line, ctx)).toEqual({ beforeValue: line.beforeValue, afterValue: line.afterValue, masked: false });
  });

  it("masks only the financial keys of a whole-record line", () => {
    const result = maskAuditLine({ entityType: "Lease", field: null, beforeValue: null, afterValue: JSON.stringify({ code: "B1", marketRentValue: "125000", indexation: "ILAT", endDate: null }) }, ctx);
    expect(result.masked).toBe(true);
    expect(JSON.parse(result.afterValue!)).toEqual({ code: "B1", marketRentValue: MASKED_VALUE, indexation: MASKED_VALUE, endDate: null });
  });

  it("yearly values: financial metrics masked (unknown metric counts as financial), others kept", () => {
    const value = { entityType: "AnnualMetric", field: "value", beforeValue: '"500000"', afterValue: '"510000"' };
    expect(maskAuditLine(value, { finance: false, metricCode: "RENT" }).masked).toBe(true);
    expect(maskAuditLine(value, { finance: false, metricCode: null }).masked).toBe(true);
    expect(maskAuditLine(value, { finance: false, metricCode: "ELECTRICITY" }).masked).toBe(false);
    const create = maskAuditLine({ entityType: "AnnualMetric", field: null, beforeValue: null, afterValue: JSON.stringify({ metric: "RENT", year: 2025, value: "500000" }) }, { finance: false, metricCode: "RENT" });
    expect(JSON.parse(create.afterValue!)).toEqual({ metric: "RENT", year: 2025, value: MASKED_VALUE });
  });

  it("with finance:read nothing is masked", () => {
    const line = { entityType: "Lease", field: "marketRentValue", beforeValue: '"1"', afterValue: '"2"' };
    expect(maskAuditLine(line, { finance: true })).toEqual({ beforeValue: '"1"', afterValue: '"2"', masked: false });
  });
});

describe("labels and values", () => {
  it("registry labels, extra labels, raw name otherwise", () => {
    expect(fieldLabel("Lease", "endDate")).toBe("Date de fin de bail");
    expect(fieldLabel("User", "sessions")).toBe("Sessions");
    expect(fieldLabel("Equipment", "planX")).toBe("planX");
    expect(fieldLabel("Site", null)).toBe("—");
  });

  it("display text of JSON values", () => {
    expect(auditValueText('"Lyon"')).toBe("Lyon");
    expect(auditValueText("true")).toBe("Oui");
    expect(auditValueText(null)).toBe("—");
    expect(auditValueText('{"a":1}')).toBe('{"a":1}');
  });
});

describe("URL filters and cursor", () => {
  it("parses known filters, ignores malformed ones, serializes in a stable order", () => {
    const filters = parseAuditFilters({ source: "ui", from: "2026-10-01", to: "pas-une-date", entity: "Lease", batch: ["ui_abc", "x"], unknown: "1" });
    expect(filters).toEqual({ source: "ui", from: "2026-10-01", entity: "Lease", batch: "ui_abc" });
    expect(auditQuery(filters, { cursor: "c" })).toBe("from=2026-10-01&source=ui&entity=Lease&batch=ui_abc&cursor=c");
    expect(parseAuditFilters({ source: "pirate" })).toEqual({});
  });

  it("encodes and decodes the keyset cursor", () => {
    const cursor = { at: new Date("2026-10-05T08:00:00.123Z"), id: 123456789012n };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor("n'importe quoi")).toBeNull();
  });
});
