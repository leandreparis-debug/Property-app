import "server-only";
import { createHash } from "node:crypto";
import { runWithAuditContext } from "../audit/context";
import { db } from "../db";
import type { ProposalLine, SiteEnrichmentWrites } from "./plan";

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

/** Result of {@link recordDivergences}. */
export interface DivergenceRecording {
  /** New open divergences. */
  created: number;
  /** Already open, or dismissed for the same proposed value: not recreated. */
  known: number;
}

/**
 * Records the divergences of an application for review (step 11),
 * IDEMPOTENTLY: one open divergence per site, field and proposed value; a
 * divergence dismissed for the same proposed value is never recreated.
 * Audited with the enrichment context (source `enrichment`, batch).
 * @param lines - Divergence lines of the plan.
 * @param siteIdByCode - Site ids by code.
 * @param context - Actor and enrichment batch.
 */
export async function recordDivergences(
  lines: readonly ProposalLine[],
  siteIdByCode: ReadonlyMap<string, string>,
  context: { actorId: string; batchId: string },
): Promise<DivergenceRecording> {
  const result: DivergenceRecording = { created: 0, known: 0 };
  await runWithAuditContext({ actorId: context.actorId, source: "enrichment", batchId: context.batchId }, async () => {
    for (const line of lines) {
      if (line.outcome !== "divergence") continue;
      const siteId = siteIdByCode.get(line.code);
      if (!siteId) continue;
      const proposedSha256 = createHash("sha256").update(line.proposed, "utf8").digest("hex");
      const existing = await db.enrichmentDivergence.findFirst({
        where: { siteId, target: line.target, proposedSha256, status: { in: ["open", "dismissed"] } },
        select: { id: true },
      });
      if (existing) {
        result.known++;
        continue;
      }
      await db.enrichmentDivergence.create({
        data: {
          siteId,
          target: line.target,
          currentValue: line.current,
          proposedValue: line.proposed,
          proposedSha256,
          provider: line.provider.slice(0, 40),
          confidence: Math.round(line.confidence * 1000) / 1000,
          evidence: line.evidence.slice(0, 1000) || null,
          batchId: context.batchId,
        },
      });
      result.created++;
    }
  });
  return result;
}
