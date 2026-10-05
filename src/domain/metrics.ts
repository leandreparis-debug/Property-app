/**
 * Catalogue of yearly metrics stored in `annual_metrics`. Replaces the
 * spreadsheet's « XXX 2021 … 2026 » columns (one row per site, year, metric).
 * Per-m² values and year-over-year evolutions are computed, never stored.
 */
import { z } from "zod";

/** Business domain of a metric. */
export type MetricDomain = "FINANCIAL" | "ENERGY" | "ACTIVITY";

/** Unit of a metric value. */
export type MetricUnit = "€" | "kWh" | "m³" | "ETP" | "colis";

/** Definition of a catalogued metric. */
export interface MetricDefinition {
  /** Stable code stored in `annual_metrics.metric`. */
  readonly code: string;
  readonly domain: MetricDomain;
  readonly unit: MetricUnit;
  /** French label. */
  readonly labelFr: string;
  /**
   * Financial data (hidden without `finance:read`, editable only with it).
   * Defaults to `domain === "FINANCIAL"`.
   */
  readonly financial?: boolean;
  /** Whether a per-m² value is meaningful (computed with the reference area). */
  readonly perSqmRelevant: boolean;
  /** Spreadsheet columns feeding the metric (documentation and import). */
  readonly sourceColumns: readonly string[];
  /** Remark shown in documentation (e.g. unit to confirm). */
  readonly note?: string;
}

const years = (prefix: string, from: number, to: number, suffix = "") =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}${suffix}`);

/** Every catalogued metric, in display order. */
export const METRICS = [
  { code: "RENT", domain: "FINANCIAL", unit: "€", labelFr: "Loyer", perSqmRelevant: true, sourceColumns: years("LOYER ", 2022, 2026) },
  { code: "RENT_COLLECTED", domain: "FINANCIAL", unit: "€", labelFr: "Loyer perçu", perSqmRelevant: true, sourceColumns: ["LOYER PERCU 2026"] },
  { code: "CHARGES", domain: "FINANCIAL", unit: "€", labelFr: "Charges", perSqmRelevant: true, sourceColumns: ["CHARGES 2021", "CHARGES 2022", "CHARGES 2023", "CHARGES 2024", "CHARGES 2026"] },
  { code: "CHARGES_PROVISION", domain: "FINANCIAL", unit: "€", labelFr: "Provisions sur charges", perSqmRelevant: true, sourceColumns: ["PROVISIONS CHARGES 2024"] },
  { code: "INSURANCE", domain: "FINANCIAL", unit: "€", labelFr: "Assurances", perSqmRelevant: true, sourceColumns: ["ASSURANCES 2021", "ASSURANCES 2022", "ASSURANCES 2023", "ASSURANCES 2024", "ASSURANCES 2026"] },
  { code: "PROPERTY_TAX", domain: "FINANCIAL", unit: "€", labelFr: "Taxe foncière", perSqmRelevant: true, sourceColumns: years("TF ", 2021, 2024) },
  { code: "TAXES_TOTAL", domain: "FINANCIAL", unit: "€", labelFr: "Taxes (total)", perSqmRelevant: true, sourceColumns: ["TAXES 2026"] },
  { code: "OFFICE_TAX", domain: "FINANCIAL", unit: "€", labelFr: "Taxe sur les bureaux (IDF)", perSqmRelevant: true, sourceColumns: ["TAXE BUREAU IDF 2021", "TAXE BUREAU IDF 2022", "TAXE BUREAU 2023", "TAXE BUREAU 2024"] },
  { code: "PARKING_TAX", domain: "FINANCIAL", unit: "€", labelFr: "Taxe sur les parkings", perSqmRelevant: true, sourceColumns: ["TAXE PARKING 2024"] },
  { code: "ELECTRICITY", domain: "ENERGY", unit: "kWh", labelFr: "Consommation d'électricité", perSqmRelevant: true, sourceColumns: years("", 2020, 2023, " CONSO ELEC EN KWH") },
  { code: "GAS", domain: "ENERGY", unit: "kWh", labelFr: "Consommation de gaz", perSqmRelevant: true, sourceColumns: years("", 2020, 2023, " CONSO GAZ EN KWH") },
  { code: "WATER", domain: "ENERGY", unit: "m³", labelFr: "Consommation d'eau", perSqmRelevant: true, sourceColumns: ["2022 EAU", "2023 EAU"], note: "Unité à confirmer (m³ supposé)." },
  { code: "HEADCOUNT_FTE", domain: "ACTIVITY", unit: "ETP", labelFr: "Effectif moyen", perSqmRelevant: false, sourceColumns: ["ETP MOYEN"], note: "Colonne sans année : rattachée à l'année courante par l'import." },
  { code: "MERCHANDISE_REVENUE", domain: "ACTIVITY", unit: "€", labelFr: "Chiffre d'affaires marchandise", financial: true, perSqmRelevant: false, sourceColumns: ["CA MARCHANDISE"], note: "Colonne sans année : rattachée à l'année courante par l'import." },
  { code: "PARCELS", domain: "ACTIVITY", unit: "colis", labelFr: "Colis annuels", perSqmRelevant: false, sourceColumns: ["NOMBRE DE COLIS ANNUEL"], note: "Colonne sans année : rattachée à l'année courante par l'import." },
] as const satisfies readonly MetricDefinition[];

/** Code of a catalogued metric. */
export type MetricCode = (typeof METRICS)[number]["code"];

/** All metric codes, in display order. */
export const METRIC_CODES = METRICS.map((m) => m.code) as [MetricCode, ...MetricCode[]];

/** zod schema accepting a catalogued metric code. */
export const metricCodeSchema = z.enum(METRIC_CODES);

const BY_CODE: ReadonlyMap<string, MetricDefinition> = new Map(METRICS.map((m) => [m.code, m]));

/**
 * Type guard for untrusted metric codes.
 * @param value - Any value.
 */
export function isMetricCode(value: unknown): value is MetricCode {
  return typeof value === "string" && BY_CODE.has(value);
}

/**
 * Definition of a metric.
 * @param code - Metric code.
 * @returns The definition (throws on an unknown code, which is a programming error).
 */
export function getMetric(code: MetricCode): MetricDefinition {
  const metric = BY_CODE.get(code);
  if (!metric) throw new Error(`Indicateur inconnu : ${code}`);
  return metric;
}

/**
 * Whether a metric is financial data (`finance:read` required to read or edit it).
 * Unknown codes count as financial (safe default).
 * @param code - Metric code.
 */
export function isFinancialMetric(code: string): boolean {
  const metric = BY_CODE.get(code);
  return metric ? (metric.financial ?? metric.domain === "FINANCIAL") : true;
}

/**
 * Metrics of a domain, in display order.
 * @param domain - Business domain.
 */
export function metricsByDomain(domain: MetricDomain): MetricDefinition[] {
  return METRICS.filter((m) => m.domain === domain);
}

/**
 * Largest absolute value an `annual_metrics.value` (DECIMAL(18,4)) can hold
 * and still be read back exactly.
 *
 * The SQL Server driver (tedious, under @prisma/adapter-mssql) returns
 * DECIMAL columns as JavaScript numbers (IEEE-754 doubles), which are exact to
 * 15 significant digits only. With 4 decimals, that means |value| < 10¹¹.
 * Values are always *stored* exactly; the limit applies when reading.
 */
export const METRIC_VALUE_MAX_ABS = 1e11;

/**
 * zod schema for a metric value: finite, |value| < 10¹¹, at most 4 decimals.
 * Used by the import (step 4) and the edit forms (step 9) to reject values
 * that would lose precision instead of silently rounding them.
 */
export const metricValueSchema = z
  .number()
  .finite()
  .refine((v) => Math.abs(v) < METRIC_VALUE_MAX_ABS, {
    error: "Valeur trop grande : 100 milliards maximum (limite de précision du pilote SQL Server).",
  })
  .refine((v) => decimalPlaces(v) <= 4, { error: "4 décimales au maximum." });

/** Number of decimals in the shortest representation of `v` (exponent notation counts as many). */
function decimalPlaces(v: number): number {
  const text = String(Math.abs(v));
  if (text.includes("e")) return Number.POSITIVE_INFINITY;
  return text.split(".")[1]?.length ?? 0;
}
