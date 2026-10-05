import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { deleteDocument } from "@/server/documents/store";
import { runWithAuditContext } from "@/server/audit/context";
import { purgeSessionsJob, purgeTrashJob, executeTrashPurge } from "@/server/ops/purges";
import { runJob } from "@/server/ops/run";
import { resolveStoragePath } from "@/server/storage";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const user = (id: string) => ({ id, email: "purge@vigie.local", name: null, role: "admin" as const });

beforeEach(async () => {
  await resetDatabase();
  await rm(resolveStoragePath("trash"), { recursive: true, force: true });
});

afterAll(async () => {
  await disconnectAll();
});

describe("purge-sessions", () => {
  it("deletes only the sessions expired for more than 7 days", async () => {
    const userId = await createUserFixture("sessions@vigie.local");
    const now = new Date("2026-10-05T10:00:00Z");
    const session = (id: string, expiresAt: Date, idleExpiresAt = expiresAt) =>
      raw.session.create({ data: { id, userId, createdAt: new Date(expiresAt.getTime() - DAY), expiresAt, idleExpiresAt, lastSeenAt: new Date(expiresAt.getTime() - DAY) } });
    await session("a".repeat(64), new Date(now.getTime() - 8 * DAY)); // expired 8 days ago
    await session("b".repeat(64), new Date(now.getTime() + DAY), new Date(now.getTime() - 9 * DAY)); // idle-expired 9 days ago
    await session("c".repeat(64), new Date(now.getTime() - 2 * DAY)); // expired 2 days ago: kept
    await session("d".repeat(64), new Date(now.getTime() + DAY)); // valid: kept
    const outcome = await runJob("purge-sessions", "cli", { jobs: [purgeSessionsJob], now });
    expect(outcome.status).toBe("success");
    expect(outcome.status === "success" && outcome.summary).toMatchObject({ sessionsDeleted: 2, graceDays: 7 });
    expect((await raw.session.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((s) => s.id[0])).toEqual(["c", "d"]);
  });
});

describe("purge-trash", () => {
  async function trashedDocument(code: string) {
    const actorId = await createUserFixture(`trash-${code.toLowerCase()}@vigie.local`, { role: "admin" });
    const site = await raw.site.create({ data: { code, name: `Site ${code}` } });
    const id = `doc${code.toLowerCase().replace(/[^a-z0-9]/g, "")}0001`;
    const relative = `documents/${site.id}/${id}.pdf`;
    const path = resolveStoragePath(...relative.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "%PDF-1.4 test");
    await runWithAuditContext({ actorId, source: "ui" }, () => db.document.create({ data: { id, siteId: site.id, category: "OTHER", storagePath: relative, title: "Doc" } }));
    const trashPath = await deleteDocument(user(actorId), id, "Doublon");
    return { siteId: site.id, documentId: id, trashPath: trashPath! };
  }

  it("erases the files older than 30 days, writes one audit line each (source system), keeps recent ones; sites, audit and import reports untouched", async () => {
    const doc = await trashedDocument("TR-001");
    const recentName = `${new Date().toISOString().replace(/[:.]/g, "-")}-docrecent.pdf`;
    await writeFile(resolveStoragePath("trash", "documents", recentName), "x");
    await mkdir(resolveStoragePath("imports", "batch-x"), { recursive: true });
    await writeFile(resolveStoragePath("imports", "batch-x", "report.csv"), "x");
    const auditBefore = await raw.auditLog.count();

    const outcome = await runJob("purge-trash", "cli", { jobs: [purgeTrashJob], now: new Date(Date.now() + 31 * DAY) });
    expect(outcome.status).toBe("success");
    expect(outcome.status === "success" && outcome.summary).toMatchObject({ inTrash: 2, erased: 2, missing: [] });

    // The test's « recent » file is also older than 30 days at now + 31 days: rerun at the real date keeps a new one.
    const kept = `${new Date().toISOString().replace(/[:.]/g, "-")}-dockept.pdf`;
    await writeFile(resolveStoragePath("trash", "documents", kept), "x");
    const second = await runJob("purge-trash", "manual", { jobs: [purgeTrashJob] });
    expect(second.status === "success" && second.summary).toMatchObject({ erased: 0 });
    expect(await readdir(resolveStoragePath("trash", "documents"))).toEqual([kept]);

    const lines = await raw.auditLog.findMany({ where: { entityType: "TrashFile" }, orderBy: { id: "asc" } });
    expect(lines).toHaveLength(2);
    const line = lines.find((l) => l.entityId === doc.documentId)!;
    expect(line).toMatchObject({ action: "DELETE", source: "system", siteId: doc.siteId, batchId: outcome.runId });
    expect(JSON.parse(line.beforeValue!)).toMatchObject({ path: doc.trashPath });
    expect(await raw.auditLog.count()).toBe(auditBefore + 2);
    expect(await raw.site.count({ where: { code: "TR-001" } })).toBe(1);
    expect(await readdir(resolveStoragePath("imports", "batch-x"))).toEqual(["report.csv"]);
  });

  it("a file already missing from the disk is reported, audited, and the purge goes on", async () => {
    const doc = await trashedDocument("TR-002");
    const result = await runWithAuditContext({ actorId: null, source: "system", batchId: "purge-test" }, () =>
      executeTrashPurge(
        [
          { path: "trash/documents/2020-01-01T00-00-00-000Z-docgone.pdf", name: "2020-01-01T00-00-00-000Z-docgone.pdf", sizeBytes: 5, modifiedAt: new Date(0), trashedAt: new Date("2020-01-01T00:00:00Z"), documentId: "docgone" },
          { path: doc.trashPath, name: doc.trashPath.split("/").pop()!, sizeBytes: 13, modifiedAt: new Date(0), trashedAt: new Date("2020-01-01T00:00:00Z"), documentId: doc.documentId },
        ],
        30,
      ),
    );
    expect(result).toEqual({ erased: 1, missing: ["trash/documents/2020-01-01T00-00-00-000Z-docgone.pdf"], bytes: 13 });
    const gone = await raw.auditLog.findFirstOrThrow({ where: { entityType: "TrashFile", entityId: "docgone" } });
    expect(JSON.parse(gone.afterValue!)).toEqual({ erased: false, missing: true });
    expect(gone.comment).toMatch(/déjà absent/);
    expect(await readdir(join(resolveStoragePath("trash"), "documents"))).toEqual([]);
  });
});
