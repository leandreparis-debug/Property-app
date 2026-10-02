import { STATUS_META, type ComplianceStatus, type StatusEmphasis } from "@/lib/status";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

/** Props of {@link StatusBadge}. */
export interface StatusBadgeProps {
  /** Compliance status to represent. */
  status: ComplianceStatus;
  /**
   * Hide the visible label (compact tables). The label is then exposed as the
   * accessible name (`role="img"` + `aria-label`), so color is never the only
   * signal.
   */
  hideLabel?: boolean;
  /** Extra classes. */
  className?: string;
}

const EMPHASIS_CLASSES: Record<StatusEmphasis, string> = {
  subtle: "border-border bg-transparent text-text-muted",
  neutral: "border-border bg-surface-2 text-text-muted",
  elevated: "border-status-warning/35 bg-status-warning/10 text-text",
  salient: "border-status-critical/45 bg-status-critical/15 text-text font-semibold",
};

/**
 * Status pill: dot + French label, with a `data-status` attribute for styling
 * and testing. Emphasis grows with severity.
 */
export function StatusBadge({ status, hideLabel = false, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];

  if (hideLabel) {
    return (
      <span
        data-slot="status-badge"
        data-status={status}
        role="img"
        aria-label={meta.label}
        title={meta.label}
        className={cn("inline-flex items-center justify-center p-1", className)}
      >
        <StatusDot status={status} />
      </span>
    );
  }

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs leading-none font-medium whitespace-nowrap",
        EMPHASIS_CLASSES[meta.emphasis],
        className,
      )}
    >
      <StatusDot status={status} size="sm" />
      <span>{meta.label}</span>
    </span>
  );
}
