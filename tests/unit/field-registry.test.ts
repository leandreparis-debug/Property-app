import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/browser";
import { COMPLETENESS_FIELDS } from "@/domain/compliance";
import { EXCLUDED_FIELDS, FIELD_ENTITIES, FIELD_REGISTRY, fieldId, fieldsOfSection, formatFieldValue, getField, hasField, type FieldDefinition, type FieldType } from "@/domain/fields";

/** Scalar fields of every registry model, read from the Prisma metadata. */
const SCALARS: Record<(typeof FIELD_ENTITIES)[number], readonly string[]> = {
  Site: Object.values(Prisma.SiteScalarFieldEnum),
  Lease: Object.values(Prisma.LeaseScalarFieldEnum),
  ServiceContract: Object.values(Prisma.ServiceContractScalarFieldEnum),
  SiteTechnical: Object.values(Prisma.SiteTechnicalScalarFieldEnum),
  SiteIcpe: Object.values(Prisma.SiteIcpeScalarFieldEnum),
  SiteEnergyProfile: Object.values(Prisma.SiteEnergyProfileScalarFieldEnum),
};

const ids = (list: readonly { entity: string; key: string }[]) => list.map((f) => `${f.entity}.${f.key}`);

describe("field registry: coverage of the Prisma models", () => {
  it("every scalar field is in the registry or in the justified exclusions", () => {
    const covered = new Set([...ids(FIELD_REGISTRY), ...ids(EXCLUDED_FIELDS)]);
    const missing = Object.entries(SCALARS).flatMap(([entity, keys]) => keys.map((k) => `${entity}.${k}`)).filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });

  it("the registry and the exclusions only name existing fields", () => {
    const existing = new Set(Object.entries(SCALARS).flatMap(([entity, keys]) => keys.map((k) => `${entity}.${k}`)));
    expect([...ids(FIELD_REGISTRY), ...ids(EXCLUDED_FIELDS)].filter((id) => !existing.has(id))).toEqual([]);
  });

  it("keys are unique, and no field is both displayed and excluded", () => {
    const registry = ids(FIELD_REGISTRY);
    expect(new Set(registry).size).toBe(registry.length);
    const excluded = ids(EXCLUDED_FIELDS);
    expect(new Set(excluded).size).toBe(excluded.length);
    expect(registry.filter((id) => excluded.includes(id))).toEqual([]);
  });

  it("every exclusion is justified in one line", () => {
    for (const e of EXCLUDED_FIELDS) {
      expect(e.reason.length).toBeGreaterThan(15);
      expect(e.reason).not.toContain("\n");
    }
  });

  it("source columns exist in docs/source-mapping.md", () => {
    const mapping = readFileSync(new URL("../../docs/source-mapping.md", import.meta.url), "utf8");
    for (const def of FIELD_REGISTRY) if (def.sourceColumn) expect(mapping, def.sourceColumn).toContain(`| ${def.sourceColumn} |`);
  });

  it("orders are unique within a section; financial fields are exactly the lease financial terms", () => {
    for (const section of new Set(FIELD_REGISTRY.map((d) => d.section))) {
      const orders = fieldsOfSection(section).map((d) => d.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
    expect(FIELD_REGISTRY.filter((d) => d.financial).every((d) => d.section === "lease_financial")).toBe(true);
    expect(fieldsOfSection("lease_financial").every((d) => d.financial)).toBe(true);
    expect(getField("Lease.marketRentValue").financial).toBe(true);
  });

  it("the completeness score only references registry keys", () => {
    for (const field of COMPLETENESS_FIELDS) for (const id of field.fields) expect(hasField(id), `${field.id} → ${id}`).toBe(true);
    expect(() => getField("Site.nope")).toThrow();
    expect(fieldId({ entity: "Lease", key: "endDate" })).toBe("Lease.endDate");
  });
});

describe("formatFieldValue", () => {
  const def = (type: FieldType, extra: Partial<FieldDefinition> = {}) => ({ type, ...extra });
  const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

  it.each<[FieldType, unknown, string, Partial<FieldDefinition>?]>([
    ["text", "  Lesquin ", "Lesquin"],
    ["longtext", "ligne 1\nligne 2", "ligne 1\nligne 2"],
    ["date", new Date("2027-01-28T00:00:00Z"), "28 janvier 2027"],
    ["dateWithPrecision", { date: new Date("2019-03-01T00:00:00Z"), precision: "month" }, "mars 2019"],
    ["dateWithPrecision", { date: new Date("2019-01-01T00:00:00Z"), precision: "year" }, "2019"],
    ["area", 32150, "32 150 m²"],
    ["money", 1885211.4, "1 885 211 €"],
    ["moneyPerSqm", 58.642, "58,64 €/m²"],
    ["number", 12.5, "12,5 m", { unit: "m" }],
    ["number", 50.594321, "50,594321", { decimals: 6 }],
    ["number", 1_250_000, "1 250 MWh", { unit: "kWh" }],
    ["integer", 29, "29"],
    ["boolean", true, "Oui"],
    ["boolean", false, "Non"],
    ["url", "https://www.georisques.gouv.fr/x", "https://www.georisques.gouv.fr/x"],
    ["reference", "oui", "Oui"],
    ["reference", "\\\\srv\\bail\\DEMO.pdf", "\\\\srv\\bail\\DEMO.pdf"],
    ["enum", "enrichment", "Enrichissement", { options: { enrichment: "Enrichissement" } }],
    ["enum", "other", "other", { options: { enrichment: "Enrichissement" } }],
    ["months", 6, "6 mois"],
  ])("%s %j → %s", (type, value, expected, extra) => {
    expect(nbsp(formatFieldValue(def(type, extra), value))).toBe(nbsp(expected));
  });

  it("a missing value renders « — » for every type", () => {
    const types: FieldType[] = ["text", "longtext", "date", "dateWithPrecision", "area", "money", "moneyPerSqm", "number", "integer", "boolean", "url", "reference", "enum", "months"];
    for (const type of types) {
      for (const empty of [null, undefined, "", "   "]) expect(formatFieldValue(def(type), empty)).toBe("—");
    }
    expect(formatFieldValue(def("area"), Number.NaN)).toBe("—");
    expect(formatFieldValue(def("dateWithPrecision"), { date: null, precision: "day" })).toBe("—");
    expect(formatFieldValue(def("date"), new Date("invalid"))).toBe("—");
  });

  it("accepts Decimal-like values", () => {
    expect(nbsp(formatFieldValue(def("area"), { toNumber: () => 1447 }))).toBe("1 447 m²");
  });
});
