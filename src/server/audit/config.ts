/**
 * What the audit extension records.
 *
 * Every business model of the data model is audited, except the audit log
 * itself, import batches (they are the « batch » of audit lines) and sessions
 * (technical, high-frequency, contain token hashes).
 */

/** Models whose writes produce audit lines (Prisma model names). */
export const AUDITED_MODELS: ReadonlySet<string> = new Set([
  "Site",
  "SiteExternalId",
  "Lease",
  "ServiceContract",
  "SiteTechnical",
  "BuildingWork",
  "SiteIcpe",
  "IcpeHeading",
  "SiteEnergyProfile",
  "AnnualMetric",
  "SiteGeometry",
  "SitePlan",
  "Equipment",
  "Document",
  "User",
]);

/** Models explicitly not audited (documentation and tests). */
export const UNAUDITED_MODELS: ReadonlySet<string> = new Set(["AuditLog", "ImportBatch", "Session"]);

/** Fields never reported in a diff, for every model. */
export const IGNORED_FIELDS: ReadonlySet<string> = new Set(["createdAt", "updatedAt", "version"]);

/**
 * Extra ignored fields per model. For `User`, the login bookkeeping fields are
 * covered by the LOGIN / LOGIN_FAILED events and would otherwise add one
 * UPDATE line per login attempt.
 */
export const MODEL_IGNORED_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  User: new Set(["failedLoginCount", "lockedUntil", "lastLoginAt"]),
};

/** Fields whose value is replaced by {@link REDACTED} in audit lines. */
export const REDACTED_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  User: new Set(["passwordHash"]),
};

/** Placeholder written instead of a redacted value. */
export const REDACTED = "[redacted]";

/** Whether writes on `model` are audited. */
export function isAuditedModel(model: string | undefined): model is string {
  return model !== undefined && AUDITED_MODELS.has(model);
}

/** Every ignored field for a model (global + model-specific). */
export function ignoredFieldsFor(model: string): ReadonlySet<string> {
  const specific = MODEL_IGNORED_FIELDS[model];
  return specific ? new Set([...IGNORED_FIELDS, ...specific]) : IGNORED_FIELDS;
}

/**
 * Copy of a record with redacted fields replaced by {@link REDACTED}
 * (a `null` value stays `null`: it reveals nothing).
 */
export function redactRecord(model: string, record: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const redacted = REDACTED_FIELDS[model];
  if (!redacted) return { ...record };
  const copy: Record<string, unknown> = { ...record };
  for (const field of redacted) {
    if (copy[field] !== null && copy[field] !== undefined) copy[field] = REDACTED;
  }
  return copy;
}
