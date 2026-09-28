import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWithAuditContext } from "@/server/audit/context";
import { AuditError, MissingAuditContextError } from "@/server/audit/extension";
import { authenticate, logLogout } from "@/server/auth/login";
import { createLoginIpLimiter } from "@/server/auth/rate-limit";
import { resetPassword } from "@/server/auth/users";
import { db } from "@/server/db";
import { toDateOnly } from "@/domain/dates";
import { asUser, createUserFixture, disconnectAll, raw, resetDatabase, TEST_PASSWORD, toJson } from "./helpers";

const ACTOR = "actor-test-000000000000001";
const lines = () => raw.auditLog.findMany({ orderBy: { id: "asc" } });

beforeEach(resetDatabase);
afterAll(disconnectAll);

describe("create / update / delete", () => {
  it("audits Site and Lease writes with actor, source, siteId, before and after", async () => {
    const site = await asUser(ACTOR, () => db.site.create({ data: { code: "AUD-001", name: "Entrepôt audité", city: "Lyon" } }));
    const lease = await asUser(ACTOR, () =>
      db.lease.create({ data: { siteId: site.id, code: "BAIL-AUD", noticeDate: toDateOnly("2027-03-31"), marketRentValue: "52.50" } }),
    );

    let log = await lines();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ action: "CREATE", source: "ui", actorId: ACTOR, entityType: "Site", entityId: site.id, siteId: site.id, field: null, beforeValue: null });
    expect(JSON.parse(log[0]!.afterValue!)).toMatchObject({ code: "AUD-001", name: "Entrepôt audité", city: "Lyon", version: 1 });
    expect(log[1]).toMatchObject({ action: "CREATE", entityType: "Lease", entityId: lease.id, siteId: site.id });
    expect(JSON.parse(log[1]!.afterValue!)).toMatchObject({ noticeDate: "2027-03-31T00:00:00.000Z", marketRentValue: "52.5" });

    await raw.auditLog.deleteMany();
    await asUser(ACTOR, () => db.site.update({ where: { id: site.id }, data: { name: "Entrepôt renommé", city: "Villeurbanne", version: { increment: 1 } } }));
    log = await lines();
    expect(log.map((l) => [l.action, l.field, l.beforeValue, l.afterValue, l.siteId])).toEqual([
      ["UPDATE", "city", '"Lyon"', '"Villeurbanne"', site.id],
      ["UPDATE", "name", '"Entrepôt audité"', '"Entrepôt renommé"', site.id],
    ]); // version / updatedAt ignored

    await raw.auditLog.deleteMany();
    await asUser(ACTOR, () => db.lease.update({ where: { siteId: site.id }, data: { marketRentValue: "55" } }));
    log = await lines();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "UPDATE", entityType: "Lease", field: "marketRentValue", beforeValue: '"52.5"', afterValue: '"55"', siteId: site.id });

    await raw.auditLog.deleteMany();
    await asUser(ACTOR, () => db.lease.delete({ where: { id: lease.id } }));
    await asUser(ACTOR, () => db.site.delete({ where: { id: site.id } }));
    log = await lines();
    expect(log.map((l) => [l.action, l.entityType, l.siteId])).toEqual([
      ["DELETE", "Lease", site.id],
      ["DELETE", "Site", site.id],
    ]);
    expect(JSON.parse(log[0]!.beforeValue!)).toMatchObject({ code: "BAIL-AUD", marketRentValue: "55" });
    expect(log.every((l) => l.afterValue === null)).toBe(true);
  });

  it("writes nothing for an update that changes nothing", async () => {
    const site = await asUser(ACTOR, () => db.site.create({ data: { code: "AUD-002", name: "Sans changement", latitude: "45.1" } }));
    await raw.auditLog.deleteMany();
    await asUser(ACTOR, () => db.site.update({ where: { id: site.id }, data: { name: "Sans changement", latitude: "45.100000" } }));
    expect(await raw.auditLog.count()).toBe(0);
  });

  it("treats upsert as create, then as update", async () => {
    const upsert = (name: string) =>
      asUser(ACTOR, () => db.site.upsert({ where: { code: "AUD-003" }, create: { code: "AUD-003", name }, update: { name } }));
    await upsert("Premier");
    await upsert("Premier");
    await upsert("Second");
    expect((await lines()).map((l) => [l.action, l.field])).toEqual([
      ["CREATE", null],
      ["UPDATE", "name"],
    ]);
  });

  it("respects select/include shapes of the caller", async () => {
    const site = await asUser(ACTOR, () => db.site.create({ data: { code: "AUD-004", name: "Forme" }, select: { id: true } }));
    expect(Object.keys(site)).toEqual(["id"]);
    const updated = await asUser(ACTOR, () =>
      db.site.update({ where: { id: site.id }, data: { city: "Nantes" }, include: { lease: true } }),
    );
    expect(updated).toMatchObject({ city: "Nantes", lease: null });
  });

  it("propagates the source and the batch id", async () => {
    await runWithAuditContext({ actorId: null, source: "import", batchId: "batch-0000000000000000001" }, () =>
      db.site.create({ data: { code: "AUD-005", name: "Importé" } }),
    );
    expect((await lines())[0]).toMatchObject({ source: "import", batchId: "batch-0000000000000000001", actorId: null });
  });

  it("keeps Prisma's not-found error on update/delete", async () => {
    await expect(asUser(ACTOR, () => db.site.update({ where: { id: "missing" }, data: { name: "x" } }))).rejects.toThrow();
    await expect(asUser(ACTOR, () => db.site.delete({ where: { id: "missing" } }))).rejects.toThrow();
    expect(await raw.auditLog.count()).toBe(0);
  });
});

describe("secrets", () => {
  it("redacts passwordHash in CREATE and UPDATE lines, and never stores a hash", async () => {
    await runWithAuditContext({ actorId: null, source: "system" }, async () => {
      await db.user.create({ data: { email: "secret@vigie.local", role: "viewer", passwordHash: "$argon2id$fake-hash-1" } });
    });
    await runWithAuditContext({ actorId: null, source: "system" }, () =>
      resetPassword("secret@vigie.local", "Encore une phrase secrète 99"),
    );
    const log = await lines();
    expect(JSON.parse(log[0]!.afterValue!).passwordHash).toBe("[redacted]");
    const hashLine = log.find((l) => l.field === "passwordHash");
    expect(hashLine).toMatchObject({ action: "UPDATE", beforeValue: '"[redacted]"', afterValue: '"[redacted]"' });
    expect(toJson(log)).not.toMatch(/argon2/);
    // Login bookkeeping fields are covered by LOGIN events, not UPDATE lines.
    expect(log.map((l) => l.field)).not.toContain("failedLoginCount");
  });
});

describe("refused operations", () => {
  it("refuses nested writes on audited models", async () => {
    await expect(
      asUser(ACTOR, () => db.site.create({ data: { code: "AUD-010", name: "Imbriqué", lease: { create: {} } } })),
    ).rejects.toThrow(/Écriture imbriquée refusée sur Site\.lease/);
    const site = await asUser(ACTOR, () => db.site.create({ data: { code: "AUD-011", name: "Parent" } }));
    await expect(
      asUser(ACTOR, () => db.lease.create({ data: { site: { connect: { id: site.id } } } })),
    ).rejects.toThrow(AuditError);
    await expect(
      asUser(ACTOR, () => db.site.update({ where: { id: site.id }, data: { annualMetrics: { deleteMany: {} } } })),
    ).rejects.toThrow(AuditError);
    expect(await raw.lease.count()).toBe(0);
  });

  it("refuses bulk operations on audited models", async () => {
    await expect(asUser(ACTOR, () => db.site.updateMany({ data: { city: "x" } }))).rejects.toThrow(/Site\.updateMany refusé/);
    await expect(asUser(ACTOR, () => db.site.deleteMany())).rejects.toThrow(/Site\.deleteMany refusé/);
    await expect(
      asUser(ACTOR, () => db.icpeHeading.createMany({ data: [{ siteId: "x", code: "1510" }] })),
    ).rejects.toThrow(/IcpeHeading\.createMany refusé/);
  });

  it("makes the audit log append-only", async () => {
    await db.auditLog.create({ data: { action: "LOGIN", source: "ui", entityType: "User", entityId: "u" } });
    const [line] = await lines();
    await expect(db.auditLog.update({ where: { id: line!.id }, data: { action: "LOGOUT" } })).rejects.toThrow(/ajout seul/);
    await expect(db.auditLog.delete({ where: { id: line!.id } })).rejects.toThrow(/ajout seul/);
    await expect(db.auditLog.deleteMany()).rejects.toThrow(/ajout seul/);
    await expect(db.auditLog.updateMany({ data: { field: "x" } })).rejects.toThrow(/ajout seul/);
    expect(await raw.auditLog.count()).toBe(1);
  });

  it("refuses an audited write without context in the test environment", async () => {
    await expect(db.site.create({ data: { code: "AUD-020", name: "Orphelin" } })).rejects.toThrow(MissingAuditContextError);
    expect(await raw.site.count()).toBe(0);
  });

  it("refuses the array form of $transaction", () => {
    expect(() => db.$transaction([] as never)).toThrow(/Forme tableau/);
  });
});

describe("transactions", () => {
  it("rolls back the audit lines together with the change", async () => {
    await expect(
      asUser(ACTOR, () =>
        db.$transaction(async (tx) => {
          await tx.site.create({ data: { code: "AUD-030", name: "Annulé" } });
          throw new Error("échec métier");
        }),
      ),
    ).rejects.toThrow("échec métier");
    expect(await raw.site.count()).toBe(0);
    expect(await raw.auditLog.count()).toBe(0);
  });

  it("commits several writes and their audit lines atomically", async () => {
    await asUser(ACTOR, () =>
      db.$transaction(async (tx) => {
        const site = await tx.site.create({ data: { code: "AUD-031", name: "Transaction" } });
        await tx.lease.create({ data: { siteId: site.id, code: "BAIL-031" } });
        // Reads inside see uncommitted writes (same transaction).
        expect(await tx.lease.count({ where: { siteId: site.id } })).toBe(1);
      }),
    );
    expect((await lines()).map((l) => l.entityType)).toEqual(["Site", "Lease"]);
  });

  it("rolls back when a later write fails (constraint violation)", async () => {
    await asUser(ACTOR, () => db.site.create({ data: { code: "AUD-032", name: "Existant" } }));
    await raw.auditLog.deleteMany();
    await expect(
      asUser(ACTOR, () =>
        db.$transaction(async (tx) => {
          await tx.site.create({ data: { code: "AUD-033", name: "Nouveau" } });
          await tx.site.create({ data: { code: "AUD-032", name: "Doublon" } });
        }),
      ),
    ).rejects.toThrow();
    expect(await raw.site.count()).toBe(1);
    expect(await raw.auditLog.count()).toBe(0);
  });
});

describe("authentication events", () => {
  it("writes LOGIN, LOGIN_FAILED and LOGOUT", async () => {
    const userId = await createUserFixture("events@vigie.local");
    const limiter = createLoginIpLimiter();
    await authenticate("events@vigie.local", "mauvais", "10.0.0.7", { limiter });
    await authenticate("inconnu@vigie.local", "peu importe", "10.0.0.7", { limiter });
    const ok = await authenticate("events@vigie.local", TEST_PASSWORD, "10.0.0.7", { limiter });
    expect(ok.ok).toBe(true);
    await logLogout(userId, "10.0.0.7");

    const log = await lines();
    expect(log.map((l) => [l.action, l.entityType, l.entityId, l.actorId])).toEqual([
      ["LOGIN_FAILED", "User", userId, null],
      ["LOGIN_FAILED", "User", "unknown", null],
      ["LOGIN", "User", userId, userId],
      ["LOGOUT", "User", userId, userId],
    ]);
    expect(JSON.parse(log[0]!.afterValue!)).toEqual({ ip: "10.0.0.7", reason: "bad_password" });
    expect(JSON.parse(log[1]!.afterValue!)).toEqual({ ip: "10.0.0.7", reason: "unknown_email" });
    expect(log.every((l) => l.source === "ui")).toBe(true);
    // No password, token or hash in any audit line.
    expect(toJson(log)).not.toMatch(/mauvais|peu importe|argon2|Phrase de passe/);
    if (ok.ok) expect(toJson(log)).not.toContain(ok.token);
  });
});
