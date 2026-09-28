import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { diffRecords } from "@/server/audit/diff";
import { serializeAuditValue, toAuditJson } from "@/server/audit/serialize";

const D = (v: string) => new Prisma.Decimal(v);

describe("serializeAuditValue", () => {
  it("serializes scalars", () => {
    expect(serializeAuditValue("BAIL-1")).toBe('"BAIL-1"');
    expect(serializeAuditValue(42)).toBe("42");
    expect(serializeAuditValue(false)).toBe("false");
    expect(serializeAuditValue(D("1234.50"))).toBe('"1234.5"');
    expect(serializeAuditValue(D("12345678901234.5678"))).toBe('"12345678901234.5678"');
    expect(serializeAuditValue(new Date("2026-03-12T00:00:00.000Z"))).toBe('"2026-03-12T00:00:00.000Z"');
    expect(serializeAuditValue(123456789012345678901234567890n)).toBe('"123456789012345678901234567890"');
  });

  it("maps null and undefined to SQL NULL", () => {
    expect(serializeAuditValue(null)).toBeNull();
    expect(serializeAuditValue(undefined)).toBeNull();
  });

  it("is stable: keys sorted, undefined properties dropped, null kept", () => {
    const a = serializeAuditValue({ b: 1, a: null, c: undefined, d: { z: D("1.10"), y: new Date(0) } });
    const b = serializeAuditValue({ d: { y: new Date(0), z: D("1.1") }, a: null, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":null,"b":1,"d":{"y":"1970-01-01T00:00:00.000Z","z":"1.1"}}');
  });

  it("handles arrays, invalid dates and non-finite numbers", () => {
    expect(toAuditJson([1, undefined, null])).toEqual([1, null, null]);
    expect(toAuditJson(new Date("invalid"))).toBeNull();
    expect(toAuditJson(Number.NaN)).toBe("NaN");
  });
});

describe("diffRecords", () => {
  const before = {
    id: "s1",
    name: "Entrepôt A",
    latitude: D("45.710600"),
    activityStartDate: new Date("2020-03-01T00:00:00Z"),
    storesServedCount: 40,
    legacyNumber: null as string | null,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1,
  };

  it("reports nothing when nothing changed (Decimal and Date compared by value)", () => {
    const same = {
      ...before,
      latitude: D("45.7106"),
      activityStartDate: new Date("2020-03-01T00:00:00Z"),
    };
    expect(diffRecords(before, same)).toEqual([]);
  });

  it("reports one change per field, sorted, with serialized values", () => {
    const after = { ...before, name: "Entrepôt B", latitude: D("45.8"), storesServedCount: 41 };
    expect(diffRecords(before, after)).toEqual([
      { field: "latitude", before: '"45.7106"', after: '"45.8"' },
      { field: "name", before: '"Entrepôt A"', after: '"Entrepôt B"' },
      { field: "storesServedCount", before: "40", after: "41" },
    ]);
  });

  it("treats null and undefined as the same empty value", () => {
    expect(diffRecords({ a: null }, { a: undefined })).toEqual([]);
    expect(diffRecords({ a: null }, { a: "x" })).toEqual([{ field: "a", before: null, after: '"x"' }]);
    expect(diffRecords({ a: "x" }, {})).toEqual([{ field: "a", before: '"x"', after: null }]);
  });

  it("skips ignored fields", () => {
    const after = { ...before, updatedAt: new Date(), version: 2 };
    expect(diffRecords(before, after, ["updatedAt", "version"])).toEqual([]);
    expect(diffRecords(before, after, new Set(["updatedAt"]))).toEqual([{ field: "version", before: "1", after: "2" }]);
  });

  it("detects date and BigInt changes", () => {
    expect(diffRecords({ d: new Date(0), n: 1n }, { d: new Date(1), n: 2n }).map((c) => c.field)).toEqual(["d", "n"]);
  });
});
