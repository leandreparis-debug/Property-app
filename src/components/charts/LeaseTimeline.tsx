import { CalendarClock } from "lucide-react";
import { useId } from "react";
import { EmptyState } from "@/components/empty/EmptyState";
import { timelineRange, type LeaseMilestone } from "@/domain/site-sheet/lease-timeline";
import { formatDate } from "@/lib/format";
import { STATUS_META, type ComplianceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { linearScale } from "./scale";

/** Props of {@link LeaseTimeline}. */
export interface LeaseTimelineProps {
  milestones: readonly LeaseMilestone[];
  today: Date;
  /** Status of the site: outlines the arbitration milestone when a lease rule is triggered. */
  status: ComplianceStatus;
  /** `compact` (overview) or `large` (Lease tab). */
  size?: "compact" | "large";
  className?: string;
}

const shortDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);

/**
 * Lease timeline (hand-written SVG): milestones on a time axis, « Aujourd'hui »
 * in the accent color, past milestones dimmed, the arbitration outlined with
 * the status color ONLY when a lease rule is triggered. Missing milestones
 * are omitted; without any milestone, a compact empty state. The milestones
 * are also listed as text for screen readers and print.
 */
export function LeaseTimeline({ milestones, today, status, size = "compact", className }: LeaseTimelineProps) {
  const id = useId();
  const range = timelineRange(milestones, today);
  if (!range) {
    return (
      <EmptyState
        icon={CalendarClock}
        headingLevel="h3"
        title="Aucune date de bail renseignée"
        description="La frise s'affichera dès qu'une date du bail sera connue."
        className="py-4"
      />
    );
  }

  const large = size === "large";
  // Wide viewBox: drawn at about 1:1 in the sheet, so the text keeps its size.
  const W = 1120;
  const H = large ? 210 : 160;
  const axisY = H / 2;
  const x = linearScale(range, [24, W - 24]);
  const firstYear = new Date(range[0]).getUTCFullYear() + 1;
  const lastYear = new Date(range[1]).getUTCFullYear();
  const step = Math.max(1, Math.ceil((lastYear - firstYear + 1) / (large ? 14 : 8)));
  const years = Array.from({ length: Math.max(0, Math.floor((lastYear - firstYear) / step) + 1) }, (_, i) => firstYear + i * step);
  const todayX = x(today.getTime());
  const statusColor = `var(${STATUS_META[status].token})`;
  // Four label lanes (above near / below near / above far / below far) limit overlaps.
  const lanes = large ? [-30, 30, -62, 62] : [-24, 24, -48, 48];

  return (
    <figure data-slot="lease-timeline" className={cn("w-full", className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="sr-only">
        Frise du bail
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" aria-hidden="true">
        <line x1="12" x2={W - 12} y1={axisY} y2={axisY} stroke="var(--color-border-strong)" strokeWidth="1.5" />
        {years.map((year) => {
          const yx = x(Date.UTC(year, 0, 1));
          return (
            <g key={year}>
              <line x1={yx} x2={yx} y1={axisY - 4} y2={axisY + 4} stroke="var(--color-border-strong)" />
              <text x={yx} y={H - 4} textAnchor="middle" className="numeric fill-text-muted text-[10px]">
                {year}
              </text>
            </g>
          );
        })}
        <g data-slot="timeline-today">
          <line x1={todayX} x2={todayX} y1={10} y2={H - 16} stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x={todayX} y={8} textAnchor="middle" className="fill-accent text-[10px] font-semibold">
            Aujourd&apos;hui
          </text>
        </g>
        {milestones.map((m, i) => {
          const mx = x(m.date.getTime());
          const offset = lanes[i % lanes.length]!;
          const labelY = axisY + offset;
          const anchor = mx < 90 ? "start" : mx > W - 90 ? "end" : "middle";
          return (
            <g key={m.id} data-milestone={m.id} data-past={m.past || undefined} data-flagged={m.flagged || undefined} opacity={m.past ? 0.45 : 1}>
              <line x1={mx} x2={mx} y1={axisY} y2={labelY + (offset < 0 ? 6 : -14)} stroke="var(--color-border-strong)" />
              {m.flagged && <circle cx={mx} cy={axisY} r="9" fill="none" stroke={statusColor} strokeWidth="2.5" />}
              <circle cx={mx} cy={axisY} r="5" fill={m.past ? "var(--color-surface-3)" : "var(--color-text)"} stroke="var(--color-surface-1)" strokeWidth="1.5" />
              <text x={mx} y={labelY - (offset < 0 ? 10 : 0)} textAnchor={anchor} className="fill-text text-[11px] font-medium">
                {m.labelFr}
              </text>
              <text x={mx} y={labelY + (offset < 0 ? 2 : 12)} textAnchor={anchor} className="numeric fill-text-muted text-[10px]">
                {shortDate(m.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className={cn("text-sm", large ? "mt-3 grid gap-1 sm:grid-cols-2 print:grid" : "sr-only print:not-sr-only")} data-slot="timeline-list">
        {milestones.map((m) => (
          <li key={m.id} className={cn("flex gap-2", m.past && "text-text-muted")}>
            <span className="font-medium">{m.labelFr}</span>
            <span className="numeric">{formatDate(m.date)}</span>
            {m.past && <span className="text-xs text-text-muted">(passé)</span>}
            {m.flagged && <span className="text-xs">— règle de bail déclenchée ({STATUS_META[status].label.toLowerCase()})</span>}
          </li>
        ))}
      </ol>
    </figure>
  );
}
