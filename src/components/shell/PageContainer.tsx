import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props of {@link PageContainer}. */
export interface PageContainerProps {
  /** Page content. */
  children: ReactNode;
  /** Extra classes. */
  className?: string;
}

/**
 * Content area for non-map pages: clears the navigation rail (left) and the
 * floating command bar (top).
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn("min-h-dvh pt-24 pr-6 pb-10 pl-28", className)}>{children}</div>;
}
