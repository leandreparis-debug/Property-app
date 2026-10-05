import { afterAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { runWithAuditContext } from "@/server/audit/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { exportAuditJournal, exportSiteList } from "@/server/exports/on-demand";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

let viewer: SessionUser;

beforeEach(async () => {
  await resetDatabase();
  const id = await createUserFixture("export-viewer@vigie.local", { role: "viewer" });
  viewer = { id, email: "export-viewer@vigie.local", name: null, role: "viewer" };
  const lyon = await raw.site.create({ data: { code: "OD-001", name: "Lyon export", region: "Auvergne-Rhône-Alpes", isActive: true } });
  await raw.lease.create({ data: { siteId: lyon.id, code: "B-OD-1", marketRentValue: 424242.42, endDate: new Date("2030-01-31T00:00:00Z") } });
  await raw.site.create({ data: { code: "OD-002", name: "Lille export", region: "Hauts-de-France", isActive: true } });
  await raw.site.create({ data: { code: "OD-003", name: "Archivé", region: "Hauts-de-France", archivedAt: new Date() } });
});

afterAll(disconnectAll);

const text = (content: Uint8Array | string) => (typeof content === "string" ? content : Buffer.from(content).toString("utf8"));

describe("site list export", () => {
  it("CSV of the filtered list (archived sites are not in the list), French headers, financial data included with finance:read; traced", async () => {
    const file = await exportSiteList(viewer, new URLSearchParams("region=Hauts-de-France&format=csv"), "csv");
    const csv = text(file.content);
    expect(file.rows).toBe(1);
    expect(csv.startsWith("﻿Code entrepôt;Nom;")).toBe(true);
    expect(csv).toContain("OD-002");
    expect(csv).not.toContain("OD-001");
    expect(csv).not.toContain("OD-003");
    const all = await exportSiteList(viewer, new URLSearchParams(), "csv");
    expect(text(all.content)).toContain("424242.42");
    const trace = await raw.auditLog.findFirstOrThrow({ where: { action: "EXPORT", actorId: viewer.id }, orderBy: { id: "asc" } });
    expect(trace).toMatchObject({ source: "ui", entityType: "Export", entityId: "sites" });
    expect(JSON.parse(trace.afterValue!)).toMatchObject({ scope: "sites", format: "csv", filters: "region=Hauts-de-France", rows: 1 });
  });

  it("XLSX: Sites, yearly metrics and dictionary sheets", async () => {
    const file = await exportSiteList(viewer, new URLSearchParams(), "xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(file.content as Uint8Array) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Sites", "Indicateurs annuels", "Dictionnaire"]);
    expect(workbook.getWorksheet("Sites")!.rowCount).toBe(3);
  });

  it("without finance:read: no financial column at all", async () => {
    (PERMISSIONS.viewer as Set<string>).delete("finance:read");
    try {
      const csv = text((await exportSiteList(viewer, new URLSearchParams(), "csv")).content);
      expect(csv).not.toContain("424242");
      expect(csv).not.toContain("Valeur locative de marché");
      expect(csv).toContain("Date de fin de bail");
    } finally {
      (PERMISSIONS.viewer as Set<string>).add("finance:read");
    }
  });
});

describe("audit journal export", () => {
  it("CSV of the filtered journal, financial values masked without finance:read; traced", async () => {
    const site = await raw.site.findUniqueOrThrow({ where: { code: "OD-001" } });
    await runWithAuditContext({ actorId: viewer.id, source: "ui", batchId: "ui_export_test" }, () => db.lease.update({ where: { siteId: site.id }, data: { marketRentValue: 515151.51 } }));
    const full = await exportAuditJournal(viewer, { siteId: site.id });
    expect(full).toMatchObject({ rows: 1, truncated: false, total: 1 });
    expect(text(full.content)).toContain("515151.51");
    expect(text(full.content).split("\r\n")[0]).toBe("﻿Date;Acteur;Source;Action;Entité;Identifiant;Site;Champ;Clé du champ;Ancienne valeur;Nouvelle valeur;Motif;Lot");

    (PERMISSIONS.viewer as Set<string>).delete("finance:read");
    try {
      const masked = text((await exportAuditJournal(viewer, { siteId: site.id })).content);
      expect(masked).not.toContain("515151");
      expect(masked).toContain("Masqué (donnée financière)");
    } finally {
      (PERMISSIONS.viewer as Set<string>).add("finance:read");
    }
    expect(await raw.auditLog.count({ where: { action: "EXPORT", entityId: "audit", actorId: viewer.id } })).toBe(2);
  });
});
