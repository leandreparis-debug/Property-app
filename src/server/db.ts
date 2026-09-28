import "server-only";
import { getEnv } from "@/lib/env";
import { createAuditedPrismaClient, type AuditedPrismaClient } from "./prisma";

const globalForPrisma = globalThis as typeof globalThis & { __vigiePrisma?: AuditedPrismaClient };

/**
 * Application-wide Prisma client (singleton), with the audit extension: every
 * write on a business model is recorded in `audit_logs` in the same
 * transaction. Writes must run inside `runWithAuditContext` (see
 * `src/server/audit/context.ts`).
 *
 * In development the instance is kept on `globalThis`, so hot reloading does
 * not open a new connection pool on every change. The connection itself is
 * lazy: nothing connects until the first query.
 */
export const db: AuditedPrismaClient =
  globalForPrisma.__vigiePrisma ?? createAuditedPrismaClient(getEnv().DATABASE_URL);

if (process.env.NODE_ENV !== "production") globalForPrisma.__vigiePrisma = db;
