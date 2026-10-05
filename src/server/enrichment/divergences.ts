import "server-only";
import { ENRICHMENT_TARGETS, type EnrichmentTarget } from "@/domain/enrichment-format";
import { DivergenceStatus } from "@/domain/enums";
import { getField, hasField, type FieldEntity } from "@/domain/fields";
import { toWire } from "@/domain/fields/wire";
import { runWithAuditContext } from "../audit/context";
import { can, ForbiddenError } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { newBatchId, saveSiteSection } from "../sites/edit";
import { currentValue, displayValue } from "./plan";
import { loadEnrichmentState } from "./state";

/**
 * Review of the enrichment divergences (step 11, `/admin/enrichment`,
 * `enrichment:apply`).
 *
 * - « Conserver la valeur actuelle »: status `dismissed`, optional reason
 *   (also on a selection).
 * - « Adopter la valeur proposée »: ONE divergence at a time, through the
 *   SAME write path as the site sheet (`saveSiteSection`: registry
 *   validation, site lock, field conflict detection, audit) with source
 *   `enrichment` and the enrichment batch. Refused when the current value
 *   changed since the detection, when the site is archived, or when the
 *   field is not editable in the registry.
 */

/** French label of an enrichment target. */
export function targetLabel(target: string): string {
  if (hasField(target)) return getField(target).labelFr;
  if (target === "SiteGeometry.footprintGeoJson") return "Emprise du bâtiment";
  if (target === "SiteGeometry.heightM") return "Hauteur du bâtiment (BD TOPO)";
  return target;
}

/** Whether a target is an editable registry field (adoption possible). */
export function isAdoptable(target: string): boolean {
  return hasField(target) && getField(target).editable;
}

/** Filters of the review list. */
export interface DivergenceFilters {
  site?: string;
  target?: string;
  provider?: string;
  status?: string;
}

/** A divergence as displayed. */
export interface DivergenceView {
  id: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  siteArchived: boolean;
  target: string;
  targetLabel: string;
  adoptable: boolean;
  currentValue: string | null;
  proposedValue: string;
  provider: string;
  confidence: number | null;
  evidence: string | null;
  status: string;
  createdAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionComment: string | null;
}

/**
 * Divergences, most recent first (at most 500).
 * @param filters - Site (code or name), field, source, status.
 */
export async function listDivergences(filters: DivergenceFilters = {}): Promise<DivergenceView[]> {
  const site = filters.site?.trim().slice(0, 100);
  const rows = await db.enrichmentDivergence.findMany({
    where: {
      ...(site ? { site: { OR: [{ code: { contains: site } }, { name: { contains: site } }] } } : {}),
      ...(filters.target && (ENRICHMENT_TARGETS as readonly string[]).includes(filters.target) ? { target: filters.target } : {}),
      ...(filters.provider ? { provider: filters.provider.slice(0, 40) } : {}),
      ...(filters.status && DivergenceStatus.is(filters.status) ? { status: filters.status } : {}),
    },
    include: { site: { select: { code: true, name: true, archivedAt: true } }, resolvedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((d) => ({
    id: d.id,
    siteId: d.siteId,
    siteCode: d.site.code,
    siteName: d.site.name,
    siteArchived: d.site.archivedAt !== null,
    target: d.target,
    targetLabel: targetLabel(d.target),
    adoptable: isAdoptable(d.target),
    currentValue: d.currentValue,
    proposedValue: d.proposedValue,
    provider: d.provider,
    confidence: d.confidence === null ? null : Number(d.confidence),
    evidence: d.evidence,
    status: d.status,
    createdAt: d.createdAt,
    resolvedBy: d.resolvedBy ? (d.resolvedBy.name ?? d.resolvedBy.email) : null,
    resolvedAt: d.resolvedAt,
    resolutionComment: d.resolutionComment,
  }));
}

/** Sources (providers) present among the divergences, for the filter. */
export async function divergenceProviders(): Promise<string[]> {
  const rows = await db.enrichmentDivergence.groupBy({ by: ["provider"], orderBy: { provider: "asc" } });
  return rows.map((r) => r.provider);
}

/** Result of the review actions. */
export type DivergenceResult = { ok: true; count: number } | { ok: false; message: string };

const fail = (message: string): DivergenceResult => ({ ok: false, message });

function assertReview(user: SessionUser): void {
  if (!can(user.role, "enrichment:apply")) throw new ForbiddenError("enrichment:apply");
}

/**
 * « Conserver la valeur actuelle » on one or several OPEN divergences.
 * @param user - Reviewer (`enrichment:apply`).
 * @param ids - Divergences (at most 500).
 * @param comment - Optional reason.
 * @returns Number of divergences dismissed.
 */
export async function dismissDivergences(user: SessionUser, ids: readonly string[], comment?: string | null): Promise<DivergenceResult> {
  assertReview(user);
  const unique = [...new Set(ids)].slice(0, 500);
  if (unique.length === 0) return fail("Aucune divergence sélectionnée.");
  const reason = comment?.trim().slice(0, 500) || null;
  const count = await runWithAuditContext({ actorId: user.id, source: "ui", batchId: newBatchId(), comment: reason }, () =>
    db.$transaction(async (tx) => {
      const open = await tx.enrichmentDivergence.findMany({ where: { id: { in: unique }, status: "open" }, select: { id: true } });
      for (const d of open) {
        await tx.enrichmentDivergence.update({ where: { id: d.id }, data: { status: "dismissed", resolvedById: user.id, resolvedAt: new Date(), resolutionComment: reason } });
      }
      return open.length;
    }),
  );
  return count === 0 ? fail("Ces divergences ont déjà été traitées.") : { ok: true, count };
}

/** Record holding a target field (Site or one of its 1-1 records). */
async function currentRecord(entity: FieldEntity, siteId: string): Promise<Record<string, unknown> | null> {
  switch (entity) {
    case "Site":
      return db.site.findUnique({ where: { id: siteId } });
    case "SiteIcpe":
      return db.siteIcpe.findUnique({ where: { siteId } });
    default:
      return null;
  }
}

/**
 * « Adopter la valeur proposée » on ONE open divergence (see module doc).
 * @param user - Reviewer: `enrichment:apply`, and the permissions of the
 *   site sheet section (checked by `saveSiteSection`).
 * @param id - Divergence.
 * @param comment - Optional reason (written on the audit lines).
 */
export async function adoptDivergence(user: SessionUser, id: string, comment?: string | null): Promise<DivergenceResult> {
  assertReview(user);
  const divergence = await db.enrichmentDivergence.findUnique({ where: { id }, include: { site: { select: { id: true, code: true, archivedAt: true } } } });
  if (!divergence) return fail("Divergence introuvable.");
  if (divergence.status !== "open") return fail("Cette divergence a déjà été traitée.");
  if (divergence.site.archivedAt) return fail("Site archivé : le désarchiver avant d'adopter une valeur.");
  if (!isAdoptable(divergence.target)) return fail(`« ${targetLabel(divergence.target)} » n'est pas modifiable dans la fiche : adoption impossible. Conserver la valeur actuelle, ou corriger la donnée à la source.`);

  // The current value must be the one seen at the detection.
  const state = (await loadEnrichmentState([divergence.site.code])).get(divergence.site.code.toUpperCase());
  const now = state ? displayValue(currentValue(state, divergence.target as EnrichmentTarget)) : null;
  if (now !== divergence.currentValue) {
    return fail(`La valeur actuelle a changé depuis la détection (${divergence.currentValue ?? "vide"} → ${now ?? "vide"}) : adoption refusée. Vérifier la fiche, puis conserver ou corriger à la main.`);
  }

  const def = getField(divergence.target as `${FieldEntity}.${string}`);
  const record = await currentRecord(def.entity, divergence.siteId);
  const from = toWire(def, record?.[def.key] ?? null, def.precisionKey ? record?.[def.precisionKey] : undefined);
  const reason = comment?.trim().slice(0, 500) || null;
  const saved = await saveSiteSection(
    user,
    { siteId: divergence.siteId, section: def.section, changes: { [def.key]: { from, to: divergence.proposedValue } }, comment: reason, confirmWarnings: true },
    { source: "enrichment", batchId: divergence.batchId },
  );
  if (!saved.ok) {
    if (saved.reason === "conflict") return fail("La valeur actuelle a changé depuis la détection : adoption refusée.");
    return fail(saved.message);
  }
  await runWithAuditContext({ actorId: user.id, source: "enrichment", batchId: divergence.batchId, comment: reason }, () =>
    db.enrichmentDivergence.update({ where: { id }, data: { status: "accepted", resolvedById: user.id, resolvedAt: new Date(), resolutionComment: reason } }),
  );
  return { ok: true, count: 1 };
}

/** One enrichment application, as listed in the history. */
export interface EnrichmentRun {
  id: string;
  startedAt: Date;
  actor: string | null;
  file: string | null;
  status: string;
  filled: number | null;
  divergences: number | null;
  ignored: number | null;
}

/** Enrichment applications, most recent first. */
export async function listEnrichmentRuns(limit = 50): Promise<EnrichmentRun[]> {
  const batches = await db.importBatch.findMany({
    where: { kind: "ENRICHMENT" },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, email: true } } },
  });
  return batches.map((b) => {
    let counts: Record<string, number> | null = null;
    try {
      counts = b.statsJson ? ((JSON.parse(b.statsJson) as { counts?: Record<string, number> }).counts ?? null) : null;
    } catch {
      counts = null;
    }
    const n = (k: string) => counts?.[k] ?? 0;
    return {
      id: b.id,
      startedAt: b.startedAt,
      actor: b.actor ? (b.actor.name ?? b.actor.email) : null,
      file: b.fileName,
      status: b.status,
      filled: counts ? n("applied") : null,
      divergences: counts ? n("divergence") : null,
      ignored: counts ? n("low_confidence") + n("preserved") + n("incomplete_pair") : null,
    };
  });
}
