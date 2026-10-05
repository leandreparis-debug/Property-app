import { CircleCheck, CircleX, LoaderCircle, MinusCircle } from "lucide-react";
import { JobStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

/** Props of {@link JobStatusLabel}. */
export interface JobStatusLabelProps {
  /** `running` | `success` | `failed` (any other value is shown as is). */
  status: string;
  className?: string;
}

/**
 * Status of a job run: icon AND label, in neutral tokens only (green, amber
 * and red are reserved to the compliance status). A failure is set apart by
 * its icon and weight, never by a colour.
 */
export function JobStatusLabel({ status, className }: JobStatusLabelProps) {
  const label = JobStatus.is(status) ? JobStatus.label(status) : status;
  const Icon = status === "success" ? CircleCheck : status === "failed" ? CircleX : status === "running" ? LoaderCircle : MinusCircle;
  return (
    <span data-status={status} className={cn("inline-flex items-center gap-1.5 text-sm", status === "failed" ? "font-semibold text-text" : "text-text-muted", className)}>
      <Icon className={cn("size-4 shrink-0", status === "running" && "motion-safe:animate-spin")} aria-hidden="true" />
      {label}
    </span>
  );
}
