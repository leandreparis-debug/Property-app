/**
 * Building works history and the estimated end of the ten-year warranty
 * (« garantie décennale »). Display only: this estimate never drives a status.
 */
import { addMonths } from "../dates";
import type { DatePrecision } from "../enums";

/** Years covered by the ten-year warranty. */
export const DECENNIAL_YEARS = 10;

/** Works kinds that open a ten-year warranty. */
const DECENNIAL_KINDS: ReadonlySet<string> = new Set(["CONSTRUCTION", "EXTENSION"]);

/** A building work (subset of `BuildingWork`). */
export interface WorkRow {
  id: string;
  kind: string;
  date: Date | null;
  datePrecision: string | null;
  description: string | null;
}

/** Estimated end of the ten-year warranty of a work. */
export interface DecennialEstimate {
  /** First day of the period in which the warranty ends. */
  endDate: Date;
  /** Same precision as the works date (a year-only date gives a year). */
  precision: DatePrecision;
}

const precisionOf = (value: string | null): DatePrecision => (value === "year" || value === "month" ? value : "day");

/** Last day of the period (year, month or day) starting at `date`. */
function periodEnd(date: Date, precision: DatePrecision): Date {
  if (precision === "year") return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
  if (precision === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return date;
}

/**
 * Estimated end of the ten-year warranty for a construction or an extension
 * less than ten years old: works date + 10 years, with the precision of the
 * works date. A work is « less than ten years old » as long as the latest
 * possible end of its warranty (end of the year or month when the date is
 * imprecise) is not before today.
 *
 * @param work - Building work.
 * @param today - Today's business date.
 * @returns The estimate, or `null` (other kind, no date, warranty over).
 */
export function decennialEstimate(work: Pick<WorkRow, "kind" | "date" | "datePrecision">, today: Date): DecennialEstimate | null {
  if (!DECENNIAL_KINDS.has(work.kind) || !work.date) return null;
  const precision = precisionOf(work.datePrecision);
  const endDate = addMonths(work.date, DECENNIAL_YEARS * 12);
  if (periodEnd(endDate, precision).getTime() < today.getTime()) return null;
  return { endDate, precision };
}

/**
 * Works in chronological order (undated works last, then by kind).
 * @param works - Works of a site.
 */
export function sortWorks<T extends Pick<WorkRow, "date" | "kind">>(works: readonly T[]): T[] {
  return [...works].sort((a, b) => {
    if (a.date && b.date) return a.date.getTime() - b.date.getTime();
    if (a.date) return -1;
    if (b.date) return 1;
    return a.kind.localeCompare(b.kind);
  });
}
