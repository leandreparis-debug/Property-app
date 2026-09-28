"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** Search field placeholder, shared by the bar and the palette. */
export const SEARCH_PLACEHOLDER = "Rechercher un site, une ville, un code…";

/** Props of {@link CommandBar}. */
export interface CommandBarProps {
  /** Extra classes. */
  className?: string;
}

/**
 * Floating command bar, top center. Clicking it or pressing Ctrl+K (⌘K on
 * macOS) opens the command palette; Escape closes it. Search itself arrives
 * at a later step: the palette only shows a placeholder message.
 */
export function CommandBar({ className }: CommandBarProps) {
  const [open, setOpen] = useState(false);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <>
      <div
        data-slot="command-bar"
        className={cn(
          "pointer-events-none fixed top-3 right-0 left-0 z-30 flex justify-center pr-3 pl-24",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Control+K"
          className={cn(
            "glass pointer-events-auto flex h-11 w-full max-w-xl items-center gap-3 rounded-lg px-4 text-left text-sm text-text-muted shadow-panel transition-colors",
            "hover:border-border-strong hover:text-text",
          )}
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{SEARCH_PLACEHOLDER}</span>
          <kbd className="flex h-6 items-center gap-0.5 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-[11px] font-medium text-text-muted">
            <span className="sr-only">Raccourci : </span>Ctrl K
          </kbd>
        </button>
      </div>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche"
        description="Rechercher un site, une ville ou un code"
      >
        <CommandInput placeholder={SEARCH_PLACEHOLDER} aria-label="Rechercher" />
        <CommandList>
          <CommandEmpty>La recherche sera disponible prochainement.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  );
}
