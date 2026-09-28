import { appMonogram } from "@/config/app";
import { cn } from "@/lib/utils";

/** Props of {@link AppMonogram}. */
export interface AppMonogramProps {
  /** `sm` for the rail (36 px), `md` for the login screen (40 px). */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Square monogram of the application (initial of `APP_NAME`), used by the
 * navigation rail and the login screen. Decorative: the name itself is
 * announced elsewhere.
 */
export function AppMonogram({ size = "sm", className }: AppMonogramProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="app-monogram"
      className={cn(
        "flex items-center justify-center rounded-md border border-border-strong bg-surface-2 font-semibold tracking-tight text-text",
        size === "sm" ? "size-9 text-sm" : "size-10 text-base",
        className,
      )}
    >
      {appMonogram()}
    </div>
  );
}
