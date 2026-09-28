/**
 * Date-only helpers for business dates (`@db.Date` columns).
 *
 * Convention: a business date is a `Date` at **00:00:00.000 UTC** of the
 * calendar day. This is what Prisma writes to and reads from `DATE` columns,
 * and it never shifts, whatever the server or browser time zone, as long as
 * it is built with `toDateOnly()` and displayed with `formatDate()` (which
 * formats in Europe/Paris, where 00:00 UTC is always the same calendar day).
 */

/** Time zone used for « today » in business rules. */
export const BUSINESS_TIME_ZONE = "Europe/Paris";

/** Inputs accepted by {@link toDateOnly}. */
export type DateOnlyInput = Date | string | number | null | undefined;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;
const FR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function fromParts(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject overflowing dates such as 2026-02-30.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  if (year < 100) date.setUTCFullYear(year);
  return date;
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * Normalises a value to a business date (00:00 UTC of the calendar day).
 *
 * - `"YYYY-MM-DD"` (optionally followed by a time, which is ignored) and
 *   `"DD/MM/YYYY"` strings: the written calendar day, never shifted.
 * - `Date` / epoch ms already at 00:00 UTC (e.g. read from a `DATE` column):
 *   kept as is.
 * - Any other `Date` / epoch ms (e.g. built by `new Date(2026, 2, 12)`): its
 *   calendar day in the **local** time zone of the running process.
 *
 * @param value - Value to normalise.
 * @returns The business date, or `null` if missing or invalid (including
 *   impossible dates such as 30 February).
 */
export function toDateOnly(value: DateOnlyInput): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = ISO_DATE.exec(trimmed);
    if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const fr = FR_DATE.exec(trimmed);
    if (fr) return fromParts(Number(fr[3]), Number(fr[2]), Number(fr[1]));
    return null;
  }

  if (typeof value !== "number" && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isUtcMidnight(date)) return date;
  return fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Formats a business date as `YYYY-MM-DD`.
 * @param date - Business date.
 * @returns The ISO calendar date, or `null` if `date` is missing or invalid.
 */
export function toIsoDate(date: DateOnlyInput): string | null {
  const d = toDateOnly(date);
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Today's business date in {@link BUSINESS_TIME_ZONE}.
 * @param now - Reference instant (injectable for tests).
 */
export function todayDateOnly(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-CA formats as YYYY-MM-DD.
  return toDateOnly(parts) as Date;
}

/**
 * Adds (or subtracts, if negative) calendar months, clamping to the end of
 * the month: 31 January + 1 month = 28/29 February.
 * @param date - Business date.
 * @param months - Whole number of months.
 * @returns A new business date.
 */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + Math.trunc(months);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/**
 * Adds (or subtracts, if negative) whole days.
 * @param date - Business date.
 * @param days - Whole number of days.
 * @returns A new business date.
 */
export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + Math.trunc(days)));
}

/**
 * Number of whole days from `from` to `to` (negative if `to` is earlier).
 * @param from - Start business date.
 * @param to - End business date.
 */
export function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Comparator for business dates (ascending).
 * @returns A negative number if `a` is before `b`, positive if after, 0 if equal.
 */
export function compareDateOnly(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}
