import { serializeAuditValue } from "./serialize";

/** One changed field. Values are the serialized (JSON) forms. */
export interface FieldChange {
  field: string;
  /** JSON of the previous value, `null` if it was empty. */
  before: string | null;
  /** JSON of the new value, `null` if it is now empty. */
  after: string | null;
}

/**
 * Compares two versions of a record field by field.
 *
 * Values are compared through their stable serialization, so a `Decimal`
 * equals the same number, two `Date`s with the same instant are equal, and
 * `null` equals `undefined` (both mean « empty »).
 *
 * @param before - Previous state (scalar fields).
 * @param after - New state (scalar fields).
 * @param ignoredFields - Fields never reported (e.g. `updatedAt`).
 * @returns Changed fields, sorted by name; empty if nothing changed.
 */
export function diffRecords(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  ignoredFields: ReadonlySet<string> | readonly string[] = [],
): FieldChange[] {
  const ignored = ignoredFields instanceof Set ? ignoredFields : new Set(ignoredFields);
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];
  for (const field of [...fields].sort()) {
    if (ignored.has(field)) continue;
    const previous = serializeAuditValue(before[field]);
    const next = serializeAuditValue(after[field]);
    if (previous !== next) changes.push({ field, before: previous, after: next });
  }
  return changes;
}
