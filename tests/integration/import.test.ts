import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ImportPreconditionError, runImport, type ImportOptions } from "@/server/import/run";
import { SpreadsheetFileError } from "@/server/import/workbook";
import { SAMPLE_FACTS } from "../../scripts/lib/sample-spreadsheet";
import { asUser, createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

const SAMPLE = "samples/atlas-sample.xlsx";
const ADMIN = "import-admin@atlas.local";
const NOW = new Date("2026-09-28T10:00:00Z");
const run = (options: Partial<ImportOptions> = {}) =>
  runImport({ filePath: SAMPLE, actorEmail: ADMIN, now: NOW, activityYear: 2025, ...options });

async function tableCounts() {
  return {
    sites: await raw.site.count(),
    leases: await raw.lease.count(),
    technicals: await raw.siteTechnical.count(),
    serviceContracts: await raw.serviceContract.count(),
    icpes: await raw.siteIcpe.count(),
    energy: await raw.siteEnergyProfile.count(),
    externalIds: await raw.siteExternalId.count(),
    buildingWorks: await raw.buildingWork.count(),
    icpeHeadings: await raw.icpeHeading.count(),
    metrics: await raw.annualMetric.count(),
    audit: await raw.auditLog.count(),
    batches: await raw.importBatch.count(),
  };
}

let adminId: string;
async function freshDatabase() {
  await resetDatabase();
  adminId = await createUserFixture(ADMIN, { role: "admin" });
}

afterAll(disconnectAll);

describe("first import of the sample", () => {
  let result: Awaited<ReturnType<typeof run>>;
  beforeAll(async () => {
    await freshDatabase();
    result = await run();
  });

  it("creates the expected sites and rejects the expected rows", async () => {
    expect(result.summary).toMatchObject({
      rowsRead: SAMPLE_FACTS.rows,
      sitesCreated: SAMPLE_FACTS.sites,
      rowsRejected: SAMPLE_FACTS.rejectedRows,
      status: "PARTIAL",
    });
    expect(result.exitCode).toBe(2);
    expect(await raw.site.count()).toBe(SAMPLE_FACTS.sites);
  });

  it("closes the ImportBatch as PARTIAL with hash, statistics and report path", async () => {
    const batch = await raw.importBatch.findUniqueOrThrow({ where: { id: result.batchId! } });
    expect(batch).toMatchObject({ kind: "SPREADSHEET", status: "PARTIAL", fileName: "atlas-sample.xlsx", actorId: adminId });
    expect(batch.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(batch.finishedAt).not.toBeNull();
    expect(batch.reportPath).toBe(`imports/${result.batchId}`);
    expect(JSON.parse(batch.statsJson!)).toMatchObject({ sitesCreated: SAMPLE_FACTS.sites, rowsRejected: 2 });
  });

  it("audits every write with source import and the batch id", async () => {
    const create = await raw.auditLog.findFirstOrThrow({ where: { action: "CREATE", entityType: "Site" } });
    expect(create).toMatchObject({ source: "import", batchId: result.batchId, actorId: adminId });
    expect(await raw.auditLog.count({ where: { NOT: { source: "import" } } })).toBe(0);
    expect(await raw.auditLog.count({ where: { batchId: { not: result.batchId } } })).toBe(0);
    const importLines = await raw.auditLog.findMany({ where: { action: "IMPORT" } });
    expect(importLines).toHaveLength(SAMPLE_FACTS.sites);
    const smp1 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" } });
    const line = importLines.find((l) => l.entityId === smp1.id)!;
    expect(JSON.parse(line.afterValue!)).toEqual({ sourceRow: 4, sheetModifiedAt: "2026-05-15", batchId: result.batchId });
  });

  it("applies the parsing and mapping decisions", async () => {
    const site = (code: string) =>
      raw.site.findUniqueOrThrow({
        where: { code },
        include: { lease: true, technical: true, icpe: true, externalIds: true, buildingWorks: true, icpeHeadings: true, annualMetrics: true },
      });

    const s1 = await site("SMP-001");
    // Formula: cached result, never the formula.
    const rent2025 = s1.annualMetrics.find((m) => m.metric === "RENT" && m.year === 2025)!.value!.toNumber();
    expect(s1.annualMetrics.find((m) => m.metric === "RENT" && m.year === 2026)!.value!.toNumber()).toBe(Math.round(rent2025 * 1.03));
    expect(s1.lease?.documentReference).toBe("https://ged-fictive.example/baux/SMP-001.pdf"); // hyperlink target
    expect(s1.icpe?.georisquesUrl).toBe("https://georisques.example/installation/0000001");
    expect(s1.icpeHeadings.map((h) => [h.code, h.regime]).sort()).toEqual([["1510", "E"], ["2925", "D"], ["4331", "A"]]);
    expect(s1.externalIds.find((e) => e.system === "AL_CODE")?.value).toBe("AL0101");
    expect(s1.addressLine).toBe("11 rue de l'Exemple");
    expect([s1.postalCode, s1.city, s1.country]).toEqual(["69800", "Saint-Priest", "FR"]);
    expect(s1.annualMetrics.some((m) => m.metric === "HEADCOUNT_FTE" && m.year === 2025)).toBe(true);
    expect(s1.buildingWorks.map((w) => [w.kind, w.date?.toISOString().slice(0, 10), w.datePrecision]).sort()).toEqual([
      ["CONSTRUCTION", "1996-01-01", "year"],
      ["EXTENSION", "2010-01-01", "year"],
      ["EXTENSION", "2019-03-01", "month"],
      ["REHABILITATION", "2016-01-01", "year"],
    ]);

    const s2 = await site("SMP-002");
    expect(s2.technical?.totalWarehouseArea?.toNumber()).toBe(32150);
    expect(s2.lease?.rentFreeAmount?.toNumber()).toBe(120000);

    const s3 = await site("SMP-003");
    expect(s3.lease?.code).toBeNull(); // « NC »
    expect(s3.technical?.heightM).toBeNull(); // « N/A »

    const s4 = await site("SMP-004");
    expect([s4.activityStartDate?.toISOString().slice(0, 10), s4.activityStartDatePrecision]).toEqual(["2004-01-01", "year"]);
    expect(s4.lease?.initialEffectiveDate?.toISOString().slice(0, 10)).toBe("2015-03-12");
    expect(s4.buildingWorks.filter((w) => w.kind === "CONSTRUCTION")).toHaveLength(2);

    expect((await site("SMP-005")).lease).toMatchObject({ noticePeriodMonths: 6, noticePeriodRaw: "six mois" });
    const s6 = await site("SMP-006");
    expect([s6.latitude?.toNumber(), s6.longitude?.toNumber()]).toEqual([48.5734, 7.7521]); // swapped back
    const s7 = await site("SMP-007");
    expect([s7.latitude, s7.longitude, s7.coordinatesSource]).toEqual([null, null, null]); // outside France
    expect((await site("SMP-008")).departmentCode).toBe("95");
    expect((await site("SMP-009")).region).toBe("Auvergne-Rhône-Alpes");
    expect((await site("SMP-010")).name).toBe("Entrepôt SMP-010");
    expect((await site("SMP-011")).externalIds.filter((e) => e.system === "QLIK_SENSE")).toHaveLength(3);
    const s12 = await site("SMP-012");
    const idf2022 = s12.annualMetrics.find((m) => m.metric === "OFFICE_TAX" && m.year === 2022)!;
    expect(idf2022.value!.toNumber()).toBe(Math.round(14200 * 0.9 * 1.03)); // IDF value retained
    expect((await site("SMP-017")).lease).toMatchObject({ noticePeriodMonths: null, noticePeriodRaw: "à chaque échéance triennale" });
    expect((await site("SMP-019")).externalIds.some((e) => e.system === "AL_CODE")).toBe(false); // AL code of SMP-001
    expect((await site("SMP-019")).departmentCode).toBe("2A");
    expect((await site("SMP-020")).departmentCode).toBe("37");
  });

  it("writes a report.csv readable by Excel (BOM, ; separator)", () => {
    const csv = readFileSync(join(result.reportDir, "report.csv"), "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("ligne;code entrepôt;colonne source;sévérité;valeur d'origine;valeur retenue;message");
    expect(csv).toMatch(/;SMP-003;ENTREPOT;erreur;;;Code entrepôt « SMP-003 » déjà présent ligne 6/);
    expect(csv).toMatch(/;SMP-006;LAT;avertissement;7\.7521, 48\.5734;48\.5734, 7\.7521;Latitude et longitude inversées/);
    expect(csv).toMatch(/;;COMMENTAIRE INTERNE;avertissement;;;Colonne inconnue/);
    expect(csv).toMatch(/SMP-019;CODE AL;erreur;AL0101;;Identifiant AL_CODE « AL0101 » déjà rattaché au site « SMP-001 »/);
    const summary = JSON.parse(readFileSync(join(result.reportDir, "summary.json"), "utf8"));
    expect(summary.perSqmArea.likelyBasis).toBe("total");
    expect(summary.sitesWithSeveralQlikKeys).toBe(1);
    expect(summary.references.BAIL).toMatchObject({ url: 1, unc_path: 1 });
    expect(result.consoleSummary).toMatch(/Sites créés \.+ 20/);
  });

  it("re-importing the same file writes nothing but the batch and its IMPORT lines", async () => {
    const before = await tableCounts();
    const businessAudit = await raw.auditLog.count({ where: { NOT: { action: "IMPORT" } } });
    const updatedAt = (await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" } })).updatedAt;
    const again = await run();
    expect(again.summary).toMatchObject({ sitesCreated: 0, sitesUpdated: 0, sitesUnchanged: SAMPLE_FACTS.sites, fieldChanges: 0 });
    const after = await tableCounts();
    expect(after).toEqual({ ...before, audit: before.audit + SAMPLE_FACTS.sites, batches: before.batches + 1 });
    expect(await raw.auditLog.count({ where: { NOT: { action: "IMPORT" } } })).toBe(businessAudit);
    expect((await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" } })).updatedAt).toEqual(updatedAt);
  });
});

describe("preservation rule", () => {
  beforeEach(async () => {
    await freshDatabase();
    await run();
  });

  it("keeps fields last written from the interface, counts them, and --force overwrites them", async () => {
    const site = await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" }, include: { lease: true } });
    await asUser(adminId, () => db.site.update({ where: { id: site.id }, data: { name: "Nom corrigé à la main" } }));
    await asUser(adminId, () => db.lease.update({ where: { id: site.lease!.id }, data: { indexation: "ILC trimestriel" } }));
    const metric = await raw.annualMetric.findFirstOrThrow({ where: { siteId: site.id, metric: "RENT", year: 2024 } });
    await asUser(adminId, () => db.annualMetric.update({ where: { id: metric.id }, data: { value: 1, source: "manual" } }));

    const preserved = await run();
    expect(preserved.summary.preservedFields).toBe(3);
    expect(preserved.summary.sitesUnchanged).toBe(SAMPLE_FACTS.sites);
    expect((await raw.site.findUniqueOrThrow({ where: { id: site.id } })).name).toBe("Nom corrigé à la main");
    expect((await raw.lease.findUniqueOrThrow({ where: { siteId: site.id } })).indexation).toBe("ILC trimestriel");
    expect((await raw.annualMetric.findUniqueOrThrow({ where: { id: metric.id } })).value?.toNumber()).toBe(1);
    expect(preserved.issues.filter((i) => i.kind === "preserved_field")).toHaveLength(3);
    expect(readFileSync(join(preserved.reportDir, "changes.csv"), "utf8")).toMatch(/SMP-001;Site;name;Nom corrigé à la main;Entrepôt Fictif Lyon-Est;préservé/);

    const forced = await run({ force: true });
    expect(forced.summary).toMatchObject({ preservedFields: 0, sitesUpdated: 1, fieldChanges: 3 });
    expect((await raw.site.findUniqueOrThrow({ where: { id: site.id } })).name).toBe("Entrepôt Fictif Lyon-Est");
    const restored = await raw.annualMetric.findUniqueOrThrow({ where: { id: metric.id } });
    expect([restored.source, restored.value?.toNumber() !== 1]).toEqual(["import", true]);

    // After a forced import, the last write is « import » again: no more preservation.
    const again = await run();
    expect(again.summary.preservedFields).toBe(0);
  });

  it("still updates fields last written by a previous import", async () => {
    const site = await raw.site.findUniqueOrThrow({ where: { code: "SMP-002" } });
    await raw.site.update({ where: { id: site.id }, data: { name: "Valeur modifiée hors audit" } });
    const result = await run();
    expect(result.summary).toMatchObject({ preservedFields: 0, sitesUpdated: 1 });
    expect((await raw.site.findUniqueOrThrow({ where: { id: site.id } })).name).toBe("Entrepôt Fictif Lille-Sud");
  });
});

describe("dry run", () => {
  it("writes nothing at all (not even ImportBatch), on an empty or populated database", async () => {
    await freshDatabase();
    const empty = await tableCounts();
    const planned = await run({ dryRun: true });
    expect(await tableCounts()).toEqual(empty);
    expect(planned.batchId).toBeNull();
    expect(planned.summary).toMatchObject({ mode: "simulation", sitesCreated: SAMPLE_FACTS.sites });
    expect(planned.reportDir).toMatch(/imports\/dry-run-2026-09-28T10-00-00$/);
    expect(readFileSync(join(planned.reportDir, "changes.csv"), "utf8")).toMatch(/SMP-001;Site;name;;Entrepôt Fictif Lyon-Est;création/);

    await run();
    const populated = await tableCounts();
    const second = await run({ dryRun: true });
    expect(await tableCounts()).toEqual(populated);
    expect(second.summary.sitesUnchanged).toBe(SAMPLE_FACTS.sites);
  });
});

describe("robustness", () => {
  beforeEach(freshDatabase);

  it("refuses an actor who is not an active admin", async () => {
    await createUserFixture("editeur@atlas.local", { role: "editor" });
    await createUserFixture("ancien-admin@atlas.local", { role: "admin", isActive: false });
    for (const email of ["editeur@atlas.local", "ancien-admin@atlas.local", "inconnu@atlas.local"]) {
      await expect(run({ actorEmail: email })).rejects.toThrow(ImportPreconditionError);
    }
    expect(await raw.importBatch.count()).toBe(0);
  });

  it("isolates sites: a failing site does not cancel the others", async () => {
    const result = await run({
      faultInjector: (code) => {
        if (code === "SMP-005") throw new Error("panne simulée");
      },
    });
    expect(result.summary).toMatchObject({ sitesCreated: SAMPLE_FACTS.sites - 1, rowsRejected: SAMPLE_FACTS.rejectedRows + 1, status: "PARTIAL" });
    expect(await raw.site.count()).toBe(SAMPLE_FACTS.sites - 1);
    expect(await raw.site.findUnique({ where: { code: "SMP-005" } })).toBeNull();
    expect(await raw.auditLog.count({ where: { entityType: "Site", afterValue: { contains: "SMP-005" } } })).toBe(0);
    expect(result.issues.find((i) => i.kind === "site_write_failed")).toMatchObject({ code: "SMP-005", severity: "error" });
  });

  it("never modifies a site absent from the file, and lists it", async () => {
    const other = await raw.site.create({ data: { code: "HORS-FICHIER", name: "Site absent du fichier" } });
    const result = await run();
    expect(result.summary.missingFromFile).toEqual([{ code: "HORS-FICHIER", name: "Site absent du fichier" }]);
    const after = await raw.site.findUniqueOrThrow({ where: { id: other.id } });
    expect(after).toEqual(other);
    expect(await raw.auditLog.count({ where: { siteId: other.id } })).toBe(0);
  });

  it("refuses files that are not .xlsx, not ZIP or too large", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-import-"));
    const csv = join(dir, "fichier.csv");
    writeFileSync(csv, "ENTREPOT;NOM ENTREPOT\n");
    await expect(run({ filePath: csv })).rejects.toThrow(/seul le format \.xlsx/);
    const fake = join(dir, "faux.xlsx");
    writeFileSync(fake, "pas un zip");
    await expect(run({ filePath: fake })).rejects.toThrow(SpreadsheetFileError);
    const big = join(dir, "gros.xlsx");
    writeFileSync(big, Buffer.alloc(21 * 1024 * 1024));
    await expect(run({ filePath: big })).rejects.toThrow(/trop volumineux/);
    await expect(run({ sheetName: "Inexistante" })).rejects.toThrow(/Feuille « Inexistante » introuvable/);
  });
});
