"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, LayoutGrid } from "lucide-react";
import { ADMIN_SECTIONS, type AdminSection } from "@/config/admin";
import { cn } from "@/lib/utils";

/** Props of {@link AdminNav}. */
export interface AdminNavProps {
  /** Sections the user may open (filtered on the server by permission). */
  allowed: readonly AdminSection["href"][];
  /** Warning shown next to a section (e.g. « Export en retard » on Exploitation). */
  warnings?: Partial<Record<AdminSection["href"], string>>;
}

/**
 * Secondary navigation of the administration space: the sections the user
 * may open, the active one marked with the accent and `aria-current`.
 */
export function AdminNav({ allowed, warnings = {} }: AdminNavProps) {
  const pathname = usePathname();
  const sections = ADMIN_SECTIONS.filter((s) => allowed.includes(s.href));
  const item = (href: string, label: string, Icon: typeof LayoutGrid, warning?: string) => {
    const active = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
            active && "bg-accent-soft font-semibold text-accent-strong hover:bg-accent-soft hover:text-accent-strong",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {warning && (
            <span className="inline-flex items-center gap-1 rounded-xs border border-border-strong bg-surface-1 px-1.5 py-0.5 text-[11px] font-semibold text-text" data-slot="admin-nav-warning">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {warning}
            </span>
          )}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Administration" data-slot="admin-nav">
      <ul className="flex flex-col gap-0.5">
        {item("/admin", "Vue d'ensemble", LayoutGrid)}
        {sections.map((s) => item(s.href, s.label, s.icon, warnings[s.href]))}
      </ul>
    </nav>
  );
}
