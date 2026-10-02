import "server-only";
import { z } from "zod";
import { toNumber } from "@/domain/derived";
import { getMetric, isFinancialMetric, isMetricCode, metricValueSchema, type MetricCode } from "@/domain/metrics";
import { parseNumber } from "../import/parsers";
import type { Action } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { getFieldProvenance, isWellFormedSiteId, provenanceOf } from "./detail";
import { Abort, assertAll, auditedTransaction, commentSchema, fail, lockSite, statusOf, withForbidden, type ConflictInfo, type Failure, type StatusChange } from "./edit-common";

/** Years accepted for a yearly metric. */
export const METRIC_YEARS = { min: 1990, max: 2100 } as const;

const saveMetricsInput = z.object({
  siteId: z.string().min(1).max(30),
  changes: z
    .array(
      z.object({
        metric: z.string().max(40),
        year: z.number().int().min(METRIC_YEARS.min).max(METRIC_YEARS.max),
        /** Value shown when the table was opened (`null`: empty cell). */
        from: z.number().nullable(),
        /** Typed text (French number); empty: delete the value. */
        to: z.string().max(60),
      }),
    )
    .min(1)
    .max(500),
  comment: commentSchema,
});

/** Input of {@link saveAnnualMetrics}. */
export type SaveMetricsInput = z.input<typeof saveMetricsInput>;

/** Result of {@link saveAnnualMetrics}. */
export type SaveMetricsResult = { ok: true; changedCount: number; status: StatusChange } | Failure;

const cellKey = (metric: string, year: number) => `${metric}|${year}`;
const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/**
 * Saves yearly metric values (`annual_metrics`), cell by cell, with the same
 * `from` / `to` conflict detection as the sections. An empty `to` deletes the
 * row; a new value creates it; every written row gets `source = "manual"`.
 * Financial metrics need `finance:read` in addition to `site:write`. Values
 * are validated with `metricValueSchema` (finite, |v| < 10¹¹, 4 decimals).
 *
 * @param user - Acting user.
 * @param input - Site, cells `{ metric, year, from, to }`, optional reason.
 */
export async function saveAnnualMetrics(user: SessionUser, input: SaveMetricsInput): Promise<SaveMetricsResult> {
  return withForbidden(async () => {
    const parsedInput = saveMetricsInput.safeParse(input);
    if (!parsedInput.success) return fail("invalid", parsedInput.error.issues[0]?.message ?? "Requête invalide.");
    const { siteId, changes, comment } = parsedInput.data;

    const unknown = changes.filter((c) => !isMetricCode(c.metric));
    if (unknown.length) return fail("refused", `Indicateur inconnu : ${unknown.map((c) => c.metric).join(", ")}.`);
    const actions: Action[] = ["site:write"];
    if (changes.some((c) => isFinancialMetric(c.metric))) actions.push("finance:read");
    assertAll(user, actions);
    if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");

    // Parse the typed values (French format) and validate them.
    const values = new Map<string, number | null>();
    const errors: Record<string, string> = {};
    for (const c of changes) {
      const key = cellKey(c.metric, c.year);
      if (c.to.trim() === "") {
        values.set(key, null);
        continue;
      }
      const n = parseNumber(c.to).value;
      const checked = n === null ? null : metricValueSchema.safeParse(n);
      if (!checked?.success) errors[key] = n === null ? "Nombre invalide (exemple : 12 345,67)." : (checked?.error.issues[0]?.message ?? "Valeur invalide.");
      else values.set(key, checked.data);
    }
    if (Object.keys(errors).length) return fail("invalid", "Certaines valeurs sont invalides.", { fieldErrors: errors });

    const before = await statusOf(siteId);
    const result = await auditedTransaction(user, comment, async (tx) => {
      const site = await lockSite(tx, siteId);
      if (!site) throw new Abort(fail("not_found", "Site introuvable."));
      if (site.archived) throw new Abort(fail("archived", "Site archivé : le désarchiver avant de le modifier."));
      const rows = await tx.annualMetric.findMany({ where: { siteId, OR: changes.map((c) => ({ metric: c.metric, year: c.year })) } });
      const byKey = new Map(rows.map((r) => [cellKey(r.metric, r.year), { id: r.id, value: toNumber(r.value) }]));

      const conflicts = changes.filter((c) => !same(byKey.get(cellKey(c.metric, c.year))?.value ?? null, c.from));
      if (conflicts.length) {
        const provenance = await getFieldProvenance(siteId);
        const infos: ConflictInfo[] = conflicts.map((c) => {
          const row = byKey.get(cellKey(c.metric, c.year));
          const p = provenanceOf(provenance, "AnnualMetric", row?.id, "value");
          const theirs = row?.value ?? null;
          return {
            field: cellKey(c.metric, c.year),
            labelFr: `${getMetric(c.metric as MetricCode).labelFr} ${c.year}`,
            yours: c.to,
            yoursText: c.to.trim() || "—",
            theirs,
            theirsText: theirs === null ? "—" : String(theirs).replace(".", ","),
            by: p?.actorName ?? (p ? "Import du tableur" : null),
            at: p?.occurredAt.toISOString() ?? null,
            comment: p?.comment ?? null,
          };
        });
        throw new Abort(fail("conflict", "Ces valeurs ont été modifiées par quelqu'un d'autre depuis l'ouverture du tableau.", { conflicts: infos }));
      }

      let changed = 0;
      for (const c of changes) {
        const key = cellKey(c.metric, c.year);
        const next = values.get(key) ?? null;
        const row = byKey.get(key);
        if (same(row?.value ?? null, next)) continue;
        if (next === null) await tx.annualMetric.delete({ where: { id: row!.id } });
        else if (row) await tx.annualMetric.update({ where: { id: row.id }, data: { value: next, source: "manual" } });
        else await tx.annualMetric.create({ data: { siteId, metric: c.metric, year: c.year, value: next, source: "manual" } });
        changed++;
      }
      if (changed > 0) await tx.site.update({ where: { id: siteId }, data: { version: { increment: 1 } } });
      return changed;
    });
    if (typeof result !== "number") return result;
    return { ok: true, changedCount: result, status: { before, after: await statusOf(siteId) } };
  });
}
