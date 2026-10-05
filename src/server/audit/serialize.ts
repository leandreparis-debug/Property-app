/**
 * Stable JSON serialization for audit values.
 *
 * - Prisma `Decimal` → its exact decimal string ("1234.5");
 * - `Date` → ISO 8601 string;
 * - `bigint` → decimal string;
 * - `null` is kept, `undefined` properties are omitted;
 * - object keys are sorted, so equal values always serialize identically.
 */

/** A JSON value produced by {@link toAuditJson}. */
export type AuditJson = string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

function isDecimalLike(value: object): value is { toFixed(): string; toString(): string } {
  // Prisma's Decimal (decimal.js) instances expose `d`, `e`, `s` and `toFixed`.
  return "toFixed" in value && "d" in value && "e" in value && "s" in value;
}

/**
 * Converts a value into plain JSON data (see module rules).
 * @param value - Any value read from or written to the database.
 * @returns JSON-compatible data; `undefined` for `undefined` or functions.
 */
export function toAuditJson(value: unknown): AuditJson | undefined {
  if (value === null) return null;
  switch (typeof value) {
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
    case "bigint":
      return value.toString();
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "string":
    case "boolean":
      return value;
  }
  const obj = value as object;
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  if (isDecimalLike(obj)) return obj.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(obj)) return obj.toString("base64");
  if (Array.isArray(obj)) return obj.map((item) => toAuditJson(item) ?? null);
  const out: { [key: string]: AuditJson } = {};
  for (const key of Object.keys(obj).sort()) {
    const converted = toAuditJson((obj as Record<string, unknown>)[key]);
    if (converted !== undefined) out[key] = converted;
  }
  return out;
}

/**
 * Serializes a value to a stable JSON string.
 * @param value - Value to serialize.
 * @returns The JSON text; `null` when the value is `null` or `undefined`
 *   (stored as SQL NULL, i.e. « no value »).
 */
export function serializeAuditValue(value: unknown): string | null {
  const json = toAuditJson(value);
  return json === undefined || json === null ? null : JSON.stringify(json);
}
