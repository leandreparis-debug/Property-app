import type { MetricSeriesPoint } from "@/domain/derived";
import type { MetricDefinition } from "@/domain/metrics";
import { OPTIONAL_MISSING_LABEL, partialMention, type OccupancyCostYear } from "@/domain/site-sheet/occupancy-cost";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyValue } from "./FieldList";
import { formatEvolution, formatMetricPerSqm, formatMetricValue } from "./metric-format";
import { InfoTooltip, WithProvenance, type ProvenanceHint } from "./values";

/** A row of the metric table. */
export interface MetricTableRow {
  metric: MetricDefinition;
  series: readonly MetricSeriesPoint[];
}

function Evolution({ value }: { value: number | null }) {
  const evolution = formatEvolution(value);
  if (!evolution) return null;
  return (
    <span className="numeric block text-[11px] text-text-muted" data-slot="evolution">
      <span aria-hidden="true">
        {evolution.arrow} {evolution.text}
      </span>
      <span className="sr-only">{evolution.label}</span>
    </span>
  );
}

/**
 * Yearly metrics: one row per metric, one column per year. Each cell gives
 * the value, the value per m² of reference area and the N-1 evolution (arrow
 * and sign, never a status color). Sticky header and first column.
 */
export function MetricTable({
  caption,
  rows,
  years,
  hintOf,
  occupancy,
}: {
  caption: string;
  rows: readonly MetricTableRow[];
  years: readonly number[];
  hintOf: (code: string, year: number) => ProvenanceHint | null;
  /** Occupancy cost line (Financial tab). */
  occupancy?: readonly OccupancyCostYear[];
}) {
  const occupancyByYear = new Map((occupancy ?? []).map((o) => [o.year, o]));
  return (
    <div className="relative max-h-[560px] overflow-auto rounded-lg border border-border print:max-h-none print:overflow-visible" data-slot="metric-table">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 left-0 z-20 border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-medium text-text-muted">
              Indicateur
            </th>
            {years.map((year) => (
              <th key={year} scope="col" className="numeric sticky top-0 z-10 border-b border-border bg-surface-2 px-3 py-2 text-right text-xs font-medium text-text-muted">
                {year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ metric, series }) => {
            const byYear = new Map(series.map((p) => [p.year, p]));
            return (
              <tr key={metric.code} data-metric={metric.code}>
                <th scope="row" className="sticky left-0 z-10 border-b border-border bg-surface-1 px-3 py-2 text-left font-normal whitespace-nowrap">
                  {metric.labelFr}
                  <span className="block text-[11px] text-text-muted">{metric.unit}</span>
                </th>
                {years.map((year) => {
                  const p = byYear.get(year);
                  return (
                    <td key={year} className="border-b border-border px-3 py-2 text-right align-top whitespace-nowrap" data-year={year}>
                      {p && p.value !== null ? (
                        <>
                          <WithProvenance hint={hintOf(metric.code, year)} className="numeric justify-end">
                            {formatMetricValue(metric.unit, p.value)}
                          </WithProvenance>
                          {metric.perSqmRelevant && p.perSqm !== null && (
                            <span className="numeric block text-[11px] text-text-muted">{formatMetricPerSqm(metric.unit, p.perSqm)}</span>
                          )}
                          <Evolution value={p.yearOverYear} />
                        </>
                      ) : (
                        <EmptyValue />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {occupancy && (
            <tr data-metric="OCCUPANCY_COST" className="font-medium">
              <th scope="row" className="sticky left-0 z-10 border-t-2 border-border-strong bg-surface-1 px-3 py-2 text-left whitespace-nowrap">
                Coût d&apos;occupation
                <span className="block text-[11px] font-normal text-text-muted">calculé, € (si le loyer est renseigné)</span>
              </th>
              {years.map((year) => {
                const o = occupancyByYear.get(year);
                const mention = o ? partialMention(o) : null;
                return (
                  <td key={year} className={cn("border-t-2 border-border-strong px-3 py-2 text-right align-top whitespace-nowrap")} data-year={year}>
                    {o ? (
                      <>
                        <InfoTooltip
                          lines={[
                            `Composition ${year} :`,
                            ...o.components.map((c) => `${c.labelFr} : ${c.value !== null ? formatCurrency(c.value) : c.optional ? OPTIONAL_MISSING_LABEL : "non renseigné"}`),
                          ]}
                        >
                          <span className="numeric">{formatCurrency(o.total)}</span>
                        </InfoTooltip>
                        {o.perSqm !== null && <span className="numeric block text-[11px] font-normal text-text-muted">{formatMetricPerSqm("€", o.perSqm)}</span>}
                        {mention && <span className="block max-w-44 text-[11px] font-normal whitespace-normal text-text-muted" data-slot="partial">{mention}</span>}
                      </>
                    ) : (
                      <EmptyValue />
                    )}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
