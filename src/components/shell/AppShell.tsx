import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/editing/feedback";
import type { SessionUser } from "@/server/auth/session";
import { CommandBar } from "./CommandBar";
import { MainNav } from "./MainNav";
import { UserMenu } from "./UserMenu";

/** Props of {@link AppShell}. */
export interface AppShellProps {
  /** Page content, rendered in `<main>` under the rail and the command bar. */
  children: ReactNode;
  /** Authenticated user (navigation entries and user menu depend on it). */
  user: SessionUser;
}

/**
 * Application shell (authenticated area): skip link, top bar (brand,
 * navigation, search, user menu, filters on the site views) and the main
 * area. Pages render their own
 * `MapStage` or content inside `<main>`.
 */
export function AppShell({ children, user }: AppShellProps) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <a
          href="#main"
          className="fixed top-3 left-3 z-50 -translate-y-20 rounded-sm bg-surface-1 px-3 py-2 text-sm text-text shadow-panel focus-visible:translate-y-0"
        >
          Aller au contenu
        </a>
        <CommandBar start={<MainNav role={user.role} />} end={<UserMenu name={user.name} email={user.email} role={user.role} />} />
        <main id="main" tabIndex={-1} className="relative min-h-dvh outline-none">
          {children}
        </main>
      </ToastProvider>
    </TooltipProvider>
  );
}
