import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props of {@link Panel}. */
export interface PanelProps {
  /** Optional heading, rendered as an `h2` and used as the region's name. */
  title?: ReactNode;
  /** Optional actions area (buttons…), aligned right in the header. */
  actions?: ReactNode;
  /** Scrollable content. */
  children: ReactNode;
  /** Semantic element: `section` (default) or `aside`. */
  as?: "section" | "aside" | "div";
  /** Accessible name when no visible `title` is given. */
  "aria-label"?: string;
  /** Extra classes on the panel container (size, position…). */
  className?: string;
  /** Extra classes on the scrollable body. */
  bodyClassName?: string;
}

/**
 * Generic floating glass panel: optional title, actions area and a scrollable
 * body. Size and position are set by the caller through `className`.
 */
export function Panel({
  title,
  actions,
  children,
  as: Element = "section",
  "aria-label": ariaLabel,
  className,
  bodyClassName,
}: PanelProps) {
  const generatedId = useId();
  const titleId = title ? `${generatedId}-title` : undefined;
  const hasHeader = Boolean(title || actions);

  return (
    <Element
      data-slot="panel"
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : ariaLabel}
      className={cn("glass flex min-h-0 flex-col rounded-lg text-text shadow-panel", className)}
    >
      {hasHeader && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title ? (
            <h2 id={titleId} className="text-sm font-semibold tracking-tight">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3", bodyClassName)}>
        {children}
      </div>
    </Element>
  );
}
