/**
 * Text rendering of a registry field value. A missing value (null,
 * undefined, empty string, unusable number or date) always renders as « — »;
 * the interface adds « Non renseigné » for screen readers.
 */
import { toNumber, type NumericLike } from "../derived";
import { EMPTY_VALUE, formatCurrency, formatDate, formatDateWithPrecision, formatEnergy, formatNumber, formatSurface, type DatePrecisionInput } from "@/lib/format";
import { detectReference } from "./links";
import type { FieldDefinition } from "./types";

/** A date with its precision (`dateWithPrecision` fields). */
export interface DateWithPrecision {
  date: Date | string | null;
  precision: DatePrecisionInput;
}

const NBSP = " ";

function isDateWithPrecision(value: unknown): value is DateWithPrecision {
  return typeof value === "object" && value !== null && !(value instanceof Date) && "date" in value;
}

/** Whether a value counts as « renseigné ». */
export function isFilledValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (isDateWithPrecision(value)) return isFilledValue(value.date);
  return true;
}

function numeric(value: unknown): number | null {
  if (typeof value === "boolean" || value instanceof Date) return null;
  return toNumber(value as NumericLike);
}

function pluralMonths(n: number): string {
  return `${formatNumber(n)}${NBSP}mois`;
}

/**
 * Formats a field value for display.
 * @param def - Registry definition.
 * @param value - Stored value (Decimal-like numbers accepted; `{ date, precision }` for dates with precision).
 * @returns The text, or « — » when the value is missing or unusable.
 */
export function formatFieldValue(def: Pick<FieldDefinition, "type" | "unit" | "options" | "decimals">, value: unknown): string {
  if (!isFilledValue(value)) return EMPTY_VALUE;
  switch (def.type) {
    case "text":
    case "longtext":
    case "url":
      return typeof value === "string" ? value.trim() : String(value);
    case "reference":
      return typeof value === "string" ? (detectReference(value)?.text ?? EMPTY_VALUE) : String(value);
    case "date":
      return formatDate(value instanceof Date || typeof value === "string" ? value : null);
    case "dateWithPrecision":
      if (isDateWithPrecision(value)) return formatDateWithPrecision(value.date, value.precision);
      return formatDateWithPrecision(value instanceof Date || typeof value === "string" ? value : null, "day");
    case "area": {
      // Whole areas without decimals; a typed fraction (« 12 500,5 ») is kept (2 decimals at most).
      const n = numeric(value);
      const decimals = n === null || Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2;
      return formatSurface(n, { decimals });
    }
    case "money":
      return formatCurrency(numeric(value));
    case "moneyPerSqm": {
      const n = numeric(value);
      return n === null ? EMPTY_VALUE : `${formatCurrency(n, { decimals: 2 })}/m²`;
    }
    case "number": {
      const n = numeric(value);
      if (n === null) return EMPTY_VALUE;
      if (def.unit === "kWh") return formatEnergy(n);
      return def.unit ? `${formatNumber(n, { decimals: def.decimals })}${NBSP}${def.unit}` : formatNumber(n, { decimals: def.decimals });
    }
    case "integer": {
      const n = numeric(value);
      return n === null ? EMPTY_VALUE : formatNumber(Math.round(n));
    }
    case "months": {
      const n = numeric(value);
      return n === null ? EMPTY_VALUE : pluralMonths(n);
    }
    case "boolean":
      return value === true ? "Oui" : value === false ? "Non" : EMPTY_VALUE;
    case "enum": {
      const key = String(value);
      return def.options?.[key] ?? key;
    }
  }
}
