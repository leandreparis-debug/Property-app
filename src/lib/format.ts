/**
 * Display formatting, French locale (fr-FR), built on `Intl`.
 *
 * Common rule: `null`, `undefined`, `NaN`, infinities and any non-numeric
 * value render as « — » (EMPTY_VALUE). Formatting never throws.
 */

const LOCALE = "fr-FR";
const TIME_ZONE = "Europe/Paris";

/** Placeholder rendered for a missing or unusable value. */
export const EMPTY_VALUE = "—";

/** Non-breaking space used between a value and its unit (fr-FR typography). */
const NBSP = " ";

/** Energy threshold (kWh) above which values switch to MWh. */
export const MWH_THRESHOLD_KWH = 10_000;

/** Values accepted by the numeric formatters. Anything else renders as « — ». */
export type NumericInput = number | null | undefined;

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalises negative zero so that « -0 » is never displayed. */
function normaliseZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** Options shared by numeric formatters. */
export interface DecimalOptions {
  /** Number of decimals to display (fixed). */
  decimals?: number;
}

/**
 * Formats a plain number with French grouping (« 12 450,5 »).
 * @param value - Number to format.
 * @param options - `decimals`: fixed number of decimals (default: up to 2, trimmed).
 * @returns The formatted string, or « — ».
 */
export function formatNumber(value: NumericInput, options: DecimalOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  const { decimals } = options;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  }).format(normaliseZero(n));
}

/**
 * Formats an amount in euros (« 1 250 000 € »).
 * @param value - Amount in euros.
 * @param options - `decimals`: number of decimals (default 0).
 * @returns The formatted string, or « — ».
 */
export function formatCurrency(value: NumericInput, options: DecimalOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  const decimals = options.decimals ?? 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(normaliseZero(n));
}

/**
 * Formats a surface area in square metres (« 12 450 m² »).
 * @param value - Area in m².
 * @param options - `decimals`: number of decimals (default 0).
 * @returns The formatted string, or « — ».
 */
export function formatSurface(value: NumericInput, options: DecimalOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  const decimals = options.decimals ?? 0;
  const formatted = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(normaliseZero(n));
  return `${formatted}${NBSP}m²`;
}

/**
 * Formats an energy quantity given in kWh. Values strictly above
 * 10 000 kWh (in absolute value) switch to MWh with one decimal
 * (« 8 500 kWh », « 12,5 MWh »).
 * @param kwh - Energy in kWh.
 * @returns The formatted string, or « — ».
 */
export function formatEnergy(kwh: NumericInput): string {
  const n = toFiniteNumber(kwh);
  if (n === null) return EMPTY_VALUE;
  if (Math.abs(n) > MWH_THRESHOLD_KWH) {
    const mwh = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n / 1000);
    return `${mwh}${NBSP}MWh`;
  }
  const value = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(
    normaliseZero(n),
  );
  return `${value}${NBSP}kWh`;
}

/** Options of {@link formatPercent}. */
export interface PercentOptions extends DecimalOptions {
  /** Show the sign (« +3,2 % »). Default `true`; `false` for ratios (« 12,5 % »). */
  signed?: boolean;
}

/**
 * Formats a percentage. The input is expressed in percentage points
 * (3.2 means 3.2 %): signed by default (« +3,2 % », « -1,5 % », « 0,0 % »).
 * @param value - Percentage points.
 * @param options - `decimals` (default 1), `signed` (default `true`).
 * @returns The formatted string, or « — ».
 */
export function formatPercent(value: NumericInput, options: PercentOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n === null) return EMPTY_VALUE;
  const decimals = options.decimals ?? 1;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    signDisplay: options.signed === false ? "auto" : "exceptZero",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(normaliseZero(n) / 100);
}

/** Values accepted by `formatDate`. */
export type DateInput = Date | string | number | null | undefined;

/**
 * Formats a date in long French form (« 12 mars 2026 »), Europe/Paris time zone.
 * @param value - `Date`, ISO string or epoch milliseconds.
 * @returns The formatted string, or « — » if the date is missing or invalid.
 */
export function formatDate(value: DateInput): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return EMPTY_VALUE;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "long", timeZone: TIME_ZONE }).format(date);
}

/** Precision of a business date (see `DatePrecision` in src/domain/enums.ts). */
export type DatePrecisionInput = "day" | "month" | "year" | null | undefined;

/**
 * Formats a business date according to its precision: « 2019 » (year),
 * « mars 2019 » (month), « 12 mars 2019 » (day or unknown precision).
 * A year-only date is never shown as « 1 janv. 2019 ».
 * @param value - Business date (00:00 UTC of the day).
 * @param precision - Known precision (defaults to day).
 * @returns The formatted string, or « — ».
 */
export function formatDateWithPrecision(value: DateInput, precision: DatePrecisionInput): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return EMPTY_VALUE;
  if (precision === "year") return String(date.getUTCFullYear());
  if (precision === "month") {
    return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return formatDate(date);
}
