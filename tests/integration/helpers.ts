import { runWithAuditContext } from "@/server/audit/context";
import { hashPassword } from "@/server/auth/password";
import { createPrismaClient } from "@/server/prisma";
import { db } from "@/server/db";
import { testDatabaseUrl } from "./test-db";

const plain = createPrismaClient(testDatabaseUrl());

/**
 * Audit lines written before this id belong to earlier tests. The journal is
 * NEVER deleted, not even in tests: `resetDatabase()` moves this mark instead,
 * and every read of `raw.auditLog` only sees the lines written after it.
 */
let auditMark = 0n;

const AUDIT_READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "groupBy", "aggregate"]);

/**
 * Plain (unaudited) client on the test database, for fixtures and cleanup
 * only — application code under test uses the audited `db` singleton. Its
 * audit READS are limited to the lines written since the last
 * `resetDatabase()` / `markAudit()`.
 */
export const raw = plain.$extends({
  query: {
    auditLog: {
      async $allOperations({ operation, args, query }) {
        if (AUDIT_READS.has(operation)) {
          const a = args as { where?: object };
          a.where = { AND: [a.where ?? {}, { id: { gt: auditMark } }] };
        }
        return query(args);
      },
    },
  },
});

/** Only the audit lines written from now on are visible to `raw.auditLog` reads. */
export async function markAudit(): Promise<void> {
  auditMark = (await plain.auditLog.aggregate({ _max: { id: true } }))._max.id ?? 0n;
}

/**
 * Empties the business tables of the test database (FK-safe order). The audit
 * journal is kept (append-only, even in tests): the audit mark moves instead.
 */
export async function resetDatabase(): Promise<void> {
  await raw.session.deleteMany();
  await raw.jobRun.deleteMany();
  await raw.equipment.deleteMany();
  await raw.sitePlan.deleteMany();
  await raw.site.deleteMany();
  await raw.importBatch.deleteMany();
  await raw.user.deleteMany();
  await markAudit();
}

/** A valid password for test accounts. */
export const TEST_PASSWORD = "Phrase de passe de test 2026";

/**
 * Creates a user directly (fixture: not audited).
 * @returns The user id.
 */
export async function createUserFixture(
  email: string,
  options: { role?: "admin" | "editor" | "viewer"; password?: string; isActive?: boolean } = {},
): Promise<string> {
  const user = await raw.user.create({
    data: {
      email,
      name: "Utilisateur Test",
      role: options.role ?? "viewer",
      passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
      isActive: options.isActive ?? true,
      passwordChangedAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  return user.id;
}

/** Runs `fn` as an interface user (audit source `ui`). */
export function asUser<T>(actorId: string, fn: () => Promise<T>): Promise<T> {
  return runWithAuditContext({ actorId, source: "ui" }, fn);
}

/** Closes both clients. */
export async function disconnectAll(): Promise<void> {
  await plain.$disconnect();
  await db.$disconnect();
}

/** JSON.stringify that accepts BigInt (audit ids). */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}
