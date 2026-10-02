import { describe, expect, it } from "vitest";
import {
  AuditAction,
  AuditSource,
  BuildingWorkKind,
  DataSource,
  DocumentCategory,
  ExternalSystem,
  IcpeRegime,
  ImportBatchKind,
  ImportBatchStatus,
  UserRole,
  type EnumDefinition,
} from "@/domain/enums";

const cases: [string, EnumDefinition<string>, string[]][] = [
  ["DataSource", DataSource, ["import", "manual", "enrichment"]],
  ["ExternalSystem", ExternalSystem, ["QLIK_SENSE", "AL_CODE", "RAMSES"]],
  ["BuildingWorkKind", BuildingWorkKind, ["CONSTRUCTION", "REHABILITATION", "EXTENSION"]],
  ["IcpeRegime", IcpeRegime, ["A", "E", "D", "DC", "NC", "UNKNOWN"]],
  [
    "DocumentCategory",
    DocumentCategory,
    ["LEASE", "PLAN", "ADMIN", "ICPE", "ENERGY", "PHOTO", "CONTROL_REPORT", "AUDIT", "N100", "VISIT_REPORT", "DAMAGE_INSURANCE", "OTHER"],
  ],
  ["UserRole", UserRole, ["admin", "editor", "viewer"]],
  ["AuditAction", AuditAction, ["CREATE", "UPDATE", "DELETE", "IMPORT", "ENRICH", "LOGIN", "LOGIN_FAILED", "LOGOUT"]],
  ["AuditSource", AuditSource, ["ui", "import", "enrichment", "system"]],
  ["ImportBatchKind", ImportBatchKind, ["SPREADSHEET", "ENRICHMENT"]],
  ["ImportBatchStatus", ImportBatchStatus, ["RUNNING", "SUCCEEDED", "FAILED", "PARTIAL"]],
];

describe.each(cases)("%s", (_name, definition, expected) => {
  it("lists exactly the allowed values", () => {
    expect([...definition.values]).toEqual(expected);
  });

  it("accepts every allowed value", () => {
    for (const value of expected) {
      expect(definition.schema.parse(value)).toBe(value);
      expect(definition.is(value)).toBe(true);
    }
  });

  it("rejects other values (case-sensitive, no trimming)", () => {
    for (const value of ["", "OTHER_VALUE", `${expected[0]} `, expected[0]!.toLowerCase() === expected[0] ? expected[0]!.toUpperCase() : expected[0]!.toLowerCase(), null, undefined, 1]) {
      expect(definition.schema.safeParse(value).success, String(value)).toBe(false);
      expect(definition.is(value)).toBe(false);
    }
  });

  it("has a French label for every value", () => {
    for (const value of expected) expect(definition.label(value)).toMatch(/\S/);
  });

  it("fits the NVARCHAR(20) columns", () => {
    for (const value of expected) expect(value.length).toBeLessThanOrEqual(20);
  });
});

