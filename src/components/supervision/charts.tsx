"use client";

import type { SupervisionStats } from "@/domain/supervision";
import { DEADLINE_LABELS, type DeadlineBucket } from "@/domain/site-index";
import { STATUS_META, STATUSES_BY_SEVERITY, type ComplianceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Hand-written charts of the supervision (HTML/CSS). Status colors are used
 * ONLY for status distributions, always with a label or a legend; every
 * other chart uses neutral tokens (and accent for the selection).
 */

/** Stacked bar of the status shares, with its legend. */
export function StatusStackedBar({ shares }: { shares: SupervisionStats["shares"] }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={shares.map((s) => `${STATUS_META[s.status].label} ${s.pct} %`).join(", ")}>
        {shares.filter((s) => s.count > 0).map((s) => (
          <div key={s.status} className={cn(STATUS_META[s.status].bgClass, s.status === "ok" && "opacity-70")} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {shares.map((s) => (
          <li key={s.status} className="flex items-center gap-2" data-status={s.status}>
            <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_META[s.status].bgClass)} aria-hidden="true" />
            <span className="text-text-muted">{STATUS_META[s.status].label}</span>
            <span className="numeric ml-auto text-text" data-slot="share-count">
              {s.count}
            </span>
            <span className="numeric w-11 text-right text-text-muted">{s.pct} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal stacked bars per region (click = region filter). */
export function RegionBars({ regions, selected, onSelect }: { regions: SupervisionStats["regions"]; selected: readonly string[]; onSelect: (region: string) => void }) {
  const max = Math.max(1, ...regions.map((r) => r.total));
  return (
    <ul className="flex flex-col gap-1" data-slot="region-bars">
      {regions.map((r) => {
        const active = selected.includes(r.region);
        return (
          <li key={r.region}>
            <button
              type="button"
              onClick={() => onSelect(r.region)}
              aria-pressed={active}
              aria-label={`Filtrer la région ${r.region} : ${r.total} sites, dont ${r.counts.critical} critiques et ${r.counts.warning} à surveiller`}
              className={cn(
                "grid w-full grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 rounded-sm px-1.5 py-1 text-left text-sm outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent",
                active && "bg-accent/10 ring-1 ring-accent/60",
              )}
            >
              <span className="truncate text-text-muted">{r.region}</span>
              <span className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" style={{ width: `${(r.total / max) * 100}%` }} aria-hidden="true">
                {STATUSES_BY_SEVERITY.filter((s) => r.counts[s] > 0).map((s: ComplianceStatus) => (
                  <span key={s} className={cn(STATUS_META[s].bgClass, s === "ok" && "opacity-70")} style={{ width: `${(r.counts[s] / r.total) * 100}%` }} />
                ))}
              </span>
              <span className="numeric text-right text-text">{r.total}</span>
            </button>
          </li>
        );
      })}
      {regions.length === 0 && <li className="text-sm text-text-subtle">Aucun site</li>}
    </ul>
  );
}

/** Buckets shown by the histogram (in urgency order). */
const HISTOGRAM_BUCKETS: readonly DeadlineBucket[] = ["overdue", "lt3m", "lt6m", "lt12m", "gt12m", "renewed", "unknown"];

/**
 * Histogram of the lease deadline buckets: neutral bars (surface-3), the
 * « Arbitrage dépassé » bar in status-critical (with its label). Click = filter.
 */
export function DeadlineHistogram({ deadlines, selected, onSelect }: { deadlines: SupervisionStats["deadlines"]; selected: readonly string[]; onSelect: (bucket: DeadlineBucket) => void }) {
  const counts = new Map(deadlines.map((d) => [d.bucket, d.count]));
  const max = Math.max(1, ...deadlines.map((d) => d.count));
  return (
    <div className="grid h-full grid-cols-7 items-end gap-2" data-slot="deadline-histogram">
      {HISTOGRAM_BUCKETS.map((b) => {
        const count = counts.get(b) ?? 0;
        const active = selected.includes(b);
        return (
          <button
            key={b}
            type="button"
            onClick={() => onSelect(b)}
            aria-pressed={active}
            aria-label={`Filtrer l'échéance ${DEADLINE_LABELS[b]} : ${count} sites`}
            className={cn("flex h-full flex-col items-stretch justify-end gap-1.5 rounded-sm px-1 pb-1 outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent", active && "bg-accent/10 ring-1 ring-accent/60")}
          >
            <span className="numeric text-center text-sm text-text">{count}</span>
            <span className={cn("block rounded-t-sm", b === "overdue" ? "bg-status-critical" : "bg-surface-3", active && b !== "overdue" && "bg-accent/70")} style={{ height: `${Math.max(2, (count / max) * 100)}%` }} aria-hidden="true" />
            <span className="text-center text-[11px] leading-tight text-text-muted">{DEADLINE_LABELS[b]}</span>
          </button>
        );
      })}
    </div>
  );
}
