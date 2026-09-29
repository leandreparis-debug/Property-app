/**
 * Occupancy cost of a site, per year: rent + charges + property tax + office
 * and parking taxes + insurance. Computed on read, never stored. A year is
 * computed only when its rent is known; missing components make it partial.
 */
import { perSqm, toNumber, type MetricRow, type NumericLike } from "../derived";
import { getMetric, type MetricCode } from "../metrics";

/** Components of the occupancy cost, in display order (rent first). */
export const OCCUPANCY_COST_COMPONENTS = ["RENT", "CHARGES", "PROPERTY_TAX", "OFFICE_TAX", "PARKING_TAX", "INSURANCE"] as const satisfies readonly MetricCode[];

/** A component of the occupancy cost. */
export type OccupancyCostComponent = (typeof OCCUPANCY_COST_COMPONENTS)[number];

/** Occupancy cost of one year. */
export interface OccupancyCostYear {
  year: number;
  /** Sum of the known components (€). */
  total: number;
  /** Total per m² of reference area, or `null` when the area is unknown. */
  perSqm: number | null;
  /** Every component with its value (`null` when not filled). */
  components: { code: OccupancyCostComponent; labelFr: string; value: number | null }[];
  /** French labels of the missing components (lower case), e.g. « charges ». */
  missing: string[];
  /** Whether at least one component is missing. */
  partial: boolean;
}

/**
 * Occupancy cost per year, ascending. Years without a known rent are skipped.
 * @param metrics - Yearly metric rows of the site.
 * @param area - Reference area (m²).
 */
export function occupancyCostSeries(metrics: readonly MetricRow[], area: NumericLike): OccupancyCostYear[] {
  const values = new Map<string, number | null>();
  const rentYears = new Set<number>();
  for (const row of metrics) {
    if (!(OCCUPANCY_COST_COMPONENTS as readonly string[]).includes(row.metric)) continue;
    const value = toNumber(row.value);
    values.set(`${row.metric}|${row.year}`, value);
    if (row.metric === "RENT" && value !== null) rentYears.add(row.year);
  }
  return [...rentYears]
    .sort((a, b) => a - b)
    .map((year) => {
      const components = OCCUPANCY_COST_COMPONENTS.map((code) => ({ code, labelFr: getMetric(code).labelFr, value: values.get(`${code}|${year}`) ?? null }));
      const total = components.reduce((sum, c) => sum + (c.value ?? 0), 0);
      const missing = components.filter((c) => c.value === null).map((c) => c.labelFr.charAt(0).toLowerCase() + c.labelFr.slice(1));
      return { year, total, perSqm: perSqm(total, area), components, missing, partial: missing.length > 0 };
    });
}

const PLURAL_LABELS: ReadonlySet<string> = new Set(["charges", "assurances"]);

/**
 * Mention shown next to a partial year: « partiel : charges non renseignées ».
 * @param year - Occupancy cost of one year.
 * @returns The mention, or `null` for a complete year.
 */
export function partialMention(year: Pick<OccupancyCostYear, "missing">): string | null {
  if (year.missing.length === 0) return null;
  const list = year.missing.length === 1 ? year.missing[0] : `${year.missing.slice(0, -1).join(", ")} et ${year.missing.at(-1)}`;
  // Every component but the rent (never missing) is feminine: « taxe foncière », « charges », « assurances ».
  const plural = year.missing.length > 1 || PLURAL_LABELS.has(year.missing[0] ?? "");
  const agreement = plural ? "non renseignées" : "non renseignée";
  return `partiel : ${list} ${agreement}`;
}
