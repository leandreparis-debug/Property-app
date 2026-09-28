"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS, isNavItemActive, navItemsFor, type NavItem } from "@/config/navigation";
import type { UserRole } from "@/domain/enums";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AppMonogram } from "./AppMonogram";

/** Props of {@link NavRail}. */
export interface NavRailProps {
  /** Entries to display (defaults to `NAV_ITEMS`). */
  items?: readonly NavItem[];
  /**
   * Role of the current user: entries it cannot use are hidden (visual
   * comfort only — access is enforced on the server).
   */
  role?: UserRole;
  /** Content pinned at the bottom of the rail (user menu). */
  footer?: ReactNode;
  /** Extra classes. */
  className?: string;
}

/**
 * Thin vertical glass rail (64 px) on the left. Icon links with tooltips; the
 * active entry uses the accent color and `aria-current="page"`.
 */
export function NavRail({ items = NAV_ITEMS, role, footer, className }: NavRailProps) {
  const pathname = usePathname();
  const visible = role ? navItemsFor(role, items) : items;

  return (
    <nav
      aria-label="Navigation principale"
      data-slot="nav-rail"
      className={cn(
        "glass fixed top-3 bottom-3 left-3 z-40 flex w-16 flex-col items-center gap-2 rounded-lg py-3 shadow-panel",
        className,
      )}
    >
      <AppMonogram className="mb-2" />
      <ul className="flex flex-col items-center gap-1">
        {visible.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    data-active={active || undefined}
                    className={cn(
                      "relative flex size-10 items-center justify-center rounded-md text-text-muted transition-colors",
                      "hover:bg-surface-2 hover:text-text",
                      active && "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-accent"
                      />
                    )}
                    <Icon className="size-5" aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {footer && <div className="mt-auto flex flex-col items-center">{footer}</div>}
    </nav>
  );
}
