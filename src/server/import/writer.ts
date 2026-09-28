import "server-only";
import { runWithAuditContext } from "../audit/context";
import { db } from "../db";
import type { SitePlan } from "./plan";

/**
 * The ONLY module of the import that writes to the database.
 *
 * Every write runs inside `runWithAuditContext({ actorId, source: "import",
 * batchId })`, one transaction per site: a failing site is rolled back alone,
 * the others are kept. Audited models are written record by record (the audit
 * extension refuses bulk and nested writes).
 */

/** Context of the writes of one run. */
export interface WriteContext {
  actorId: string;
  batchId: string;
  /** Test hook: called inside the site transaction, before commit. */
  faultInjector?: (code: string) => void;
}

/**
 * Creates the ImportBatch row (status RUNNING).
 * @returns The batch id.
 */
export async function createImportBatch(input: { actorId: string; fileName: string; sha256: string }): Promise<string> {
  const batch = await db.importBatch.create({
    data: { kind: "SPREADSHEET", status: "RUNNING", fileName: input.fileName, sha256: input.sha256, actorId: input.actorId },
    select: { id: true },
  });
  return batch.id;
}

/** Closes the batch with its final status, statistics and report path. */
export async function finalizeImportBatch(
  batchId: string,
  input: { status: "SUCCEEDED" | "PARTIAL" | "FAILED"; stats: unknown; reportPath: string | null },
): Promise<void> {
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: input.status, finishedAt: new Date(), statsJson: JSON.stringify(input.stats), reportPath: input.reportPath },
  });
}

/**
 * Applies the plan of one site in its own transaction, then writes the IMPORT
 * audit line of the site (`after_value = { sourceRow, sheetModifiedAt, batchId }`).
 *
 * @param plan - Output of `planSite`.
 * @param context - Actor, batch, test hook.
 * @returns The site id.
 */
export function writeSitePlan(plan: SitePlan, context: WriteContext): Promise<string> {
  return runWithAuditContext({ actorId: context.actorId, source: "import", batchId: context.batchId }, () =>
    db.$transaction(
      async (tx) => {
        let siteId = plan.existingId;
        const siteWrite = plan.writes.find((w) => w.entity === "site");
        const changed = plan.action !== "unchanged";

        if (!siteId) {
          const created = await tx.site.create({ data: { ...(siteWrite?.data ?? {}), code: plan.code, name: String(siteWrite?.data.name ?? plan.code) }, select: { id: true } });
          siteId = created.id;
        } else if (siteWrite || changed) {
          // Any change of the site aggregate bumps the optimistic-concurrency version.
          await tx.site.update({ where: { id: siteId }, data: { ...(siteWrite?.data ?? {}), version: { increment: 1 } } });
        }

        for (const write of plan.writes) {
          if (write.entity === "site") continue;
          const delegate = oneToOneDelegate(tx, write.entity);
          if (write.id) await delegate.update({ where: { id: write.id }, data: write.data });
          else await delegate.create({ data: { ...write.data, siteId } });
        }

        for (const { id } of plan.externalIds.delete) await tx.siteExternalId.delete({ where: { id } });
        for (const e of plan.externalIds.create) await tx.siteExternalId.create({ data: { siteId, system: e.system, value: e.value } });

        for (const { id } of plan.buildingWorks.delete) await tx.buildingWork.delete({ where: { id } });
        for (const w of plan.buildingWorks.update) await tx.buildingWork.update({ where: { id: w.id }, data: { datePrecision: w.datePrecision } });
        for (const w of plan.buildingWorks.create) {
          await tx.buildingWork.create({ data: { siteId, kind: w.kind, date: w.date, datePrecision: w.datePrecision } });
        }

        for (const { id } of plan.icpeHeadings.delete) await tx.icpeHeading.delete({ where: { id } });
        for (const h of plan.icpeHeadings.update) await tx.icpeHeading.update({ where: { id: h.id }, data: { regime: h.regime } });
        for (const h of plan.icpeHeadings.create) await tx.icpeHeading.create({ data: { siteId, code: h.code, regime: h.regime } });

        for (const { id } of plan.metrics.delete) await tx.annualMetric.delete({ where: { id } });
        for (const m of plan.metrics.update) {
          await tx.annualMetric.update({ where: { id: m.id }, data: { value: m.value, ...(m.source ? { source: m.source } : {}) } });
        }
        for (const m of plan.metrics.create) {
          await tx.annualMetric.create({ data: { siteId, metric: m.metric, year: m.year, value: m.value, source: "import" } });
        }

        await tx.auditLog.create({
          data: {
            actorId: context.actorId,
            action: "IMPORT",
            source: "import",
            entityType: "Site",
            entityId: siteId,
            siteId,
            batchId: context.batchId,
            afterValue: JSON.stringify({ sourceRow: plan.row, sheetModifiedAt: plan.sheetModifiedAt, batchId: context.batchId }),
          },
        });

        context.faultInjector?.(plan.code);
        return siteId;
      },
      { timeout: 120_000, maxWait: 10_000 },
    ),
  );
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
type OneToOneDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

function oneToOneDelegate(tx: Tx, entity: string): OneToOneDelegate {
  const delegates: Record<string, unknown> = {
    lease: tx.lease,
    serviceContract: tx.serviceContract,
    technical: tx.siteTechnical,
    icpe: tx.siteIcpe,
    energy: tx.siteEnergyProfile,
  };
  const delegate = delegates[entity];
  if (!delegate) throw new Error(`Entité inconnue : ${entity}`);
  return delegate as OneToOneDelegate;
}
