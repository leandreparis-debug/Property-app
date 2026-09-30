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
 * Content area of the pages: centered column (1440 px at most) under the
 * top bar.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12", className)}>{children}</div>;
}
