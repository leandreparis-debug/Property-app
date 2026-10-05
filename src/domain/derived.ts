/**
 * Derived values. They are NEVER stored: they are computed on read from the
 * stored facts, so they can never drift. All functions are pure and accept
 * Prisma `Decimal` values as well as plain numbers.
 */
import { addMonths, toDateOnly, type DateOnlyInput } from "./dates";
import { getMetric, type MetricCode } from "./metrics";

/** A numeric value as stored or read: number, Prisma `Decimal`, numeric string, or missing. */
export type NumericLike = number | string | { toNumber(): number } | null | undefined;

/**
 * Converts a {@link NumericLike} to a finite number.
 * @param value - Number, Decimal or numeric string.
 * @returns The number, or `null` if missing or not finite.
 */
export function toNumber(value: NumericLike): number | null {
  if (value === null || value === undefined) return null;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") n = value.trim() === "" ? Number.NaN : Number(value);
  else if (typeof value === "object" && typeof value.toNumber === "function") n = value.toNumber();
  else return null;
  return Number.isFinite(n) ? n : null;
}

/** Surfaces used by the derived computations (subset of `SiteTechnical`). */
export interface AreaFields {
  surveyedTotalArea?: NumericLike;
  totalWarehouseArea?: NumericLike;
  socialOfficeArea?: NumericLike;
}

function positive(value: NumericLike): number | null {
  const n = toNumber(value);
  return n !== null && n > 0 ? n : null;
}

/**
 * Reference area of a site (m²): the surveyor's total area if known,
 * otherwise the total warehouse area. Zero or negative areas count as unknown.
 * @param technical - Technical record (may be missing).
 * @returns The area in m², or `null`.
 */
export function referenceArea(technical: AreaFields | null | undefined): number | null {
  if (!technical) return null;
  return positive(technical.surveyedTotalArea) ?? positive(technical.totalWarehouseArea);
}

/**
 * Value per m².
 * @param value - Amount or quantity.
 * @param area - Area in m².
 * @returns `value / area`, or `null` if either is missing or the area is ≤ 0.
 */
export function perSqm(value: NumericLike, area: NumericLike): number | null {
  const v = toNumber(value);
  const a = positive(area);
  return v === null || a === null ? null : v / a;
}

/**
 * Year-over-year variation in percentage points (3.2 = +3.2 %), consistent
 * with `formatPercent`.
 * @param current - Value of year N.
 * @param previous - Value of year N-1.
 * @returns The variation, or `null` if a value is missing or `previous` is 0.
 */
export function yearOverYear(current: NumericLike, previous: NumericLike): number | null {
  const c = toNumber(current);
  const p = toNumber(previous);
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

/**
 * Share of office and social premises (BLS) in the reference area, in
 * percentage points (12.5 = 12.5 %). Replaces « M² BUREAUX/M²TOTAL ».
 * @param technical - Technical record.
 * @returns The ratio, or `null` if the office or reference area is unknown.
 */
export function officeRatio(technical: AreaFields | null | undefined): number | null {
  if (!technical) return null;
  const office = toNumber(technical.socialOfficeArea);
  const ratio = perSqm(office, referenceArea(technical));
  return ratio === null ? null : ratio * 100;
}

/** Number of months before the notice date when the arbitration is due. */
export const ARBITRATION_LEAD_MONTHS = 6;

/** Lease fields used to compute the arbitration date. */
export interface ArbitrationFields {
  noticeDate?: DateOnlyInput;
  nextExitDate?: DateOnlyInput;
  noticePeriodMonths?: number | null;
}

/**
 * Arbitration date for the next contractual exit (« 6 mois avant »):
 * - `noticeDate − 6 months` when the notice date is known;
 * - otherwise `nextExitDate − noticePeriodMonths − 6 months`;
 * - otherwise `null`.
 * @param lease - Lease (may be missing).
 * @returns A business date (00:00 UTC), or `null` if data is insufficient.
 */
export function arbitrationDate(lease: ArbitrationFields | null | undefined): Date | null {
  if (!lease) return null;
  const notice = toDateOnly(lease.noticeDate);
  if (notice) return addMonths(notice, -ARBITRATION_LEAD_MONTHS);

  const exit = toDateOnly(lease.nextExitDate);
  const period = lease.noticePeriodMonths;
  if (exit && typeof period === "number" && Number.isInteger(period) && period >= 0) {
    return addMonths(exit, -(period + ARBITRATION_LEAD_MONTHS));
  }
  return null;
}

/** A stored yearly metric value (subset of `AnnualMetric`). */
export interface MetricRow {
  year: number;
  metric: string;
  value: NumericLike;
}

/** One point of a metric series. */
export interface MetricSeriesPoint {
  year: number;
  /** Stored value (`null` if the row exists without a value). */
  value: number | null;
  /** Value per m² of reference area, `null` when not relevant or unknown. */
  perSqm: number | null;
  /** Variation vs. year N-1 in percentage points; `null` if N-1 is missing. */
  yearOverYear: number | null;
}

/**
 * Series of a metric sorted by year, with per-m² values and N-1 evolutions.
 * The evolution always compares with the calendar year N-1: when a year is
 * missing (non-contiguous series), the following year has no evolution.
 *
 * @param metrics - Rows of one site (any metrics; filtered on `code`).
 * @param code - Metric code.
 * @param area - Reference area (m²), used when the metric is per-m² relevant.
 * @returns The series, ascending by year.
 */
export function metricSeries(
  metrics: readonly MetricRow[],
  code: MetricCode,
  area?: NumericLike,
): MetricSeriesPoint[] {
  const definition = getMetric(code);
  const byYear = new Map<number, number | null>();
  for (const row of metrics) {
    if (row.metric === code) byYear.set(row.year, toNumber(row.value));
  }
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const value = byYear.get(year) ?? null;
      return {
        year,
        value,
        perSqm: definition.perSqmRelevant ? perSqm(value, area) : null,
        yearOverYear: yearOverYear(value, byYear.get(year - 1)),
      };
    });
}
