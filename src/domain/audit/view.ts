/**
 * Reading of the audit journal (step 11, `/admin/audit` and its CSV
 * export), PURE: filters carried by the URL, keyset cursor, field labels
 * from the registry, and MASKING of financial values for readers without
 * `finance:read`.
 */
import { z } from "zod";
import { AuditAction, AuditSource } from "../enums";
import { FIELD_REGISTRY, getField, hasField } from "../fields";
import { isFinancialMetric } from "../metrics";

/** Lines per page. */
export const AUDIT_PAGE_SIZE = 50;

/** French labels of the audited entity types (filter list). */
export const ENTITY_LABELS: Readonly<Record<string, string>> = {
  Site: "Site",
  Lease: "Bail",
  ServiceContract: "Contrat de prestation",
  SiteTechnical: "Caractéristiques techniques",
  SiteIcpe: "ICPE",
  IcpeHeading: "Rubrique ICPE",
  SiteEnergyProfile: "Énergie",
  AnnualMetric: "Indicateur annuel",
  BuildingWork: "Travaux",
  SiteExternalId: "Identifiant externe",
  SiteGeometry: "Emprise",
  SitePlan: "Plan",
  Equipment: "Équipement",
  Document: "Document",
  SitePublicData: "Donnée publique",
  User: "Utilisateur",
  TrashFile: "Fichier de la corbeille",
  AppSetting: "Paramètre",
  EnrichmentDivergence: "Divergence d'enrichissement",
  EnrichmentExport: "Export pour l'enrichissement",
  Export: "Export",
};

/** Label of an entity type. */
export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Labels of fields outside the registry. */
const EXTRA_FIELD_LABELS: Readonly<Record<string, string>> = {
  "AnnualMetric.value": "Valeur",
  "AnnualMetric.note": "Note",
  "AnnualMetric.source": "Origine",
  "User.sessions": "Sessions",
  "User.role": "Rôle",
  "User.isActive": "Compte actif",
  "User.passwordHash": "Mot de passe",
  "User.mustChangePassword": "Mot de passe à changer",
  "User.name": "Nom",
  "User.email": "Email",
  "Site.archivedAt": "Archivé le",
  "AppSetting.value": "Valeur",
  "EnrichmentDivergence.status": "Statut",
};

/**
 * Label of an audited field: the registry label when the field is in it.
 * @param entityType - Audited model.
 * @param field - Field name, or `null` for a whole-record line.
 */
export function fieldLabel(entityType: string, field: string | null): string {
  if (!field) return "—";
  const id = `${entityType}.${field}`;
  if (hasField(id)) return getField(id).labelFr;
  return EXTRA_FIELD_LABELS[id] ?? field;
}

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Filters of the journal (all optional, combinable). */
export const auditFiltersSchema = z.object({
  /** First day (Paris calendar day, inclusive). */
  from: isoDay.optional().catch(undefined),
  /** Last day (inclusive). */
  to: isoDay.optional().catch(undefined),
  /** Actor id; `system` = lines without actor. */
  actor: shortText(30).optional().catch(undefined),
  source: z.enum(AuditSource.values).optional().catch(undefined),
  action: z.enum(AuditAction.values).optional().catch(undefined),
  entity: shortText(50).optional().catch(undefined),
  /** Site: part of a code or a name. */
  site: shortText(100).optional().catch(undefined),
  /** Exact site id (link from a site sheet). */
  siteId: shortText(30).optional().catch(undefined),
  field: shortText(100).optional().catch(undefined),
  batch: shortText(30).optional().catch(undefined),
});

/** Parsed filters. */
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

/** Keys of the filters, in URL order. */
export const AUDIT_FILTER_KEYS = ["from", "to", "actor", "source", "action", "entity", "site", "siteId", "field", "batch"] as const;

/** Reads the filters from URL parameters (unknown or malformed values are ignored). */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const flat: Record<string, string> = {};
  for (const key of AUDIT_FILTER_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && value.trim() !== "") flat[key] = value;
  }
  return auditFiltersSchema.parse(flat);
}

/**
 * Query string of filters (and optional cursor), stable key order.
 * @param filters - Filters.
 * @param extra - Other parameters (cursor…).
 */
export function auditQuery(filters: AuditFilters, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const key of AUDIT_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

/** Whether any filter is set. */
export function hasAuditFilters(filters: AuditFilters): boolean {
  return AUDIT_FILTER_KEYS.some((k) => Boolean(filters[k]));
}

/** Keyset position: the last line shown (date, id). */
export interface AuditCursor {
  at: Date;
  id: bigint;
}

/** Encodes a cursor for the URL (`<ISO date>_<id>`). */
export function encodeCursor(cursor: AuditCursor): string {
  return `${cursor.at.toISOString()}_${cursor.id.toString()}`;
}

/** Decodes a cursor; `null` when malformed. */
export function decodeCursor(value: string | undefined | null): AuditCursor | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{1,19})$/.exec(value ?? "");
  if (!m) return null;
  const at = new Date(m[1]!);
  return Number.isNaN(at.getTime()) ? null : { at, id: BigInt(m[2]!) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial masking
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholder shown instead of a masked value. */
export const MASKED_VALUE = "Masqué (donnée financière)";

/** Financial fields of each entity (registry). */
const FINANCIAL_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const def of FIELD_REGISTRY) {
    if (!def.financial) continue;
    const set = map.get(def.entity) ?? new Set<string>();
    set.add(def.key);
    map.set(def.entity, set);
  }
  return map;
})();

/** An audit line as needed by the masking. */
export interface MaskableLine {
  entityType: string;
  field: string | null;
  beforeValue: string | null;
  afterValue: string | null;
}

/** Context of the masking. */
export interface MaskContext {
  /** The reader holds `finance:read`: nothing is masked. */
  finance: boolean;
  /** Metric code of an `AnnualMetric` line (unknown = treated as financial). */
  metricCode?: string | null;
}

/** Result of {@link maskAuditLine}. */
export interface MaskedValues {
  beforeValue: string | null;
  afterValue: string | null;
  /** Whether something was masked. */
  masked: boolean;
}

const MASKED_JSON = JSON.stringify(MASKED_VALUE);

/** Masks the given keys of a JSON object value (whole-record lines). */
function maskKeys(json: string | null, keys: ReadonlySet<string>): { value: string | null; masked: boolean } {
  if (json === null) return { value: null, masked: false };
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { value: MASKED_JSON, masked: true };
    let masked = false;
    const copy: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
    for (const key of keys) {
      if (key in copy && copy[key] !== null) {
        copy[key] = MASKED_VALUE;
        masked = true;
      }
    }
    return { value: JSON.stringify(copy), masked };
  } catch {
    return { value: MASKED_JSON, masked: true };
  }
}

/**
 * Values of an audit line as a reader may see them. Without `finance:read`:
 * - a financial registry field (e.g. `Lease.marketRentValue`): both values masked;
 * - a whole-record line (creation, deletion) of such an entity: its financial keys masked;
 * - a yearly value of a financial metric (`AnnualMetric`, metric unknown
 *   counts as financial): value and note masked.
 * @param line - Audit line.
 * @param context - Reader's permission and metric code.
 */
export function maskAuditLine(line: MaskableLine, context: MaskContext): MaskedValues {
  const keep = { beforeValue: line.beforeValue, afterValue: line.afterValue, masked: false };
  if (context.finance) return keep;
  const maskBoth = (): MaskedValues => ({
    beforeValue: line.beforeValue === null ? null : MASKED_JSON,
    afterValue: line.afterValue === null ? null : MASKED_JSON,
    masked: line.beforeValue !== null || line.afterValue !== null,
  });

  if (line.entityType === "AnnualMetric") {
    if (!isFinancialMetric(context.metricCode ?? "")) return keep;
    if (line.field === null) {
      const keys = new Set(["value", "note"]);
      const before = maskKeys(line.beforeValue, keys);
      const after = maskKeys(line.afterValue, keys);
      return { beforeValue: before.value, afterValue: after.value, masked: before.masked || after.masked };
    }
    return line.field === "value" || line.field === "note" ? maskBoth() : keep;
  }

  const financial = FINANCIAL_FIELDS.get(line.entityType);
  if (!financial) return keep;
  if (line.field === null) {
    const before = maskKeys(line.beforeValue, financial);
    const after = maskKeys(line.afterValue, financial);
    return { beforeValue: before.value, afterValue: after.value, masked: before.masked || after.masked };
  }
  return financial.has(line.field) ? maskBoth() : keep;
}

/**
 * Display text of a JSON-serialized audit value: strings as is, `null` → « — »,
 * booleans in French, objects and arrays as compact JSON.
 */
export function auditValueText(json: string | null): string {
  if (json === null) return "—";
  try {
    const value = JSON.parse(json) as unknown;
    if (value === null) return "—";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (typeof value === "number") return String(value);
    return JSON.stringify(value);
  } catch {
    return json;
  }
}
