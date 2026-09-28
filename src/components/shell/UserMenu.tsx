"use client";

import { LogOut } from "lucide-react";
import { UserRole } from "@/domain/enums";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Props of {@link UserMenu}. */
export interface UserMenuProps {
  /** Display name (may be empty: the email is used instead). */
  name: string | null;
  email: string;
  role: UserRole;
}

/** Up to two initials from the name, or from the email's local part. */
export function initialsOf(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words.at(-1)![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Round badge with the user's initials, at the bottom of the navigation rail.
 * Opens a menu with name, email, role and « Se déconnecter » (POST to
 * /api/auth/logout: a full page load, so no protected page stays in the
 * client router cache).
 */
export function UserMenu({ name, email, role }: UserMenuProps) {
  return (
    <>
      <form id="logout-form" method="post" action="/api/auth/logout" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu utilisateur : ${name || email}`}
          className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface-3 text-xs font-semibold tracking-wide text-text transition-colors hover:bg-surface-2 data-[state=open]:border-accent"
        >
          <span aria-hidden="true">{initialsOf(name, email)}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="truncate font-medium text-text">{name || email}</span>
            <span className="truncate text-xs font-normal text-text-muted">{email}</span>
            <span className="text-xs font-normal text-text-muted">{UserRole.label(role)}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button type="submit" form="logout-form" className="w-full">
              <LogOut aria-hidden="true" />
              Se déconnecter
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
