import "server-only";
import { z } from "zod";
import { toIsoDate } from "@/domain/dates";
import { DatePrecision } from "@/domain/enums";
import { fieldsOfSection, formatFieldValue, getField, FIELD_SECTIONS, type FieldDefinition, type FieldEntity, type FieldSection } from "@/domain/fields";
import {
  buildSectionSchema,
  crossFieldRules,
  dbToWire,
  detectConflicts,
  editableFields,
  fieldErrors,
  refusedKeys,
  type FieldChangeRequest,
} from "@/domain/fields/validation";
import { fromWire, toWire, wireEquals, type DbValue, type FormValue, type WireValue } from "@/domain/fields/wire";
import type { SessionUser } from "../auth/session";
import { getFieldProvenance, isWellFormedSiteId, provenanceOf } from "./detail";
import { Abort, assertAll, auditedTransaction, commentSchema, fail, lockSite, sectionPermissions, statusOf, withForbidden, type ConflictInfo, type Failure, type StatusChange, type Tx } from "./edit-common";

export { COMMENT_MAX, newBatchId, sectionPermissions, type ConflictInfo, type Failure, type StatusChange } from "./edit-common";

/**
 * Traced editing of a site (step 9). Every write:
 * - checks the permissions on the server (`site:write`, plus `finance:read`
 *   for financial data) — the interface only hides what is not allowed;
 * - accepts only the registry fields marked `editable` (white list: any other
 *   key is REFUSED, never ignored);
 * - validates with the schemas generated from the registry (shared with the
 *   client);
 * - runs in `runWithAuditContext({ actorId, source: "ui", batchId, comment })`
 *   and ONE transaction, with one `batchId` per save, and writes only the
 *   fields that really change;
 * - detects conflicts FIELD BY FIELD: a field whose current value differs from
 *   the value shown when the form was opened (`from`) is not written.
 *
 * The functions take the acting user as first argument (testable); the
 * Server Actions of `actions.ts` call them with the session user.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Entity edited by each section. */
export const SECTION_ENTITY: Readonly<Record<FieldSection, FieldEntity>> = {
  identity: "Site",
  organization: "Site",
  location: "Site",
  lease: "Lease",
  lease_financial: "Lease",
  service_contract: "ServiceContract",
  technical_surfaces: "SiteTechnical",
  technical_capacities: "SiteTechnical",
  technical_misc: "SiteTechnical",
  icpe: "SiteIcpe",
  energy: "SiteEnergyProfile",
};

const DELEGATE: Readonly<Record<FieldEntity, string>> = {
  Site: "site",
  Lease: "lease",
  ServiceContract: "serviceContract",
  SiteTechnical: "siteTechnical",
  SiteIcpe: "siteIcpe",
  SiteEnergyProfile: "siteEnergyProfile",
};

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findUnique(args: unknown): Promise<Row | null>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  delete(args: unknown): Promise<Row>;
};
const delegate = (tx: Tx, entity: FieldEntity) => (tx as unknown as Record<string, Delegate>)[DELEGATE[entity]]!;

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

const wireSchema: z.ZodType<WireValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ date: z.string(), precision: z.enum(DatePrecision.values) }),
]);
const formSchema: z.ZodType<FormValue> = z.union([z.string().max(20_000), z.object({ date: z.string().max(40), precision: z.string().max(10) })]);

const saveSectionInput = z.object({
  siteId: z.string().min(1).max(30),
  section: z.enum(Object.keys(FIELD_SECTIONS) as [FieldSection, ...FieldSection[]]),
  changes: z.record(z.string().max(100), z.object({ from: wireSchema, to: formSchema })),
  comment: commentSchema,
  /** The user confirmed the warnings (« Enregistrer quand même »). */
  confirmWarnings: z.boolean().optional(),
});

/** Input of {@link saveSiteSection}. */
export type SaveSectionInput = z.input<typeof saveSectionInput>;

/** Result of {@link saveSiteSection}. */
export type SaveSectionResult = { ok: true; changedCount: number; status: StatusChange } | Failure;

/** Wire value of a field of a record. */
function currentWire(def: FieldDefinition, record: Row | null): WireValue {
  if (!record) return null;
  return toWire(def, record[def.key], def.precisionKey ? record[def.precisionKey] : undefined);
}

/** Typed value of a field of a record (for the cross-field rules). */
function currentDb(def: FieldDefinition, record: Row | null): DbValue {
  return fromWire(def, currentWire(def, record));
}

/** Display text of a typed value. */
const textOf = (def: FieldDefinition, value: DbValue): string => formatFieldValue(def, value);

/** Conflict details: who last changed each field, and when. */
async function conflictInfos(siteId: string, entity: FieldEntity, recordId: string | null, conflicts: ReturnType<typeof detectConflicts>, parsed: Record<string, DbValue>): Promise<ConflictInfo[]> {
  const provenance = await getFieldProvenance(siteId);
  return conflicts.map((c) => {
    const def = getField(`${entity}.${c.field}`);
    const p = provenanceOf(provenance, entity, recordId, c.field);
    return {
      field: c.field,
      labelFr: def.labelFr,
      yours: c.yours,
      yoursText: textOf(def, parsed[c.field] ?? null),
      theirs: c.theirs,
      theirsText: formatFieldValue(def, fromWire(def, c.theirs)),
      by: p?.actorName ?? (p ? (p.source === "import" ? "Import du tableur" : p.source === "enrichment" ? "Enrichissement" : "Système") : null),
      at: p ? p.occurredAt.toISOString() : null,
      comment: p?.comment ?? null,
    };
  });
}

/**
 * Saves the modified fields of one section of a site.
 *
 * In one transaction (site row locked): reads the current values; if the
 * current value of a requested field differs from its `from`, nothing is
 * written and the conflicts are returned (with the author and date of the
 * last change); otherwise the cross-field rules run (errors block, warnings
 * need `confirmWarnings`), the fields that really change are written (the
 * 1-1 record is created when missing), `Site.version` is incremented and,
 * when the coordinates change, `coordinatesSource` becomes `manual`.
 *
 * @param user - Acting user.
 * @param input - Site, section, `{ key: { from, to } }`, optional reason.
 * @returns The number of changed fields and the status before / after, or a failure.
 */
export async function saveSiteSection(user: SessionUser, input: SaveSectionInput): Promise<SaveSectionResult> {
  return withForbidden(async () => {
    const parsedInput = saveSectionInput.safeParse(input);
    if (!parsedInput.success) return fail("invalid", parsedInput.error.issues[0]?.message ?? "Requête invalide.");
    const { siteId, section, changes, comment, confirmWarnings } = parsedInput.data;
    assertAll(user, sectionPermissions(section));

    const refused = refusedKeys(section, Object.keys(changes));
    if (refused.length) return fail("refused", `Champ non modifiable : ${refused.join(", ")}.`, { fieldErrors: Object.fromEntries(refused.map((k) => [k, "Champ non modifiable."])) });
    if (Object.keys(changes).length === 0) return fail("invalid", "Aucune modification à enregistrer.");

    const schema = buildSectionSchema(section).safeParse(Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to])));
    if (!schema.success) return fail("invalid", "Certaines valeurs sont invalides.", { fieldErrors: fieldErrors(schema.error) });
    const parsed = schema.data as Record<string, DbValue>;
    if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");

    const before = await statusOf(siteId);
    const entity = SECTION_ENTITY[section];
    const defs = editableFields(section);

    const result = await auditedTransaction(user, comment, async (tx) => {
      const site = await lockSite(tx, siteId);
      if (!site) throw new Abort(fail("not_found", "Site introuvable."));
      if (site.archived) throw new Abort(fail("archived", "Site archivé : le désarchiver avant de le modifier."));
      const record = entity === "Site" ? await delegate(tx, "Site").findUnique({ where: { id: siteId } }) : await delegate(tx, entity).findUnique({ where: { siteId } });

      const current: Record<string, WireValue> = {};
      for (const def of defs) current[def.key] = currentWire(def, record);
      const conflicts = detectConflicts(changes as Record<string, FieldChangeRequest>, current);
      if (conflicts.length) {
        const infos = await conflictInfos(siteId, entity, record?.id ?? null, conflicts, parsed);
        throw new Abort(fail("conflict", "Ces champs ont été modifiés par quelqu'un d'autre depuis l'ouverture du formulaire.", { conflicts: infos }));
      }

      // Values after the change, for the cross-field rules.
      const after: Record<string, unknown> = {};
      for (const def of fieldsOfSection(section)) after[def.key] = def.key in parsed ? parsed[def.key] : currentDb(def, record);
      const rules = crossFieldRules(section, after);
      if (rules.errors.length) {
        throw new Abort(fail("cross_errors", rules.errors.map((e) => e.message).join(" "), { fieldErrors: Object.fromEntries(rules.errors.map((e) => [e.field, e.message])) }));
      }
      if (rules.warnings.length && !confirmWarnings) throw new Abort(fail("warnings", "Vérifier les avertissements avant d'enregistrer.", { warnings: rules.warnings }));

      // Only the fields that really change.
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const def = getField(`${entity}.${key}`);
        if (wireEquals(dbToWire(def, value), current[key] ?? null)) continue;
        if (def.type === "dateWithPrecision" && def.precisionKey) {
          const v = value as { date: Date; precision: string } | null;
          data[key] = v?.date ?? null;
          data[def.precisionKey] = v?.precision ?? null;
        } else {
          data[key] = value;
        }
      }
      const changedCount = Object.keys(data).filter((k) => !k.endsWith("Precision")).length;
      if (changedCount === 0) return 0;
      if (entity === "Site" && ("latitude" in data || "longitude" in data)) data.coordinatesSource = "manual";

      if (record) await delegate(tx, entity).update({ where: { id: record.id }, data });
      else await delegate(tx, entity).create({ data: { ...data, siteId } });
      await tx.site.update({ where: { id: siteId }, data: { version: { increment: 1 } } });
      return changedCount;
    });
    if (typeof result !== "number") return result;
    return { ok: true, changedCount: result, status: { before, after: await statusOf(siteId) } };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Yearly metrics
// ─────────────────────────────────────────────────────────────────────────────

export { saveAnnualMetrics, type SaveMetricsInput, type SaveMetricsResult } from "./edit-metrics";
export { saveListItem, deleteListItem, type ListKind, type ListItemInput } from "./edit-lists";
export { createSite, archiveSite, unarchiveSite, type CreateSiteInput } from "./edit-lifecycle";

/** Date → `YYYY-MM-DD` (display of conflicts on the client). */
export const isoDay = (d: Date | null) => toIsoDate(d);
