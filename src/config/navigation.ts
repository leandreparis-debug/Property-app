import { Map, Building2, Activity, Settings, type LucideIcon } from "lucide-react";
import { can, type Action } from "@/server/auth/permissions";
import type { UserRole } from "@/domain/enums";

/** An entry of the main navigation rail. */
export interface NavItem {
  /** Route path. */
  href: "/" | "/sites" | "/supervision" | "/admin";
  /** French label (tooltip and accessible name). */
  label: string;
  /** Lucide icon. */
  icon: LucideIcon;
  /**
   * Permission needed to SEE the entry (visual comfort only: access is
   * always enforced on the server).
   */
  permission?: Action;
}

/** Main navigation entries, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Carte", icon: Map },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/supervision", label: "Supervision", icon: Activity },
  { href: "/admin", label: "Administration", icon: Settings, permission: "user:manage" },
];

/**
 * Whether a navigation entry is active for the current path. `/` only matches
 * exactly; other entries also match their sub-routes.
 * @param pathname - Current pathname.
 * @param href - Entry route.
 */
export function isNavItemActive(pathname: string, href: NavItem["href"]): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Entries visible for a role.
 * @param role - Current user's role.
 * @param items - Entries (defaults to `NAV_ITEMS`).
 */
export function navItemsFor(role: UserRole, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => !item.permission || can(role, item.permission));
}
