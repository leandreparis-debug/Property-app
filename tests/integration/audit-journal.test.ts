import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MASKED_VALUE } from "@/domain/audit/view";
import { runWithAuditContext } from "@/server/audit/context";
import { auditRows, countAudit, listAuditPage } from "@/server/audit/journal";
import { db } from "@/server/db";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

let adminId: string;
let siteId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = await createUserFixture("journal@vigie.local", { role: "admin" });
  const site = await raw.site.create({ data: { code: "JRN-001", name: "Entrepôt du journal" } });
  siteId = site.id;
  // 60 audited changes in one batch, plus a lease with a financial field.
  await runWithAuditContext({ actorId: adminId, source: "ui", batchId: "ui_journal_batch", comment: "Essai" }, async () => {
    for (let i = 0; i < 60; i++) await db.site.update({ where: { id: siteId }, data: { name: `Nom ${i}` } });
    await db.lease.create({ data: { siteId, code: "B-JRN", marketRentValue: 98765.43 } });
  });
  await runWithAuditContext({ actorId: null, source: "import", batchId: "imp_other" }, () => db.site.update({ where: { id: siteId }, data: { city: "Lyon" } }));
});

afterAll(disconnectAll);

describe("audit journal", () => {
  it("keyset pagination: 50 lines, then the rest, most recent first, no overlap", async () => {
    const filters = { siteId };
    const total = await countAudit(filters);
    expect(total).toBe(62);
    const first = await listAuditPage(filters, { finance: true });
    expect(first.rows).toHaveLength(50);
    expect(first.next).not.toBeNull();
    const second = await listAuditPage(filters, { finance: true, cursor: first.next });
    expect(second.rows).toHaveLength(12);
    expect(second.next).toBeNull();
    const ids = [...first.rows, ...second.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(62);
    const order = [...first.rows, ...second.rows].map((r) => [r.occurredAt.getTime(), r.id] as const);
    for (let i = 1; i < order.length; i++) {
      const [t0, id0] = order[i - 1]!;
      const [t1, id1] = order[i]!;
      expect(t0 > t1 || (t0 === t1 && id0 > id1)).toBe(true);
    }
  });

  it("combinable filters: source, actor (and « system »), field, batch, site text, period", async () => {
    expect(await countAudit({ source: "import", siteId })).toBe(1);
    expect(await countAudit({ actor: "system", siteId })).toBe(1);
    expect(await countAudit({ actor: adminId, field: "name" })).toBe(60);
    expect(await countAudit({ batch: "ui_journal_batch", entity: "Lease", siteId })).toBe(1);
    expect(await countAudit({ site: "JRN-0" })).toBe(62);
    expect(await countAudit({ site: "Nom 59" })).toBe(62); // current name (renamed by the fixture)
    expect(await countAudit({ site: "inexistant" })).toBe(0);
    expect(await countAudit({ siteId, from: "2000-01-01", to: "2000-01-02" })).toBe(0);
    const page = await listAuditPage({ field: "city", siteId }, { finance: true });
    expect(page.rows[0]).toMatchObject({ actorLabel: "Système", source: "import", siteCode: "JRN-001", fieldLabel: "Ville" });
  });

  it("financial values masked without finance:read, visible with it", async () => {
    const hidden = await listAuditPage({ entity: "Lease", siteId }, { finance: false });
    expect(hidden.rows[0]!.masked).toBe(true);
    expect(JSON.parse(hidden.rows[0]!.afterValue!).marketRentValue).toBe(MASKED_VALUE);
    expect(hidden.rows[0]!.afterValue).not.toContain("98765");
    const shown = await listAuditPage({ entity: "Lease", siteId }, { finance: true });
    expect(shown.rows[0]!.afterValue).toContain("98765.43");
  });

  it("the export generator honours the cap", async () => {
    let count = 0;
    for await (const page of auditRows({ siteId }, { finance: true, max: 55, pageSize: 20 })) count += page.length;
    expect(count).toBe(55);
  });
});
