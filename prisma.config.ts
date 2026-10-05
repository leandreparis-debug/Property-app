import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7). The connection string is read from
 * `.env`; the application itself validates it at start-up (src/lib/env.ts).
 * `DATABASE_URL` may be absent for `prisma generate`, which never connects.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
