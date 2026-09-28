import { runWithAuditContext } from "@/server/audit/context";
import { hashPassword } from "@/server/auth/password";
import { createPrismaClient } from "@/server/prisma";
import { db } from "@/server/db";
import { testDatabaseUrl } from "./test-db";

/**
 * Plain (unaudited) client on the test database, for fixtures and cleanup
 * only — application code under test uses the audited `db` singleton.
 */
export const raw = createPrismaClient(testDatabaseUrl());

/** Empties every table of the test database (FK-safe order). */
export async function resetDatabase(): Promise<void> {
  await raw.session.deleteMany();
  await raw.equipment.deleteMany();
  await raw.sitePlan.deleteMany();
  await raw.site.deleteMany();
  await raw.auditLog.deleteMany();
  await raw.importBatch.deleteMany();
  await raw.user.deleteMany();
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
  await raw.$disconnect();
  await db.$disconnect();
}

/** JSON.stringify that accepts BigInt (audit ids). */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}
