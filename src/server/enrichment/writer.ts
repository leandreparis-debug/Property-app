import "server-only";
import { runWithAuditContext } from "../audit/context";
import { db } from "../db";
import type { SiteEnrichmentWrites } from "./plan";

/**
 * The ONLY module of the enrichment application that writes business data.
 *
 * Every write runs inside `runWithAuditContext({ actorId, source:
 * "enrichment", batchId })` — the audit extension records one line per
 * changed field with that source and batch — one transaction per site.
 */

/** Creates the ImportBatch row of kind ENRICHMENT (status RUNNING). */
export async function createEnrichmentBatch(input: { actorId: string; fileName: string; sha256: string }): Promise<string> {
  const batch = await db.importBatch.create({
    data: { kind: "ENRICHMENT", status: "RUNNING", fileName: input.fileName, sha256: input.sha256, actorId: input.actorId },
    select: { id: true },
  });
  return batch.id;
}

/** Closes the batch. */
export async function finalizeEnrichmentBatch(
  batchId: string,
  input: { status: "SUCCEEDED" | "PARTIAL" | "FAILED"; stats: unknown; reportPath: string | null },
): Promise<void> {
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: input.status, finishedAt: new Date(), statsJson: JSON.stringify(input.stats), reportPath: input.reportPath },
  });
}

/**
 * Applies the writes of one site in its own transaction, then records the
 * ENRICH summary audit line of the site.
 */
export function writeSiteEnrichment(writes: SiteEnrichmentWrites, context: { actorId: string; batchId: string }): Promise<void> {
  return runWithAuditContext({ actorId: context.actorId, source: "enrichment", batchId: context.batchId }, () =>
    db.$transaction(
      async (tx) => {
        const { siteId } = writes;
        if (Object.keys(writes.site).length > 0 || writes.geometry || writes.icpe) {
          await tx.site.update({ where: { id: siteId }, data: { ...writes.site, version: { increment: 1 } } });
        }
        if (writes.geometry) {
          if (writes.geometry.id) await tx.siteGeometry.update({ where: { id: writes.geometry.id }, data: writes.geometry.data });
          else await tx.siteGeometry.create({ data: { ...writes.geometry.data, siteId } });
        }
        if (writes.icpe) {
          if (writes.icpe.id) await tx.siteIcpe.update({ where: { id: writes.icpe.id }, data: writes.icpe.data });
          else await tx.siteIcpe.create({ data: { ...writes.icpe.data, siteId } });
        }
        for (const p of writes.publicData) {
          if (p.id) {
            await tx.sitePublicData.update({ where: { id: p.id }, data: { valueJson: p.valueJson, fetchedAt: p.fetchedAt, batchId: context.batchId } });
          } else {
            await tx.sitePublicData.create({ data: { siteId, provider: p.provider, key: p.key, valueJson: p.valueJson, fetchedAt: p.fetchedAt, batchId: context.batchId } });
          }
        }
        await tx.auditLog.create({
          data: {
            actorId: context.actorId,
            action: "ENRICH",
            source: "enrichment",
            entityType: "Site",
            entityId: siteId,
            siteId,
            batchId: context.batchId,
            afterValue: JSON.stringify({ batchId: context.batchId, appliedFields: writes.appliedFields, publicData: writes.publicData.map((p) => `${p.provider}.${p.key}`) }),
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    ),
  );
}
