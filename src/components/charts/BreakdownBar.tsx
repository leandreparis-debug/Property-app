import { formatPercent, formatSurface } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One segment of a {@link BreakdownBar}. */
export interface BreakdownSegment {
  key: string;
  label: string;
  value: number;
  /** Share of the total, 0–1. */
  share: number;
}

/** Neutral shades, from the strongest to the lightest (never a status color). */
const SHADES = ["var(--color-text)", "var(--color-text-muted)", "var(--color-border-strong)", "var(--color-text-subtle)", "var(--color-surface-3)"];

/**
 * Horizontal breakdown bar in neutral shades, with a legend giving each
 * part's value and share. The legend is the accessible content; the bar is
 * decorative.
 */
export function BreakdownBar({ segments, title, format = formatSurface, className }: { segments: readonly BreakdownSegment[]; title: string; format?: (v: number) => string; className?: string }) {
  if (segments.length === 0) return null;
  return (
    <div data-slot="breakdown-bar" className={cn("space-y-3", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-surface-2" aria-hidden="true">
        {segments.map((s, i) => (
          <div key={s.key} style={{ width: `${s.share * 100}%`, background: SHADES[i % SHADES.length] }} className="h-full border-r border-surface-1 last:border-r-0" />
        ))}
      </div>
      <ul aria-label={title} className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {segments.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm border border-border" style={{ background: SHADES[i % SHADES.length] }} />
            <span className="text-text-muted">{s.label}</span>
            <span className="numeric ml-auto">{format(s.value)}</span>
            <span className="numeric w-14 text-right text-text-muted">{formatPercent(s.share * 100, { signed: false })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
