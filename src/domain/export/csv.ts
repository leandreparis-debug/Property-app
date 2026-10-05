/**
 * CSV format of the exports (step 11), PURE:
 * UTF-8 with BOM, `;` separator, CRLF line endings, RFC 4180 quoting, ISO 8601
 * dates, decimal POINT. Formula injection is neutralised: a TEXT cell
 * starting with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed
 * with an apostrophe (numbers are written as numbers, never neutralised).
 */

/** Byte order mark: Excel then reads the file as UTF-8. */
export const CSV_BOM = "﻿";
/** Field separator (French Excel default). */
export const CSV_SEPARATOR = ";";
/** Line ending. */
export const CSV_EOL = "\r\n";

/** A business date (`@db.Date`, 00:00 UTC), written `YYYY-MM-DD`. */
export interface DateOnlyCell {
  dateOnly: Date;
}

/** A cell value. `Date` is an instant (ISO 8601 with time, UTC). */
export type CellValue = string | number | boolean | bigint | Date | DateOnlyCell | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralises a text that a spreadsheet could evaluate as a formula.
 * @param text - Cell text.
 * @returns The text, prefixed with `'` when it starts with `=`, `+`, `-`, `@`, tab or CR.
 */
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Whether a value is a business-date cell. */
export function isDateOnlyCell(value: unknown): value is DateOnlyCell {
  return typeof value === "object" && value !== null && "dateOnly" in value && (value as DateOnlyCell).dateOnly instanceof Date;
}

/**
 * Text of a cell, before quoting: numbers with a decimal point, booleans
 * `true` / `false`, instants in ISO 8601 (UTC), business dates `YYYY-MM-DD`,
 * texts neutralised. `null` / `undefined` / NaN → empty.
 */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (isDateOnlyCell(value)) return Number.isNaN(value.dateOnly.getTime()) ? "" : value.dateOnly.toISOString().slice(0, 10);
  return neutralizeFormula(value);
}

/**
 * One CSV field: {@link cellText}, quoted (RFC 4180) when it contains the
 * separator, a quote, CR or LF; inner quotes doubled.
 */
export function csvField(value: CellValue): string {
  const text = cellText(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line, CRLF included. */
export function csvLine(values: readonly CellValue[]): string {
  return values.map(csvField).join(CSV_SEPARATOR) + CSV_EOL;
}

/**
 * A whole CSV document (BOM + header + rows).
 * @param header - Column names.
 * @param rows - Rows of cells.
 */
export function toCsvDocument(header: readonly string[], rows: readonly (readonly CellValue[])[]): string {
  return CSV_BOM + csvLine(header) + rows.map(csvLine).join("");
}
