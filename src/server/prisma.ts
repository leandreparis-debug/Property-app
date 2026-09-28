import "server-only";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../../generated/prisma/client";

export { Prisma, PrismaClient } from "../../generated/prisma/client";

/**
 * Creates a Prisma client for SQL Server through the official driver adapter
 * (`@prisma/adapter-mssql`, required by the Prisma 7 `prisma-client` generator).
 *
 * Application code uses the {@link import("./db").db} singleton; this factory
 * exists for scripts (seed) and integration tests that target another database.
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
