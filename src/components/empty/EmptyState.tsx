import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props of {@link EmptyState}. */
export interface EmptyStateProps {
  /** Lucide icon shown above the title. */
  icon?: LucideIcon;
  /** Short title. */
  title: string;
  /** What this area will contain / why it is empty. */
  description?: ReactNode;
  /** Optional extra content (list, actions). */
  children?: ReactNode;
  /** Heading level of the title (default `h1`, for full-page placeholders). */
  headingLevel?: "h1" | "h2" | "h3";
  /** Extra classes. */
  className?: string;
}

/** Sober empty state: icon, title, description. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  headingLevel: Heading = "h1",
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("mx-auto flex max-w-xl flex-col items-center gap-4 text-center", className)}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-md border border-border bg-surface-2 text-text-muted">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <Heading className="text-lg font-semibold tracking-tight text-text">{title}</Heading>
      {description && <div className="text-sm leading-relaxed text-text-muted">{description}</div>}
      {children}
    </div>
  );
}
