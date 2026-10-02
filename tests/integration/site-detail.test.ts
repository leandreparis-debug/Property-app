import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runWithAuditContext } from "@/server/audit/context";
import { createSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { getFieldProvenance, getSiteDetail, provenanceHint, provenanceOf } from "@/server/sites/detail";
import { storageRoot } from "@/server/storage";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

let sessionToken: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (sessionToken && name.includes("session") ? { name, value: sessionToken } : undefined) }),
  headers: async () => new Headers(),
}));

const { GET } = await import("@/app/api/documents/[id]/route");

const TODAY = new Date("2026-09-29T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asImport = <T>(fn: () => Promise<T>) => runWithAuditContext({ actorId: null, source: "import", batchId: "batch-import" }, fn);
const asEnrichment = <T>(fn: () => Promise<T>) => runWithAuditContext({ actorId: null, source: "enrichment", batchId: "batch-enrich" }, fn);

let fullId = "";
let minimalId = "";
let editorId = "";
const docs: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  editorId = await createUserFixture("detail-editor@vigie.local", { role: "editor" });
  await raw.user.update({ where: { id: editorId }, data: { name: "Marie Dupont" } });

  const full = await asImport(() => db.site.create({ data: { code: "FULL-1", name: "Entrepôt complet", city: "Lesquin", addressLine: "1 rue", latitude: 50.59, longitude: 3.12, isActive: true } }));
  const siteId = full.id;
  await asImport(async () => {
    await db.lease.create({ data: { siteId, code: "BAIL-1", endDate: d("2027-01-28"), nextExitDate: d("2027-01-28"), noticeDate: d("2026-07-28"), renewalConditionsSigned: false, marketRentValue: 12 } });
    await db.siteTechnical.create({ data: { siteId, totalWarehouseArea: 10000, dryArea: 8000, socialOfficeArea: 500 } });
    await db.siteIcpe.create({ data: { siteId, holder: "Exploitant", georisquesUrl: "https://www.georisques.gouv.fr/x" } });
    await db.icpeHeading.create({ data: { siteId, code: "1510", regime: "A", label: "Entrepôts couverts" } });
    await db.siteEnergyProfile.create({ data: { siteId, referenceYear: 2022 } });
    await db.serviceContract.create({ data: { siteId, durationRaw: "3 ans" } });
    await db.siteExternalId.create({ data: { siteId, system: "AL_CODE", value: "AL-1" } });
    await db.buildingWork.create({ data: { siteId, kind: "CONSTRUCTION", date: d("2020-03-01"), datePrecision: "month" } });
    for (const [year, metric, value] of [[2024, "RENT", 500000], [2025, "RENT", 510000], [2025, "CHARGES", 50000], [2024, "ELECTRICITY", 1_000_000]] as const) {
      await db.annualMetric.create({ data: { siteId, year, metric, value } });
    }
    await db.siteGeometry.create({
      data: {
        siteId,
        footprintGeoJson: JSON.stringify({ type: "Polygon", coordinates: [[[3.119, 50.589], [3.121, 50.589], [3.121, 50.591], [3.119, 50.591], [3.119, 50.589]]] }),
        heightM: 11,
        source: "enrichment",
      },
    });
    await db.sitePublicData.create({ data: { siteId, provider: "georisques", key: "radonClass", valueJson: '"1"', fetchedAt: d("2026-09-28") } });
  });
  fullId = full.id;
  const minimal = await asImport(() => db.site.create({ data: { code: "MIN-1", name: "MIN-1" } }));
  minimalId = minimal.id;

  // Documents: a real file, a missing file, and a path escaping STORAGE_ROOT.
  mkdirSync(join(storageRoot(), "documents", "FULL-1"), { recursive: true });
  writeFileSync(join(storageRoot(), "documents", "FULL-1", "bail.pdf"), "%PDF-1.4 contenu de test");
  const create = (category: string, title: string, storagePath: string) =>
    asImport(() => db.document.create({ data: { siteId: fullId, category, title, storagePath, mimeType: "application/pdf", sizeBytes: BigInt(24) } }));
  docs.ok = (await create("LEASE", "Bail signé", "documents/FULL-1/bail.pdf")).id;
  docs.missing = (await create("PLAN", "Plan absent", "documents/FULL-1/absent.pdf")).id;
  docs.escape = (await create("OTHER", "Hors stockage", "../../etc/passwd")).id;
});

afterAll(async () => {
  rmSync(join(storageRoot(), "documents"), { recursive: true, force: true });
  await disconnectAll();
});

describe("getSiteDetail", () => {
  it("a complete site: relations, metrics grouped per metric, evaluation, footprint, public data, documents", async () => {
    const detail = (await getSiteDetail(fullId, TODAY))!;
    expect(detail.site.code).toBe("FULL-1");
    expect(detail.lease?.code).toBe("BAIL-1");
    expect(typeof detail.lease?.marketRentValue).toBe("number"); // Decimal → number
    expect(detail.externalIds).toEqual([{ id: expect.any(String), system: "AL_CODE", value: "AL-1" }]);
    expect(detail.icpeHeadings.map((h) => h.code)).toEqual(["1510"]);
    expect(detail.metrics.RENT?.map((p) => [p.year, p.value, p.perSqm])).toEqual([[2024, 500000, 50], [2025, 510000, 51]]);
    expect(detail.metrics.RENT?.[1]?.yearOverYear).toBeCloseTo(2);
    expect(detail.metrics.GAS).toBeUndefined();
    expect(detail.metricYears).toEqual([2024, 2025]);
    expect(detail.occupancyCost.map((o) => [o.year, o.total, o.partial])).toEqual([[2024, 500000, true], [2025, 560000, true]]);
    expect(detail.referenceArea).toBe(10000);
    expect(detail.evaluation.status).toBe("critical"); // arbitration passed, conditions not signed
    expect(detail.footprint?.heightM).toBe(11);
    expect(detail.footprint?.areaM2).toBeGreaterThan(30_000);
    expect(detail.publicData[0]).toMatchObject({ provider: "georisques", providerLabelFr: "Géorisques" });
    expect(detail.documents).toHaveLength(3);
    expect(detail.documents.find((doc) => doc.id === docs.ok)).toMatchObject({ category: "LEASE", sizeBytes: 24 });
    expect(detail.buildingWorks[0]).toMatchObject({ kind: "CONSTRUCTION", datePrecision: "month" });
  });

  it("a minimal site: every relation empty, still evaluated", async () => {
    const detail = (await getSiteDetail(minimalId, TODAY))!;
    expect(detail).toMatchObject({ lease: null, technical: null, icpe: null, footprint: null, documents: [], publicData: [], metrics: {}, occupancyCost: [], referenceArea: null });
    expect(detail.evaluation.completeness).toBeLessThan(20);
  });

  it("unknown or malformed ids → null (no query for a malformed one)", async () => {
    expect(await getSiteDetail("cl_unknown_site_000000000", TODAY)).toBeNull();
    for (const bad of ["", "../x", "a b", "x".repeat(31), "'; DROP TABLE sites; --"]) expect(await getSiteDetail(bad, TODAY)).toBeNull();
  });

  it("an archived site is still returned (banner on the page)", async () => {
    const archived = await asImport(() => db.site.create({ data: { code: "ARCH-1", name: "Archivé", archivedAt: new Date() } }));
    expect((await getSiteDetail(archived.id, TODAY))?.site.archivedAt).toBeInstanceOf(Date);
  });
});

describe("getFieldProvenance", () => {
  it("returns the LAST write of each field: import, then manual entry, then enrichment", async () => {
    const lease = (await raw.lease.findUnique({ where: { siteId: fullId } }))!;
    let index = await getFieldProvenance(fullId);
    expect(provenanceOf(index, "Lease", lease.id, "holdingEntity")).toMatchObject({ source: "import", batchId: "batch-import" });
    expect(provenanceHint(index, "Site", fullId, "city")?.label).toMatch(/^Import du tableur — /);

    await runWithAuditContext({ actorId: editorId, source: "ui" }, () => db.lease.update({ where: { id: lease.id }, data: { holdingEntity: "SCI Démo" } }));
    index = await getFieldProvenance(fullId);
    expect(provenanceOf(index, "Lease", lease.id, "holdingEntity")).toMatchObject({ source: "ui", actorName: "Marie Dupont", batchId: null });
    expect(provenanceHint(index, "Lease", lease.id, "holdingEntity")?.label).toMatch(/^Saisie par Marie Dupont — /);
    expect(provenanceOf(index, "Lease", lease.id, "code")?.source).toBe("import"); // other fields untouched

    await asEnrichment(() => db.lease.update({ where: { id: lease.id }, data: { holdingEntity: "SCI Enrichie" } }));
    await asEnrichment(() => db.site.update({ where: { id: fullId }, data: { communeInseeCode: "59343" } }));
    index = await getFieldProvenance(fullId);
    expect(provenanceHint(index, "Lease", lease.id, "holdingEntity")).toEqual({ label: expect.stringMatching(/^Enrichissement \(source publique\) — /), enrichment: true });
    expect(provenanceHint(index, "Site", fullId, "communeInseeCode")?.enrichment).toBe(true);
    expect(provenanceOf(index, "Site", fullId, "name")?.source).toBe("import");
  });

  it("a record without audit line, or a missing record, has no provenance", async () => {
    const index = await getFieldProvenance(fullId);
    expect(provenanceOf(index, "SiteTechnical", "nope", "dryArea")).toBeNull();
    expect(provenanceOf(index, "SiteTechnical", null, "dryArea")).toBeNull();
    expect((await getFieldProvenance("unknown")).lines.size).toBe(0);
  });
});

describe("GET /api/documents/[id]", () => {
  const call = (id: string) => GET(new NextRequest(`http://localhost:3000/api/documents/${id}`), { params: Promise.resolve({ id }) });

  it("401 without a session", async () => {
    sessionToken = null;
    expect((await call(docs.ok!)).status).toBe(401);
  });

  it("200: streamed content, type from the database, attachment with an RFC 5987 name, nosniff, no-store", async () => {
    const viewer = await createUserFixture("detail-viewer@vigie.local", { role: "viewer" });
    sessionToken = (await createSession(viewer)).token;
    const response = await call(docs.ok!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="Bail signe.pdf"; filename*=UTF-8''Bail%20sign%C3%A9.pdf`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-length")).toBe("24");
    expect(await response.text()).toBe("%PDF-1.4 contenu de test");
  });

  it("404 (logged) when the file is missing on disk; unknown and malformed ids are 404", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await call(docs.missing!)).status).toBe(404);
    expect(warn.mock.calls.flat().join(" ")).toContain("fichier absent");
    expect((await call("cl_unknown_doc_00000000000")).status).toBe(404);
    expect((await call("..%2F..%2Fetc")).status).toBe(404);
    warn.mockRestore();
  });

  it("a stored path outside STORAGE_ROOT is refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await call(docs.escape!);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("root:");
    expect(warn.mock.calls.flat().join(" ")).toContain("chemin refusé");
    warn.mockRestore();
  });
});
