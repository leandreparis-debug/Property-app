import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWithAuditContext } from "@/server/audit/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { runImport } from "@/server/import/run";
import { archiveSite, createSite, deleteListItem, saveAnnualMetrics, saveListItem, saveSiteSection, unarchiveSite } from "@/server/sites/edit";
import { getFieldHistory } from "@/server/sites/history";
import { getSiteIndex } from "@/server/sites/index";
import { getField } from "@/domain/fields";
import { createUserFixture, disconnectAll, markAudit, raw, resetDatabase } from "./helpers";

const TODAY = new Date("2026-09-29T00:00:00.000Z");
const asImport = <T>(fn: () => Promise<T>) => runWithAuditContext({ actorId: null, source: "import", batchId: "imp" }, fn);

let editor: SessionUser;
let editor2: SessionUser;
let viewer: SessionUser;
let admin: SessionUser;
let siteId = "";

async function user(email: string, role: "viewer" | "editor" | "admin", name: string): Promise<SessionUser> {
  const id = await createUserFixture(email, { role });
  await raw.user.update({ where: { id }, data: { name } });
  return { id, email, name, role };
}

async function freshSite(code = "EDIT-1") {
  const site = await asImport(() => db.site.create({ data: { code, name: "Entrepôt à modifier", city: "Lesquin", departmentCode: "59", region: "Hauts-de-France", latitude: 50.59, longitude: 3.12, coordinatesSource: "import" } }));
  await asImport(() => db.siteTechnical.create({ data: { siteId: site.id, totalWarehouseArea: 20000, dryArea: 12000, landArea: 50000 } }));
  return site.id;
}

beforeAll(async () => {
  await resetDatabase();
  editor = await user("edit-editor@vigie.local", "editor", "Marie Dupont");
  editor2 = await user("edit-editor2@vigie.local", "editor", "Paul Martin");
  viewer = await user("edit-viewer@vigie.local", "viewer", "Lecteur");
  admin = await user("edit-admin@vigie.local", "admin", "Admin");
});

beforeEach(async () => {
  await raw.site.deleteMany();
  await markAudit();
  siteId = await freshSite();
});

afterAll(disconnectAll);

describe("saveSiteSection", () => {
  it("writes only the modified fields, one batch, source ui, author and reason; version incremented", async () => {
    const r = await saveSiteSection(editor, {
      siteId,
      section: "technical_surfaces",
      changes: { dryArea: { from: 12000, to: "12 500,5" }, landArea: { from: 50000, to: "50 000" } },
      comment: "Relevé du géomètre 2026",
    });
    expect(r).toMatchObject({ ok: true, changedCount: 1 });
    const tech = await raw.siteTechnical.findUnique({ where: { siteId } });
    expect(Number(tech?.dryArea)).toBe(12500.5);
    const lines = await raw.auditLog.findMany({ where: { siteId, source: "ui" } });
    expect(lines.map((l) => l.field)).toEqual(["dryArea"]);
    expect(lines[0]).toMatchObject({ action: "UPDATE", actorId: editor.id, comment: "Relevé du géomètre 2026", entityType: "SiteTechnical" });
    expect(lines[0]!.batchId).toMatch(/^ui_/);
    expect((await raw.site.findUnique({ where: { id: siteId } }))?.version).toBe(2);
  });

  it("one batchId for every line of a save; nothing written when nothing changes", async () => {
    const r = await saveSiteSection(editor, { siteId, section: "identity", changes: { name: { from: "Entrepôt à modifier", to: "Entrepôt Nord" }, typology: { from: null, to: "Sec" }, isActive: { from: null, to: "true" } } });
    expect(r).toMatchObject({ ok: true, changedCount: 3 });
    const batches = new Set((await raw.auditLog.findMany({ where: { siteId, source: "ui" } })).map((l) => l.batchId));
    expect(batches.size).toBe(1);
    const same = await saveSiteSection(editor, { siteId, section: "identity", changes: { name: { from: "Entrepôt Nord", to: " Entrepôt  Nord " } } });
    expect(same).toMatchObject({ ok: true, changedCount: 0 });
    expect((await raw.site.findUnique({ where: { id: siteId } }))?.version).toBe(2);
  });

  it("creates the missing 1-1 record (Lease) and returns the recomputed status", async () => {
    expect(await raw.lease.count({ where: { siteId } })).toBe(0);
    const r = await saveSiteSection(editor, { siteId, section: "lease", changes: { code: { from: null, to: "BAIL-EDIT" }, endDate: { from: null, to: "2030-06-30" } } });
    expect(r).toMatchObject({ ok: true, changedCount: 2, status: { before: expect.any(String), after: expect.any(String) } });
    const lease = await raw.lease.findUnique({ where: { siteId } });
    expect(lease?.code).toBe("BAIL-EDIT");
    expect(lease?.endDate?.toISOString().slice(0, 10)).toBe("2030-06-30");
    expect(await raw.auditLog.count({ where: { siteId, entityType: "Lease", action: "CREATE", source: "ui" } })).toBe(1);
  });

  it("coordinates changed by hand → coordinatesSource = manual; date with precision writes both columns", async () => {
    await saveSiteSection(editor, { siteId, section: "location", changes: { latitude: { from: 50.59, to: "50,6" }, longitude: { from: 3.12, to: "3,1" } } });
    const site = await raw.site.findUnique({ where: { id: siteId } });
    expect([Number(site?.latitude), Number(site?.longitude), site?.coordinatesSource]).toEqual([50.6, 3.1, "manual"]);
    await saveSiteSection(editor, { siteId, section: "identity", changes: { activityStartDate: { from: null, to: { date: "2001-03-17", precision: "month" } } } });
    const after = await raw.site.findUnique({ where: { id: siteId } });
    expect([after?.activityStartDate?.toISOString().slice(0, 10), after?.activityStartDatePrecision]).toEqual(["2001-03-01", "month"]);
  });

  it("conflict on the same field: nothing written, details returned; different fields: both saves succeed", async () => {
    const a = await saveSiteSection(editor, { siteId, section: "technical_surfaces", changes: { dryArea: { from: 12000, to: "13000" } }, comment: "Correction A" });
    expect(a.ok).toBe(true);
    const b = await saveSiteSection(editor2, { siteId, section: "technical_surfaces", changes: { dryArea: { from: 12000, to: "14000" }, landArea: { from: 50000, to: "51000" } } });
    expect(b).toMatchObject({ ok: false, reason: "conflict" });
    if (b.ok) throw new Error("unreachable");
    expect(b.conflicts).toEqual([
      expect.objectContaining({ field: "dryArea", labelFr: "Entrepôt sec", yours: "14000", theirs: 13000, by: "Marie Dupont", comment: "Correction A", at: expect.any(String) }),
    ]);
    // Nothing written (not even the field without conflict).
    const tech = await raw.siteTechnical.findUnique({ where: { siteId } });
    expect([Number(tech?.dryArea), Number(tech?.landArea)]).toEqual([13000, 50000]);
    // « Remplacer par la mienne »: from = current value.
    const replace = await saveSiteSection(editor2, { siteId, section: "technical_surfaces", changes: { dryArea: { from: 13000, to: "14000" } } });
    expect(replace.ok).toBe(true);

    // Different fields in parallel, same opening state: both succeed.
    const [x, y] = await Promise.all([
      saveSiteSection(editor, { siteId, section: "technical_surfaces", changes: { landArea: { from: 50000, to: "60000" } } }),
      saveSiteSection(editor2, { siteId, section: "technical_surfaces", changes: { packagingArea: { from: null, to: "500" } } }),
    ]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    const final = await raw.siteTechnical.findUnique({ where: { siteId } });
    expect([Number(final?.landArea), Number(final?.packagingArea)]).toEqual([60000, 500]);
  });

  it("validation, cross-field errors and warnings (confirmation required)", async () => {
    const bad = await saveSiteSection(editor, { siteId, section: "technical_surfaces", changes: { dryArea: { from: 12000, to: "douze" } } });
    expect(bad).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { dryArea: "Nombre invalide (exemple : 12 345,67)." } });
    const cross = await saveSiteSection(editor, { siteId, section: "location", changes: { longitude: { from: 3.12, to: "" } } });
    expect(cross).toMatchObject({ ok: false, reason: "cross_errors", fieldErrors: { longitude: expect.stringContaining("latitude et la longitude ensemble") } });
    const warn = await saveSiteSection(editor, { siteId, section: "location", changes: { region: { from: "Hauts-de-France", to: "Bretagne" } } });
    expect(warn).toMatchObject({ ok: false, reason: "warnings", warnings: [expect.objectContaining({ suggestion: { field: "region", value: "Hauts-de-France" } })] });
    const confirmed = await saveSiteSection(editor, { siteId, section: "location", changes: { region: { from: "Hauts-de-France", to: "Bretagne" } }, confirmWarnings: true });
    expect(confirmed.ok).toBe(true);
  });

  it("white list: a non-editable or unknown field is refused, nothing written", async () => {
    const attempts: Record<string, { from: string | number | null; to: string }>[] = [{ code: { from: "EDIT-1", to: "HACK" } }, { version: { from: 1, to: "9" } }, { name: { from: "Entrepôt à modifier", to: "X" }, archivedAt: { from: null, to: "2026-01-01" } }];
    for (const changes of attempts) {
      const r = await saveSiteSection(editor, { siteId, section: "identity", changes });
      expect(r).toMatchObject({ ok: false, reason: "refused" });
    }
    expect((await raw.site.findUnique({ where: { id: siteId } }))?.name).toBe("Entrepôt à modifier");
    expect(await raw.auditLog.count({ where: { siteId, source: "ui" } })).toBe(0);
  });

  it("a reader is refused; a financial field is refused when finance:read is withdrawn from the role", async () => {
    expect(await saveSiteSection(viewer, { siteId, section: "identity", changes: { name: { from: "Entrepôt à modifier", to: "X" } } })).toMatchObject({ ok: false, reason: "forbidden" });
    (PERMISSIONS.editor as Set<string>).delete("finance:read");
    try {
      const r = await saveSiteSection(editor, { siteId, section: "lease_financial", changes: { rentFreeAmount: { from: null, to: "1000" } } });
      expect(r).toMatchObject({ ok: false, reason: "forbidden" });
      expect(await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "RENT", year: 2025, from: null, to: "1000" }] })).toMatchObject({ ok: false, reason: "forbidden" });
      // Non-financial data remains editable.
      expect((await saveSiteSection(editor, { siteId, section: "lease", changes: { code: { from: null, to: "B-1" } } })).ok).toBe(true);
    } finally {
      (PERMISSIONS.editor as Set<string>).add("finance:read");
    }
    expect(await raw.lease.findFirst({ where: { siteId }, select: { rentFreeAmount: true } })).toEqual({ rentFreeAmount: null });
  });

  it("history: previous → new value, author, source and reason", async () => {
    await saveSiteSection(editor, { siteId, section: "technical_surfaces", changes: { dryArea: { from: 12000, to: "12 500,5" } }, comment: "Relevé 2026" });
    const history = await getFieldHistory(siteId, getField("SiteTechnical.dryArea"));
    expect(history[0]).toMatchObject({ by: "Marie Dupont", source: "ui", sourceLabel: "Saisie", comment: "Relevé 2026" });
    expect(history[0]!.before.replace(/\s/g, " ")).toBe("12 000 m²");
    expect(history[0]!.after.replace(/\s/g, " ")).toBe("12 500,5 m²");
    expect(history.at(-1)).toMatchObject({ source: "import", before: "—" });
  });
});

describe("saveAnnualMetrics", () => {
  it("add, modify, delete with source manual; conflict", async () => {
    const add = await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "ELECTRICITY", year: 2024, from: null, to: "1 250 000" }, { metric: "RENT", year: 2025, from: null, to: "500 000,5" }], comment: "Factures" });
    expect(add).toMatchObject({ ok: true, changedCount: 2 });
    const rows = await raw.annualMetric.findMany({ where: { siteId }, orderBy: { metric: "asc" } });
    expect(rows.map((r) => [r.metric, r.year, Number(r.value), r.source])).toEqual([["ELECTRICITY", 2024, 1250000, "manual"], ["RENT", 2025, 500000.5, "manual"]]);
    expect(await raw.auditLog.count({ where: { siteId, entityType: "AnnualMetric", comment: "Factures" } })).toBe(2);

    expect(await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "RENT", year: 2025, from: 500000.5, to: "510000" }] })).toMatchObject({ ok: true, changedCount: 1 });
    const conflict = await saveAnnualMetrics(editor2, { siteId, changes: [{ metric: "RENT", year: 2025, from: 500000.5, to: "520000" }] });
    expect(conflict).toMatchObject({ ok: false, reason: "conflict", conflicts: [expect.objectContaining({ field: "RENT|2025", by: "Marie Dupont", theirs: 510000 })] });

    expect(await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "ELECTRICITY", year: 2024, from: 1250000, to: "" }] })).toMatchObject({ ok: true, changedCount: 1 });
    expect(await raw.annualMetric.count({ where: { siteId, metric: "ELECTRICITY" } })).toBe(0);
    expect(await raw.auditLog.count({ where: { siteId, entityType: "AnnualMetric", action: "DELETE" } })).toBe(1);
  });

  it("validation: unknown metric, bounds", async () => {
    expect(await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "NOPE", year: 2024, from: null, to: "1" }] })).toMatchObject({ ok: false, reason: "refused" });
    expect(await saveAnnualMetrics(editor, { siteId, changes: [{ metric: "GAS", year: 2024, from: null, to: "200000000000" }] })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("lists", () => {
  it("ICPE headings, works and external ids: add, modify, delete — audited with the reason", async () => {
    const h = await saveListItem(editor, { siteId, kind: "icpeHeading", values: { code: "1510", regime: "A", label: "Entrepôts couverts" }, comment: "Arrêté 2026" });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(await saveListItem(editor, { siteId, kind: "icpeHeading", values: { code: "15100", regime: "A", label: "" } })).toMatchObject({ ok: false, fieldErrors: { code: "Code de rubrique à 4 chiffres attendu (exemple : 1510)." } });
    expect((await saveListItem(editor, { siteId, kind: "icpeHeading", id: h.id, values: { code: "1510", regime: "E", label: "Entrepôts couverts" } })).ok).toBe(true);
    expect((await raw.icpeHeading.findUnique({ where: { id: h.id } }))?.regime).toBe("E");
    expect((await deleteListItem(editor, { siteId, kind: "icpeHeading", id: h.id, comment: "Rubrique retirée" })).ok).toBe(true);
    const audit = await raw.auditLog.findMany({ where: { siteId, entityType: "IcpeHeading" }, orderBy: { id: "asc" } });
    expect(audit.map((a) => [a.action, a.comment])).toEqual([["CREATE", "Arrêté 2026"], ["UPDATE", null], ["DELETE", "Rubrique retirée"]]);

    const w = await saveListItem(editor, { siteId, kind: "buildingWork", values: { kind: "EXTENSION", date: { date: "2022-05-10", precision: "month" }, description: "Extension de 5 000 m²" } });
    expect(w.ok).toBe(true);
    expect(await raw.buildingWork.findFirst({ where: { siteId }, select: { date: true, datePrecision: true } })).toEqual({ date: new Date("2022-05-01T00:00:00Z"), datePrecision: "month" });
  });

  it("external ids are unique per system across sites, with a clear message", async () => {
    const other = await freshSite("OTHER-1");
    expect((await saveListItem(editor, { siteId: other, kind: "externalId", values: { system: "AL_CODE", value: "AL-42" } })).ok).toBe(true);
    const dup = await saveListItem(editor, { siteId, kind: "externalId", values: { system: "AL_CODE", value: "AL-42" } });
    expect(dup).toMatchObject({ ok: false, reason: "duplicate", message: "La valeur « AL-42 » (Code AL) est déjà utilisée par le site OTHER-1." });
    expect((await saveListItem(editor, { siteId, kind: "externalId", values: { system: "RAMSES", value: "AL-42" } })).ok).toBe(true);
  });
});

describe("site creation", () => {
  it("creates an audited site (manual coordinates, region of the department); a duplicate code is refused", async () => {
    const r = await createSite(editor, { code: " new-site-9 ", name: "Nouveau site", addressLine: "1 rue", postalCode: "35000", city: "Rennes", departmentCode: "35", latitude: "48,11", longitude: "-1,68" });
    expect(r).toMatchObject({ ok: true, code: "NEW-SITE-9" });
    const site = await raw.site.findUnique({ where: { code: "NEW-SITE-9" } });
    expect(site).toMatchObject({ region: "Bretagne", coordinatesSource: "manual", departmentCode: "35" });
    expect(await raw.auditLog.count({ where: { entityId: site!.id, action: "CREATE", source: "ui", actorId: editor.id } })).toBe(1);
    expect(await createSite(editor, { code: "NEW-SITE-9", name: "Doublon" })).toMatchObject({ ok: false, reason: "duplicate", fieldErrors: { code: "Le code NEW-SITE-9 est déjà utilisé." } });
    expect(await createSite(editor, { code: "bad code!", name: "X" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await createSite(viewer, { code: "V-1", name: "X" })).toMatchObject({ ok: false, reason: "forbidden" });
  });
});

describe("archiving", () => {
  it("admin only, reason mandatory; the site leaves the index and comes back when restored", async () => {
    expect(await archiveSite(editor, { siteId, reason: "Fermeture" })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await archiveSite(admin, { siteId, reason: "  " })).toMatchObject({ ok: false, reason: "invalid", message: "Motif obligatoire pour archiver un site." });
    expect(await archiveSite(admin, { siteId, reason: "Fermeture du site" })).toEqual({ ok: true });
    expect((await getSiteIndex(TODAY)).some((e) => e.id === siteId)).toBe(false);
    expect(await raw.auditLog.findFirst({ where: { entityId: siteId, field: "archivedAt" }, select: { comment: true, actorId: true } })).toEqual({ comment: "Fermeture du site", actorId: admin.id });
    // An archived site cannot be edited.
    expect(await saveSiteSection(editor, { siteId, section: "identity", changes: { name: { from: "Entrepôt à modifier", to: "X" } } })).toMatchObject({ ok: false, reason: "archived" });
    expect(await unarchiveSite(admin, { siteId })).toEqual({ ok: true });
    expect((await getSiteIndex(TODAY)).some((e) => e.id === siteId)).toBe(true);
  });
});

describe("regression: the import preserves the fields edited in the interface", () => {
  it("after a ui change, a new spreadsheet import keeps the value", async () => {
    await raw.site.deleteMany();
    await createUserFixture("edit-import@vigie.local", { role: "admin" });
    await runImport({ filePath: "samples/vigie-sample.xlsx", actorEmail: "edit-import@vigie.local", now: new Date("2026-09-28T10:00:00Z"), activityYear: 2025 });
    const site = await raw.site.findUniqueOrThrow({ where: { code: "SMP-001" }, include: { technical: true } });
    const from = site.technical?.landArea === null || site.technical?.landArea === undefined ? null : Number(site.technical.landArea);
    const r = await saveSiteSection(editor, { siteId: site.id, section: "technical_surfaces", changes: { landArea: { from, to: "123 456" } } });
    expect(r.ok).toBe(true);
    const again = await runImport({ filePath: "samples/vigie-sample.xlsx", actorEmail: "edit-import@vigie.local", now: new Date("2026-09-29T10:00:00Z"), activityYear: 2025 });
    expect(again.summary.preservedFields).toBeGreaterThanOrEqual(1);
    expect(Number((await raw.siteTechnical.findUnique({ where: { siteId: site.id } }))?.landArea)).toBe(123456);
  });
});
