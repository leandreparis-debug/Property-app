import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandBar } from "./CommandBar";
import { NavRail } from "./NavRail";

/** Props of {@link AppShell}. */
export interface AppShellProps {
  /** Page content, rendered in `<main>` under the rail and the command bar. */
  children: ReactNode;
}

/**
 * Application shell: skip link, navigation rail, floating command bar and the
 * main area. Pages render their own `MapStage` or content inside `<main>`.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <TooltipProvider>
      <a
        href="#main"
        className="fixed top-3 left-24 z-50 -translate-y-20 rounded-sm bg-surface-3 px-3 py-2 text-sm text-text shadow-panel focus-visible:translate-y-0"
      >
        Aller au contenu
      </a>
      <NavRail />
      <CommandBar />
      <main id="main" tabIndex={-1} className="relative min-h-dvh outline-none">
        {children}
      </main>
    </TooltipProvider>
  );
}
