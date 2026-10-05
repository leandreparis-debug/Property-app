import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sitesExportSchema } from "@/domain/enrichment-format";
import { exportSitesForEnrichment } from "@/server/enrichment/export";
import { EnrichmentPreconditionError, runEnrichment } from "@/server/enrichment/run";
import { runImport } from "@/server/import/run";
import { db } from "@/server/db";
import { enrichSites } from "../../tools/offline-bundle/enrich";
import { fixtureFetch } from "../../tools/offline-bundle/fixtures";
import { HttpClient } from "../../tools/offline-bundle/http";
import { PROVIDERS } from "../../tools/offline-bundle/providers";
import { asUser, createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

/**
 * Whole enrichment chain on the synthetic sample: export → offline-bundle
 * tool in FIXTURES mode (no network) → enrichment:apply.
 */

const ADMIN = "enrich-admin@vigie.local";
const EDITOR = "enrich-editor@vigie.local";
const dir = mkdtempSync(join(tmpdir(), "vigie-enrichment-"));
const enrichmentPath = join(dir, "enrichment.json");
let adminId: string;
let editorId: string;

async function counts() {
  return {
    audit: await raw.auditLog.count(),
    auditEnrichment: await raw.auditLog.count({ where: { source: "enrichment" } }),
    publicData: await raw.sitePublicData.count(),
    geometries: await raw.siteGeometry.count(),
    icpes: await raw.siteIcpe.count(),
    batches: await raw.importBatch.count(),
    siteVersions: (await raw.site.findMany({ select: { version: true } })).reduce((s, r) => s + r.version, 0),
  };
}

beforeAll(async () => {
  await resetDatabase();
  adminId = await createUserFixture(ADMIN, { role: "admin" });
  editorId = await createUserFixture(EDITOR, { role: "editor" });
  await runImport({ filePath: "samples/vigie-sample.xlsx", actorEmail: ADMIN, now: new Date("2026-09-28T10:00:00Z"), activityYear: 2025 });
  // An archived site never leaves the network.
  await raw.site.update({ where: { code: "SMP-015" }, data: { archivedAt: new Date() } });
  // Someone emptied SMP-003's postal code in the interface: preserved.
  const smp3 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-003" } });
  await asUser(editorId, () => db.site.update({ where: { id: smp3.id }, data: { postalCode: null } }));
}, 180_000);

afterAll(disconnectAll);

describe("enrichment:export-sites", () => {
  it("exports code, name, address and coordinates only, archived sites excluded, and audits it", async () => {
    const content = await exportSitesForEnrichment(ADMIN, "sites.json");
    expect(sitesExportSchema.safeParse(content).success).toBe(true);
    expect(Object.keys(content.sites[0]!).sort()).toEqual(["addressLine", "city", "code", "latitude", "longitude", "name", "postalCode"]);
    expect(content.sites.map((s) => s.code)).not.toContain("SMP-015");
    expect(content.sites.length).toBe((await raw.site.count({ where: { archivedAt: null } })));
    const line = await raw.auditLog.findFirst({ where: { entityType: "EnrichmentExport" } });
    expect(line).toMatchObject({ action: "ENRICH", source: "enrichment", actorId: adminId });

    // Tool, fixtures mode (no network), on this export.
    const http = new HttpClient({ fetch: fixtureFetch, clock: { now: () => 0, sleep: async () => {} } });
    const file = await enrichSites(content.sites, { http, providers: PROVIDERS, now: () => new Date("2026-09-28T12:00:00Z") });
    writeFileSync(enrichmentPath, JSON.stringify(file));
  });

  it("refuses a non-admin actor", async () => {
    await expect(exportSitesForEnrichment(EDITOR, "x.json")).rejects.toBeInstanceOf(EnrichmentPreconditionError);
  });
});

describe("enrichment:apply", () => {
  it("refuses a non-admin actor", async () => {
    await expect(runEnrichment({ filePath: enrichmentPath, actorEmail: EDITOR })).rejects.toThrow(/permission enrichment:apply/);
  });

  it("refuses an invalid file", async () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ formatVersion: 99, generatedAt: new Date().toISOString(), generator: "x", sites: [] }));
    await expect(runEnrichment({ filePath: bad, actorEmail: ADMIN })).rejects.toThrow(/Version de format non prise en charge/);
  });

  it("--dry-run writes nothing in the database but produces the report", async () => {
    const before = await counts();
    const result = await runEnrichment({ filePath: enrichmentPath, actorEmail: ADMIN, dryRun: true });
    expect(await counts()).toEqual(before);
    expect(result.batchId).toBeNull();
    expect(result.summary.mode).toBe("simulation");
    expect(result.summary.counts.applied).toBeGreaterThan(0);
    for (const f of ["divergences.csv", "changes.csv", "checks.csv", "summary.json"]) expect(existsSync(join(result.reportDir, f))).toBe(true);
  });

  let first: Awaited<ReturnType<typeof runEnrichment>>;

  it("applies: empty fields filled with source = enrichment and the batchId", async () => {
    const before = await raw.site.findUniqueOrThrow({ where: { code: "SMP-016" } });
    expect(before.latitude).toBeNull();
    first = await runEnrichment({ filePath: enrichmentPath, actorEmail: ADMIN });
    expect(first.exitCode).toBe(0);
    expect(first.batchId).toBeTruthy();

    const batch = await raw.importBatch.findUniqueOrThrow({ where: { id: first.batchId! } });
    expect(batch).toMatchObject({ kind: "ENRICHMENT", status: "SUCCEEDED", actorId: adminId, reportPath: `enrichment/${first.batchId}` });

    const smp16 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-016" }, include: { geometry: true } });
    expect(Number(smp16.latitude)).toBeCloseTo(45.797, 1);
    expect(smp16.coordinatesSource).toBe("enrichment");
    expect(smp16.communeInseeCode).toBe("63019");
    expect(smp16.geometry).toMatchObject({ source: "enrichment", sourceRef: expect.stringContaining("BDTOPO_V3:batiment/") });
    expect(Number(smp16.geometry!.heightM)).toBe(12.5);

    const lines = await raw.auditLog.findMany({ where: { siteId: smp16.id, batchId: first.batchId } });
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.every((l) => l.source === "enrichment" && l.actorId === adminId)).toBe(true);
    expect(lines.some((l) => l.entityType === "Site" && l.field === "latitude" && l.action === "UPDATE")).toBe(true);
    expect(lines.some((l) => l.action === "ENRICH")).toBe(true);
  });

  it("divergences are listed and NOT applied", async () => {
    const smp1 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" } });
    expect(Number(smp1.latitude)).toBe(45.7106); // sample value kept
    expect(smp1.coordinatesSource).not.toBe("enrichment");
    const csv = readFileSync(join(first.reportDir, "divergences.csv"), "utf8");
    expect(csv.startsWith("﻿code;champ;valeur actuelle;valeur proposée;source;preuve")).toBe(true);
    expect(csv).toMatch(/SMP-001;Site\.latitude;45\.7106;/);
    expect(first.summary.counts.divergence).toBeGreaterThan(0);
  });

  it("the preservation rule protects a field emptied in the interface", async () => {
    const smp3 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-003" } });
    expect(smp3.postalCode).toBeNull();
    expect(first.plan.lines.find((l) => l.code === "SMP-003" && l.target === "Site.postalCode")?.outcome).toBe("preserved");
    expect(first.summary.counts.preserved).toBeGreaterThanOrEqual(1);
  });

  it("site_public_data is written with the batch", async () => {
    const smp16 = await raw.site.findUniqueOrThrow({ where: { code: "SMP-016" } });
    const rows = await raw.sitePublicData.findMany({ where: { siteId: smp16.id } });
    const keys = rows.map((r) => `${r.provider}.${r.key}`).sort();
    expect(keys).toEqual(expect.arrayContaining(["georisques.radonClass", "georisques.seismicZone", "cadastre.parcels", "urbanisme.urbanZones", "companies.companyCandidates"]));
    expect(rows.every((r) => r.batchId === first.batchId)).toBe(true);
    expect(JSON.parse(rows.find((r) => r.key === "seismicZone")!.valueJson)).toEqual({ code: "3", label: "3 - Modérée" });
    // Informative checks computed on the application side.
    expect(readFileSync(join(first.reportDir, "checks.csv"), "utf8")).toContain("surface bâtie");
  });

  it("a second application makes no business write (idempotent)", async () => {
    const before = await counts();
    const second = await runEnrichment({ filePath: enrichmentPath, actorEmail: ADMIN });
    const after = await counts();
    expect(second.summary.counts.applied).toBe(0);
    expect(second.summary.sitesWritten).toBe(0);
    expect(second.summary.counts.publicDataWritten).toBe(0);
    expect(after).toEqual({ ...before, batches: before.batches + 1 });
  });
});
