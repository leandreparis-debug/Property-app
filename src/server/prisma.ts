import "server-only";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../../generated/prisma/client";
import { withAudit } from "./audit/extension";

export { Prisma, PrismaClient } from "../../generated/prisma/client";
export type { AuditedPrismaClient } from "./audit/extension";

/**
 * Creates a plain Prisma client for SQL Server through the official driver
 * adapter (`@prisma/adapter-mssql`, required by the Prisma 7 `prisma-client`
 * generator).
 *
 * ⚠ NOT audited. Reserved for maintenance code and test fixtures that must
 * bypass the audit (e.g. cleaning the test database). Application code, the
 * seed and the CLI scripts use {@link createAuditedPrismaClient} or the `db`
 * singleton.
 *
 * @param databaseUrl - `sqlserver://…` connection string.
 * @returns A new, lazily connected client. Call `$disconnect()` when done.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaMssql(databaseUrl);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Creates a Prisma client with the audit extension (see `audit/extension.ts`).
 * @param databaseUrl - `sqlserver://…` connection string.
 * @returns A new, lazily connected audited client.
 */
export function createAuditedPrismaClient(databaseUrl: string) {
  return withAudit(createPrismaClient(databaseUrl));
}
