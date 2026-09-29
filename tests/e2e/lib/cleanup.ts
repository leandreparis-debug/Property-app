/**
 * Removes the data written by the end-to-end suite on the tested database:
 * the sites whose code starts with « E2E- » (cascade to their records and
 * documents), their audit lines and their stored files. Unaudited client:
 * test data only, never the demo sites.
 *
 *   tsx --conditions=react-server tests/e2e/lib/cleanup.ts
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "../../../src/server/prisma";
import { storageRoot } from "../../../src/server/storage";

const client = createPrismaClient(process.env.DATABASE_URL!);
try {
  const sites = await client.site.findMany({ where: { code: { startsWith: "E2E-" } }, select: { id: true } });
  const ids = sites.map((s) => s.id);
  if (ids.length) {
    await client.auditLog.deleteMany({ where: { siteId: { in: ids } } });
    await client.site.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) await rm(join(storageRoot(), "documents", id), { recursive: true, force: true });
  }
  console.log(`${ids.length} site(s) E2E supprimé(s).`);
} finally {
  await client.$disconnect();
}
