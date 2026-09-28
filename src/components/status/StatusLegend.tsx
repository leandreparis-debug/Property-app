import { STATUS_META, STATUSES_BY_SEVERITY } from "@/lib/status";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

/** Props of {@link StatusLegend}. */
export interface StatusLegendProps {
  /** Layout: stacked (default) or on a single line. */
  orientation?: "vertical" | "horizontal";
  /** Extra classes. */
  className?: string;
}

/** Compact legend of the four compliance statuses, most severe first. */
export function StatusLegend({ orientation = "vertical", className }: StatusLegendProps) {
  return (
    <ul
      aria-label="Légende des statuts de conformité"
      data-slot="status-legend"
      className={cn(
        "flex text-xs text-text-muted",
        orientation === "vertical" ? "flex-col gap-2" : "flex-row flex-wrap gap-x-4 gap-y-2",
        className,
      )}
    >
      {STATUSES_BY_SEVERITY.map((status) => (
        <li key={status} data-status={status} className="flex items-center gap-2">
          <StatusDot status={status} size="sm" />
          <span>{STATUS_META[status].label}</span>
        </li>
      ))}
    </ul>
  );
}
