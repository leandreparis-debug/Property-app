/**
 * Values exchanged between the edit forms and the server.
 *
 * - **Wire value** (`WireValue`): JSON-safe canonical form of a stored value
 *   — trimmed string, number, boolean, `YYYY-MM-DD` date, `{ date, precision }`
 *   or `null`. The form remembers the wire value shown at opening (`from`);
 *   the server compares it with the current wire value to detect conflicts.
 * - **Form value** (`FormValue`): what the inputs hold — strings (French
 *   numbers, `YYYY-MM-DD`, "true"/"false"/"") or `{ date, precision }`.
 */
import { toIsoDate, toDateOnly } from "../dates";
import type { DatePrecision } from "../enums";
import type { FieldDefinition } from "./types";

/** A date with its precision, on the wire. */
export interface WireDate {
  date: string;
  precision: DatePrecision;
}

/** Canonical JSON value of a field. */
export type WireValue = string | number | boolean | WireDate | null;

/** Value held by a form input. */
export type FormValue = string | { date: string; precision: string };

/** Typed value written to the database. */
export type DbValue = string | number | boolean | Date | { date: Date; precision: DatePrecision } | null;

const PRECISIONS: readonly string[] = ["day", "month", "year"];

function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    const n = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Canonical wire value of a stored value.
 * @param def - Field definition.
 * @param stored - Value read from the database (Decimal-like accepted).
 * @param precision - For `dateWithPrecision`: the stored precision.
 */
export function toWire(def: Pick<FieldDefinition, "type">, stored: unknown, precision?: unknown): WireValue {
  if (stored === null || stored === undefined) return null;
  switch (def.type) {
    case "date": {
      return toIsoDate(stored as Date);
    }
    case "dateWithPrecision": {
      const date = toIsoDate(stored as Date);
      if (!date) return null;
      return { date, precision: PRECISIONS.includes(String(precision)) ? (precision as DatePrecision) : "day" };
    }
    case "boolean":
      return typeof stored === "boolean" ? stored : null;
    case "area":
    case "money":
    case "moneyPerSqm":
    case "number":
    case "integer":
    case "months":
      return numberOf(stored);
    default: {
      const text = String(stored).trim();
      return text === "" ? null : text;
    }
  }
}

/** Typed database value of a wire value (dates as 00:00 UTC). */
export function fromWire(def: Pick<FieldDefinition, "type">, wire: WireValue): DbValue {
  if (wire === null) return null;
  if (def.type === "date") return toDateOnly(wire as string);
  if (def.type === "dateWithPrecision" && typeof wire === "object") {
    const date = toDateOnly(wire.date);
    return date ? { date, precision: wire.precision } : null;
  }
  return wire as string | number | boolean;
}

/** Equality of two wire values (dates by calendar day and precision). */
export function wireEquals(a: WireValue, b: WireValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === "object" && typeof b === "object") return a.date === b.date && a.precision === b.precision;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return false;
}

/** French number as typed by a user (decimal comma, no grouping). */
function frenchNumber(n: number): string {
  return String(n).replace(".", ",");
}

/**
 * Initial form value of a wire value.
 * @param def - Field definition.
 * @param wire - Current value.
 */
export function wireToForm(def: Pick<FieldDefinition, "type">, wire: WireValue): FormValue {
  if (def.type === "dateWithPrecision") return wire && typeof wire === "object" ? { date: wire.date, precision: wire.precision } : { date: "", precision: "day" };
  if (wire === null) return "";
  if (typeof wire === "boolean") return wire ? "true" : "false";
  if (typeof wire === "number") return frenchNumber(wire);
  return typeof wire === "string" ? wire : wire.date;
}
