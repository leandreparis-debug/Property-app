import { describe, expect, it } from "vitest";
import { buildDictionary, buildDocumentsTable, buildEquipmentTable, buildMetricsTable, buildSitesTable, siteColumns, type ExportSiteRecord } from "@/domain/export/tables";
import { FIELD_REGISTRY } from "@/domain/fields";

const today = new Date("2026-10-05T00:00:00Z");

const site = (code: string, extra: Partial<ExportSiteRecord> = {}): ExportSiteRecord => ({
  site: { id: `id-${code}`, code, name: `Entrepôt ${code}`, isActive: true, city: "Lyon", region: "Auvergne-Rhône-Alpes", archivedAt: null, coordinatesSource: "manual" },
  lease: { code: `B-${code}`, endDate: new Date("2027-03-31T00:00:00Z"), marketRentValue: 125_000, economicRentPerSqm: 48.5 },
  serviceContract: null,
  technical: { totalWarehouseArea: 10_000, surveyedTotalArea: null },
  icpe: null,
  energyProfile: null,
  icpeHeadingsCount: 0,
  ...extra,
});

const metrics = [
  { siteCode: "B2", year: 2025, metric: "RENT", value: 500_000, source: "import", note: null },
  { siteCode: "B2", year: 2025, metric: "ELECTRICITY", value: 1_200_000, source: "manual", note: "relevé" },
  { siteCode: "B2", year: 2024, metric: "RENT", value: 480_000, source: "import", note: null },
];

const col = (table: { columns: { key: string }[] }, key: string) => table.columns.findIndex((c) => c.key === key);

describe("Sites table", () => {
  it("one column per registry field (French label, technical key), then archive and computed columns", () => {
    const columns = siteColumns({ finance: true, today });
    expect(columns.filter((c) => !c.computed && c.key.includes(".") && !c.key.startsWith("Site.archived") && c.key !== "Site.id")).toHaveLength(FIELD_REGISTRY.length);
    expect(columns.find((c) => c.key === "SiteTechnical.landArea")).toMatchObject({ header: "Terrain (m²)", kind: "number", unit: "m²", computed: false });
    expect(columns.find((c) => c.key === "computed.status")).toMatchObject({ header: "Statut de conformité (calculé)", computed: true });
    expect(columns.find((c) => c.key === "computed.perSqm.RENT.2025")).toMatchObject({ header: "Loyer 2025 au m² (€/m²) (calculé)", computed: true });
    // Ambiguous labels are prefixed with their section.
    expect(new Set(columns.map((c) => c.header)).size).toBe(columns.length);
  });

  it("typed cells, compliance status with its label, archived sites included", () => {
    const archived = site("A1", { site: { id: "id-A1", code: "A1", name: "Ancien", isActive: false, archivedAt: new Date("2026-01-10T09:00:00Z") } });
    const table = buildSitesTable([site("B2"), archived], metrics, { finance: true, today });
    expect(table.rows).toHaveLength(2);
    const [a1, b2] = table.rows;
    expect(a1![col(table, "Site.code")]).toBe("A1");
    expect(a1![col(table, "Site.archived")]).toBe(true);
    expect(a1![col(table, "computed.statusCode")]).toBe("unknown");
    expect(a1![col(table, "computed.status")]).toBe("Non évalué");
    expect(b2![col(table, "Site.archived")]).toBe(false);
    expect(b2![col(table, "Lease.endDate")]).toEqual({ dateOnly: new Date("2027-03-31T00:00:00Z") });
    expect(b2![col(table, "Site.coordinatesSource")]).toBe("Saisie manuelle");
    expect(b2![col(table, "computed.referenceArea")]).toBe(10_000);
    expect(b2![col(table, "computed.perSqm.RENT.2025")]).toBe(50);
    expect(b2![col(table, "computed.perSqm.ELECTRICITY.2025")]).toBe(120);
    expect(typeof b2![col(table, "computed.completeness")]).toBe("number");
  });

  it("without finance:read: no financial column at all", () => {
    const table = buildSitesTable([site("B2")], metrics, { finance: false, today });
    const keys = table.columns.map((c) => c.key);
    for (const def of FIELD_REGISTRY.filter((d) => d.financial)) expect(keys).not.toContain(`${def.entity}.${def.key}`);
    expect(keys).not.toContain("computed.perSqm.RENT.2025");
    expect(keys).toContain("computed.perSqm.ELECTRICITY.2025");
    expect(keys).toContain("Lease.endDate");
    expect(JSON.stringify(table.rows)).not.toContain("125000");
    expect(table.rows[0]).toHaveLength(table.columns.length);
  });
});

describe("other tables", () => {
  it("metrics in long format; financial metrics only with finance:read; per-m² computed", () => {
    const sites = [site("B2")];
    const full = buildMetricsTable(metrics, sites, { finance: true, today });
    expect(full.rows).toHaveLength(3);
    expect(full.rows[0]).toEqual(["B2", 2025, "ELECTRICITY", "Consommation d'électricité", "kWh", 1_200_000, 120, "Saisie manuelle", "relevé"]);
    const restricted = buildMetricsTable(metrics, sites, { finance: false, today });
    expect(restricted.rows.map((r) => r[2])).toEqual(["ELECTRICITY"]);
  });

  it("equipment and documents tables", () => {
    const eq = buildEquipmentTable([
      { siteCode: "B2", id: "e1", type: "FIRE_EXTINGUISHER", label: "EXT-01", reference: null, level: "RDC", installedAt: new Date("2024-05-02T00:00:00Z"), latitude: 45.1, longitude: 4.8, planX: null, planY: null, notes: null, archivedAt: null },
    ]);
    expect(eq.rows[0]!.slice(0, 5)).toEqual(["B2", "e1", "FIRE_EXTINGUISHER", "Extincteur", "Incendie"]);
    const docs = buildDocumentsTable([
      { siteCode: "B2", id: "d1", category: "LEASE", title: "Bail", mimeType: "application/pdf", sizeBytes: 1024n, sha256: "ab", storagePath: "documents/x/d1.pdf", uploadedBy: "a@b.fr", createdAt: new Date("2026-01-01T10:00:00Z") },
    ]);
    expect(docs.rows[0]!.slice(0, 7)).toEqual(["B2", "d1", "LEASE", "Bail", "Bail", "application/pdf", 1024]);
  });

  it("the dictionary lists every column with its nature", () => {
    const sitesTable = buildSitesTable([site("B2")], metrics, { finance: true, today });
    const dict = buildDictionary([sitesTable]);
    expect(dict.rows).toHaveLength(sitesTable.columns.length);
    expect(dict.rows).toContainEqual(["Sites", "Statut de conformité (calculé)", "computed.status", null, "Calculé"]);
    expect(dict.rows).toContainEqual(["Sites", "Terrain (m²)", "SiteTechnical.landArea", "m²", "Stocké"]);
  });
});
