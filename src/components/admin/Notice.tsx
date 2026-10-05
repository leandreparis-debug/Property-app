import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Props of {@link Notice}. */
export interface NoticeProps {
  /** `warning`: something needs attention; `info`: neutral information. */
  tone?: "warning" | "info";
  title: string;
  children?: ReactNode;
  className?: string;
  /** Test and styling hook. */
  slot?: string;
}

/**
 * Banner of the administration screens. Neutral tokens only (green, amber and
 * red are reserved to the compliance status): a warning is set apart by its
 * icon, a stronger border and a bold title.
 */
export function Notice({ tone = "info", title, children, className, slot }: NoticeProps) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      data-slot={slot}
      className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", tone === "warning" ? "border-border-strong bg-surface-3" : "border-border bg-surface-2", className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold text-text">{title}</p>
        {children && <div className="mt-0.5 text-text-muted">{children}</div>}
      </div>
    </div>
  );
}
