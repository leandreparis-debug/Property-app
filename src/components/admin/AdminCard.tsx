import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props of {@link AdminCard}. */
export interface AdminCardProps {
  title: string;
  /** Optional line under the title. */
  description?: ReactNode;
  /** Actions at the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Test hook. */
  slot?: string;
}

/** White card of the administration screens (title, optional actions, content). */
export function AdminCard({ title, description, actions, children, className, slot }: AdminCardProps) {
  return (
    <section aria-label={title} data-slot={slot} className={cn("rounded-lg border border-border bg-surface-1 p-5 shadow-panel", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Title block of an administration page (h1 and description). */
export function AdminPageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] leading-tight font-bold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
