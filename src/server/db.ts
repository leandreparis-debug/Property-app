import "server-only";
import { getEnv } from "@/lib/env";
import { createPrismaClient, type PrismaClient } from "./prisma";

const globalForPrisma = globalThis as typeof globalThis & { __atlasPrisma?: PrismaClient };

/**
 * Application-wide Prisma client (singleton).
 *
 * In development the instance is kept on `globalThis`, so hot reloading does
 * not open a new connection pool on every change. The connection itself is
 * lazy: nothing connects until the first query.
 */
export const db: PrismaClient = globalForPrisma.__atlasPrisma ?? createPrismaClient(getEnv().DATABASE_URL);

if (process.env.NODE_ENV !== "production") globalForPrisma.__atlasPrisma = db;
