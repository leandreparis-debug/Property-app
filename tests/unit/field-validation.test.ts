import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMN_LENGTHS } from "@/domain/fields/column-lengths";
import { FIELD_REGISTRY, getField } from "@/domain/fields";
import { columnLengths } from "@/domain/fields/schema-lengths";
import { buildSectionSchema, computeChanges, crossFieldRules, detectConflicts, editableFields, fieldErrors, refusedKeys } from "@/domain/fields/validation";
import { toWire, wireEquals, wireToForm } from "@/domain/fields/wire";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const parse = (section: Parameters<typeof buildSectionSchema>[0], input: Record<string, unknown>) => buildSectionSchema(section).safeParse(input);
const errorsOf = (section: Parameters<typeof buildSectionSchema>[0], input: Record<string, unknown>) => {
  const r = parse(section, input);
  return r.success ? {} : fieldErrors(r.error);
};

describe("registry: editability and constraints", () => {
  it("non-editable fields: the import key, system and original texts", () => {
    expect(FIELD_REGISTRY.filter((f) => !f.editable).map((f) => `${f.entity}.${f.key}`).sort()).toEqual(["Lease.noticePeriodRaw", "Site.code", "Site.coordinatesSource", "SiteIcpe.headingsRaw"]);
  });

  it("text lengths come from the Prisma schema (generated table in sync)", () => {
    expect(COLUMN_LENGTHS).toEqual(columnLengths(readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8")));
    expect(getField("Site.name").constraints?.maxLength).toBe(200);
    expect(getField("Lease.currentTerms").constraints?.maxLength).toBeNull();
    for (const f of FIELD_REGISTRY) if (["text", "longtext", "url", "reference"].includes(f.type)) expect(f.constraints?.maxLength, `${f.entity}.${f.key}`).not.toBeUndefined();
  });
});

describe("buildSectionSchema", () => {
  it("French numbers are converted and rounded to the column scale", () => {
    const r = parse("technical_surfaces", { dryArea: "12 500,5", landArea: "83 590", packagingArea: "1 234,567" });
    expect(r.success && r.data).toEqual({ dryArea: 12500.5, landArea: 83590, packagingArea: 1234.57 });
    expect(parse("technical_surfaces", { dryArea: "12 500,50 m²" }).data).toEqual({ dryArea: 12500.5 });
  });

  it("an empty string becomes null, for every type", () => {
    const r = parse("lease", { code: "  ", endDate: "", noticePeriodMonths: "", renewalConditionsSigned: "" });
    expect(r.data).toEqual({ code: null, endDate: null, noticePeriodMonths: null, renewalConditionsSigned: null });
    expect(parse("identity", { activityStartDate: { date: "", precision: "day" } }).data).toEqual({ activityStartDate: null });
  });

  it("dates and dates with precision", () => {
    expect(parse("lease", { endDate: "2027-01-28" }).data).toEqual({ endDate: d("2027-01-28") });
    expect(parse("lease", { endDate: "28/01/2027" }).data).toEqual({ endDate: d("2027-01-28") });
    expect(errorsOf("lease", { endDate: "2027-02-30" })).toEqual({ endDate: "Date invalide (jour, mois et année attendus)." });
    expect(parse("identity", { activityStartDate: { date: "2019-03-17", precision: "month" } }).data).toEqual({ activityStartDate: { date: d("2019-03-01"), precision: "month" } });
    expect(parse("identity", { activityStartDate: { date: "2019-03-17", precision: "year" } }).data).toEqual({ activityStartDate: { date: d("2019-01-01"), precision: "year" } });
    expect(errorsOf("identity", { activityStartDate: { date: "2019-03-17", precision: "week" } })).toEqual({ activityStartDate: "Précision inconnue." });
  });

  it("bounds, integers and maximum length, with French messages", () => {
    expect(errorsOf("technical_surfaces", { dryArea: "-5" })).toEqual({ dryArea: "La valeur doit être supérieure ou égale à 0." });
    expect(errorsOf("technical_surfaces", { dryArea: "abc" })).toEqual({ dryArea: "Nombre invalide (exemple : 12 345,67)." });
    expect(errorsOf("technical_capacities", { dockCount: "12,5" })).toEqual({ dockCount: "Nombre entier attendu." });
    expect(errorsOf("location", { latitude: "95" })).toEqual({ latitude: "La valeur doit être inférieure ou égale à 90." });
    expect(errorsOf("identity", { name: "x".repeat(201) })).toEqual({ name: "200 caractères au maximum (201 saisis)." });
    expect(parse("identity", { name: "  Entrepôt   Nord  " }).data).toEqual({ name: "Entrepôt Nord" });
  });

  it("booleans, enumerations, departments, regions and URLs", () => {
    expect(parse("lease", { renewalConditionsSigned: "true" }).data).toEqual({ renewalConditionsSigned: true });
    expect(parse("lease", { renewalConditionsSigned: "false" }).data).toEqual({ renewalConditionsSigned: false });
    expect(errorsOf("lease", { renewalConditionsSigned: "peut-être" })).toEqual({ renewalConditionsSigned: "Valeur attendue : Oui, Non ou Non renseigné." });
    expect(parse("location", { departmentCode: "Nord", region: "hauts de france" }).data).toEqual({ departmentCode: "59", region: "Hauts-de-France" });
    expect(errorsOf("location", { departmentCode: "999" })).toEqual({ departmentCode: "Département inconnu (numéro ou nom attendu)." });
    expect(errorsOf("location", { region: "Atlantide" })).toEqual({ region: "Région inconnue." });
    expect(errorsOf("icpe", { georisquesUrl: "javascript:alert(1)" })).toEqual({ georisquesUrl: "Adresse web invalide : un lien http ou https complet est attendu." });
  });

  it("white list: a non-editable or unknown field is refused, never ignored", () => {
    expect(parse("identity", { code: "NEW-CODE" }).success).toBe(false);
    expect(errorsOf("identity", { code: "X" })._form).toMatch(/^Champ non modifiable : code/);
    expect(parse("identity", { version: "3" }).success).toBe(false);
    expect(parse("location", { coordinatesSource: "manual" }).success).toBe(false);
    expect(refusedKeys("identity", ["name", "code", "createdAt", "nope"])).toEqual(["code", "createdAt", "nope"]);
    expect(refusedKeys("lease", ["name"])).toEqual(["name"]); // a field of another section
    expect(editableFields("identity").some((f) => f.key === "code")).toBe(false);
  });
});

describe("crossFieldRules", () => {
  it("errors: effective date after end, notice outside 0–60, coordinates", () => {
    expect(crossFieldRules("lease", { initialEffectiveDate: d("2030-01-01"), endDate: d("2027-01-01") }).errors.map((e) => e.field)).toEqual(["initialEffectiveDate"]);
    expect(crossFieldRules("lease", { noticePeriodMonths: 61 }).errors[0]?.message).toBe("Le préavis doit être compris entre 0 et 60 mois.");
    expect(crossFieldRules("lease", { noticePeriodMonths: 60 }).errors).toEqual([]);
    expect(crossFieldRules("location", { latitude: 48.85, longitude: null }).errors[0]?.field).toBe("longitude");
    expect(crossFieldRules("location", { latitude: null, longitude: 2.35 }).errors[0]?.field).toBe("latitude");
    expect(crossFieldRules("location", { latitude: 40.4, longitude: -3.7 }).errors[0]?.message).toBe("Coordonnées hors de France métropolitaine.");
    expect(crossFieldRules("location", { latitude: 48.85, longitude: 2.35 }).errors).toEqual([]);
  });

  it("warnings: region of the department proposed, surfaces, height, rent per m²", () => {
    const region = crossFieldRules("location", { departmentCode: "59", region: "Bretagne" }).warnings[0];
    expect(region).toMatchObject({ field: "region", suggestion: { field: "region", value: "Hauts-de-France" } });
    expect(crossFieldRules("location", { departmentCode: "59", region: "Hauts-de-France" }).warnings).toEqual([]);
    expect(crossFieldRules("technical_surfaces", { totalWarehouseArea: 1000, dryArea: 800, socialOfficeArea: 300 }).warnings).toHaveLength(1);
    expect(crossFieldRules("technical_surfaces", { totalWarehouseArea: 1000, dryArea: 800 }).warnings).toEqual([]);
    expect(crossFieldRules("technical_capacities", { heightM: 41 }).warnings[0]?.field).toBe("heightM");
    expect(crossFieldRules("technical_capacities", { heightM: 40 }).warnings).toEqual([]);
    for (const [rent, n] of [[4.99, 1], [5, 0], [300, 0], [300.01, 1]] as const) expect(crossFieldRules("lease_financial", { economicRentPerSqm: rent }).warnings).toHaveLength(n);
  });
});

describe("changes and conflicts", () => {
  it("only the modified fields are changes (numbers compared by value, dates by day)", () => {
    const initial = { dryArea: 12000, landArea: 83590, packagingArea: null };
    const form = { dryArea: "12 000,00", landArea: "83 591", packagingArea: "" };
    const parsed = parse("technical_surfaces", form).data!;
    expect(computeChanges("technical_surfaces", initial, form, parsed)).toEqual({ landArea: { from: 83590, to: "83 591" } });
    const lease = { endDate: "2027-01-28" };
    expect(computeChanges("lease", lease, { endDate: "28/01/2027" }, parse("lease", { endDate: "28/01/2027" }).data!)).toEqual({});
  });

  it("conflict on the same field; none on other fields; null values", () => {
    const changes = { dryArea: { from: 100, to: "200" }, landArea: { from: null, to: "50" } };
    expect(detectConflicts(changes, { dryArea: 100, landArea: null, packagingArea: 999 })).toEqual([]);
    expect(detectConflicts(changes, { dryArea: 150, landArea: null })).toEqual([{ field: "dryArea", yours: "200", base: 100, theirs: 150 }]);
    expect(detectConflicts(changes, { dryArea: 100, landArea: 7 })).toEqual([{ field: "landArea", yours: "50", base: null, theirs: 7 }]);
    expect(detectConflicts({ dryArea: { from: 100, to: "" } }, { dryArea: null })).toHaveLength(1);
  });

  it("wire values round-trip through the form", () => {
    const def = getField("SiteTechnical.dryArea");
    expect(wireToForm(def, toWire(def, { toNumber: () => 12500.5 }))).toBe("12500,5");
    const date = getField("Site.activityStartDate");
    expect(toWire(date, d("2001-03-01"), "month")).toEqual({ date: "2001-03-01", precision: "month" });
    expect(wireToForm(date, null)).toEqual({ date: "", precision: "day" });
    expect(wireEquals({ date: "2001-03-01", precision: "month" }, { date: "2001-03-01", precision: "day" })).toBe(false);
    expect(wireToForm(getField("Lease.renewalConditionsSigned"), false)).toBe("false");
  });
});
