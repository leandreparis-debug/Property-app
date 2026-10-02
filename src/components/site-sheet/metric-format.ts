/**
 * Formatting of the yearly metrics by unit (value, value per m², evolution).
 */
import type { MetricUnit } from "@/domain/metrics";
import { EMPTY_VALUE, formatCurrency, formatEnergy, formatNumber, formatPercent } from "@/lib/format";

const NBSP = " ";

/** Formats a metric value according to its unit. */
export function formatMetricValue(unit: MetricUnit, value: number | null): string {
  if (value === null) return EMPTY_VALUE;
  switch (unit) {
    case "€":
      return formatCurrency(value);
    case "kWh":
      return formatEnergy(value);
    case "m³":
      return `${formatNumber(value)}${NBSP}m³`;
    case "ETP":
      return `${formatNumber(value, { decimals: value % 1 === 0 ? 0 : 1 })}${NBSP}ETP`;
    case "colis":
      return `${formatNumber(Math.round(value))}${NBSP}colis`;
  }
}

/** Formats a value per m² of reference area according to the metric unit. */
export function formatMetricPerSqm(unit: MetricUnit, value: number | null): string {
  if (value === null) return EMPTY_VALUE;
  switch (unit) {
    case "€":
      return `${formatCurrency(value, { decimals: 2 })}/m²`;
    case "kWh":
      return `${formatNumber(value, { decimals: 1 })}${NBSP}kWh/m²`;
    case "m³":
      return `${formatNumber(value, { decimals: 3 })}${NBSP}m³/m²`;
    default:
      return `${formatNumber(value, { decimals: 2 })}/m²`;
  }
}

/** Evolution vs. N-1: arrow and signed percentage (never a status color). */
export function formatEvolution(value: number | null): { arrow: "↑" | "↓" | "→"; text: string; label: string } | null {
  if (value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  const arrow = rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→";
  const text = formatPercent(value);
  const label = rounded > 0 ? `en hausse de ${formatPercent(value, { signed: false })} sur un an` : rounded < 0 ? `en baisse de ${formatPercent(-value, { signed: false })} sur un an` : "stable sur un an";
  return { arrow, text, label };
}

/** Compact axis label of an amount (« 1,2 M€ », « 350 k€ »). */
export function compactCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "EUR" }).format(value);
}

/** Compact axis label of a number. */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
