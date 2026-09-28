import { STATUS_META, type ComplianceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Props of {@link StatusDot}. */
export interface StatusDotProps {
  /** Compliance status to represent. */
  status: ComplianceStatus;
  /** Dot diameter: `sm` 8 px, `md` 10 px (default), `lg` 12 px. */
  size?: "sm" | "md" | "lg";
  /**
   * Accessible label. When omitted the dot is decorative (`aria-hidden`) and a
   * visible label must accompany it — color is never the only signal.
   */
  label?: string;
  /** Extra classes. */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<StatusDotProps["size"]>, string> = {
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3",
};

/**
 * Colored status dot. `critical` shows a discreet pulsing halo (disabled when
 * the user prefers reduced motion); `ok` is rendered at reduced opacity.
 */
export function StatusDot({ status, size = "md", label, className }: StatusDotProps) {
  const meta = STATUS_META[status];
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true };

  return (
    <span
      data-slot="status-dot"
      data-status={status}
      className={cn("relative inline-flex shrink-0", SIZE_CLASSES[size], className)}
      {...a11y}
    >
      {status === "critical" && (
        <span
          className={cn(
            "absolute inset-0 rounded-full motion-safe:animate-status-pulse motion-reduce:hidden",
            meta.bgClass,
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex size-full rounded-full",
          meta.bgClass,
          status === "ok" && "opacity-70",
          status === "critical" && "ring-2 ring-status-critical/25",
        )}
      />
    </span>
  );
}
