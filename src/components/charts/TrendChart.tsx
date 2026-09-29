import { useId } from "react";
import { cn } from "@/lib/utils";
import { DataTableToggle } from "./DataTableToggle";
import { linearScale, niceTicks } from "./scale";

/** One point of a series (`null`: the year exists but has no value). */
export interface TrendPoint {
  year: number;
  value: number | null;
}

/** One series of a {@link TrendChart}. */
export interface TrendSeries {
  id: string;
  label: string;
  /** `accent` for the main series, `neutral` for the others (never a status color). */
  tone: "accent" | "neutral";
  points: readonly TrendPoint[];
}

/** Props of {@link TrendChart}. */
export interface TrendChartProps {
  /** Title (visible, names the figure and the data table). */
  title: string;
  series: readonly TrendSeries[];
  /** Formats a value for the hover labels and the table. */
  format: (value: number) => string;
  /** Formats the axis graduations (defaults to `format`). */
  axisFormat?: (value: number) => string;
  /** Extra classes on the figure. */
  className?: string;
}

const W = 880;
const H = 260;
const M = { top: 16, right: 16, bottom: 28, left: 72 };

const TONE: Record<TrendSeries["tone"], { stroke: string; dash?: string }> = {
  accent: { stroke: "var(--color-accent)" },
  neutral: { stroke: "var(--color-text-muted)", dash: "5 4" },
};

/** Consecutive runs of known values (a missing year breaks the line: no interpolation). */
function runs(points: readonly TrendPoint[]): TrendPoint[][] {
  const byYear = new Map(points.map((p) => [p.year, p.value]));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const out: TrendPoint[][] = [];
  let current: TrendPoint[] = [];
  let previous: number | null = null;
  for (const year of years) {
    const value = byYear.get(year) ?? null;
    if (value === null || (previous !== null && year !== previous + 1)) {
      if (current.length) out.push(current);
      current = [];
    }
    if (value !== null) current.push({ year, value });
    previous = year;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Hand-written SVG line chart over years: points, year axis, graduations,
 * values on hover (CSS only), legend, and a data table behind « Voir les
 * données » (always available to screen readers, printed in full). Missing
 * years are never interpolated. Renders on the server.
 */
export function TrendChart({ title, series, format, axisFormat = format, className }: TrendChartProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const tableId = `${id}-data`;
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);
  const values = series.flatMap((s) => s.points.flatMap((p) => (p.value === null ? [] : [p.value])));

  if (years.length === 0 || values.length === 0) {
    return (
      <figure className={cn("rounded-md border border-border bg-surface-1 p-4", className)} aria-labelledby={titleId}>
        <figcaption id={titleId} className="text-sm font-semibold">
          {title}
        </figcaption>
        <p className="mt-2 text-sm text-text-muted">Aucune valeur renseignée.</p>
      </figure>
    );
  }

  const firstYear = years[0]!;
  const lastYear = years.at(-1)!;
  // Every calendar year between the first and the last one gets a tick, so gaps are visible.
  const axisYears = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values));
  const x = linearScale([firstYear - 0.5, lastYear + 0.5], [M.left, W - M.right]);
  const y = linearScale([ticks[0]!, ticks.at(-1)!], [H - M.bottom, M.top]);
  const band = (W - M.left - M.right) / axisYears.length;

  return (
    <figure data-slot="trend-chart" className={cn("rounded-md border border-border bg-surface-1 p-4", className)} aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption id={titleId} className="text-sm font-semibold">
          {title}
        </figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted" aria-label="Légende">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" stroke={TONE[s.tone].stroke} strokeWidth="2" strokeDasharray={TONE[s.tone].dash} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full overflow-visible" role="img" aria-labelledby={titleId}>
        {/* Graduations */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth="1" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="numeric fill-text-muted text-[11px]">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {/* Year axis */}
        {axisYears.map((year) => (
          <text key={year} x={x(year)} y={H - 8} textAnchor="middle" className="numeric fill-text-muted text-[11px]">
            {year}
          </text>
        ))}
        {/* Lines (one path per run of consecutive years) and points */}
        {series.map((s) =>
          runs(s.points).map((run) => (
            <g key={`${s.id}-${run[0]!.year}`}>
              {run.length > 1 && (
                <polyline
                  points={run.map((p) => `${x(p.year)},${y(p.value!)}`).join(" ")}
                  fill="none"
                  stroke={TONE[s.tone].stroke}
                  strokeWidth="2"
                  strokeDasharray={TONE[s.tone].dash}
                  strokeLinejoin="round"
                />
              )}
              {run.map((p) => (
                <circle key={p.year} cx={x(p.year)} cy={y(p.value!)} r="3.5" fill="var(--color-surface-1)" stroke={TONE[s.tone].stroke} strokeWidth="2" />
              ))}
            </g>
          )),
        )}
        {/* Hover: one band per year reveals its values */}
        {axisYears.map((year) => {
          const known = series.flatMap((s) => {
            const v = s.points.find((p) => p.year === year)?.value;
            return v === null || v === undefined ? [] : [{ s, v }];
          });
          const labelX = Math.min(Math.max(x(year), M.left + 70), W - M.right - 70);
          return (
            <g key={year} className="group/year" data-year={year}>
              <rect x={x(year) - band / 2} y={M.top} width={band} height={H - M.top - M.bottom} fill="transparent" />
              <line x1={x(year)} x2={x(year)} y1={M.top} y2={H - M.bottom} stroke="var(--color-border-strong)" className="opacity-0 group-hover/year:opacity-100" />
              {known.length > 0 && (
                <g className="pointer-events-none opacity-0 group-hover/year:opacity-100">
                  <rect x={labelX - 70} y={M.top - 4} width="140" height={16 + known.length * 16} rx="4" fill="var(--color-surface-3)" stroke="var(--color-border-strong)" />
                  <text x={labelX} y={M.top + 9} textAnchor="middle" className="numeric fill-text text-[11px] font-semibold">
                    {year}
                  </text>
                  {known.map(({ s, v }, i) => (
                    <text key={s.id} x={labelX} y={M.top + 25 + i * 16} textAnchor="middle" className="numeric fill-text text-[11px]">
                      {format(v)}
                    </text>
                  ))}
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <DataTableToggle tableId={tableId}>
        <table id={tableId} className="w-full text-sm">
          <caption className="sr-only">{title} — données</caption>
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Année
              </th>
              {series.map((s) => (
                <th key={s.id} scope="col" className="py-1 pr-4 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year} className="border-t border-border">
                <th scope="row" className="numeric py-1 pr-4 text-left font-normal">
                  {year}
                </th>
                {series.map((s) => {
                  const v = s.points.find((p) => p.year === year)?.value;
                  return (
                    <td key={s.id} className="numeric py-1 pr-4 text-right">
                      {v === null || v === undefined ? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Non renseigné</span>
                        </>
                      ) : (
                        format(v)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableToggle>
    </figure>
  );
}
