"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, navItemsFor, type NavItem } from "@/config/navigation";
import type { UserRole } from "@/domain/enums";
import { cn } from "@/lib/utils";
import { VigieIcon } from "@/components/brand/VigieLogo";
import { APP_NAME } from "@/config/app";
import { filterQuery } from "@/domain/filters/url";
import { isSiteView } from "./presentation";

/** Props of {@link MainNav}. */
export interface MainNavProps {
  /** Entries to display (defaults to `NAV_ITEMS`). */
  items?: readonly NavItem[];
  /**
   * Role of the current user: entries it cannot use are hidden (visual
   * comfort only — access is enforced on the server).
   */
  role?: UserRole;
  /** Extra classes. */
  className?: string;
}

/**
 * Brand and main navigation of the top bar: text links; the active entry is
 * underlined with the accent and carries `aria-current="page"`. The site
 * views keep the filters of the URL.
 */
export function MainNav({ items = NAV_ITEMS, role, className }: MainNavProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const visible = role ? navItemsFor(role, items) : items;
  // The site views keep the filters (never « site », « sort » nor « present »).
  const filters = filterQuery(params.toString());

  return (
    <div className={cn("flex h-full items-center gap-8", className)}>
      <Link href="/" className="flex items-center gap-2.5 rounded-sm text-xl font-bold tracking-tight text-text" aria-label={`${APP_NAME} — accueil`}>
        <VigieIcon size={32} decorative />
        <span aria-hidden="true">{APP_NAME}</span>
      </Link>
      <nav aria-label="Navigation principale" data-slot="main-nav" className="h-full">
        <ul className="flex h-full items-stretch gap-1">
          {visible.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={isSiteView(item.href) && filters ? `${item.href}?${filters}` : item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active || undefined}
                  className={cn(
                    "relative flex items-center px-3.5 text-sm font-medium text-text-muted transition-colors hover:text-text",
                    active && "font-semibold text-text",
                  )}
                >
                  {item.label}
                  {active && <span aria-hidden="true" className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-accent" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
