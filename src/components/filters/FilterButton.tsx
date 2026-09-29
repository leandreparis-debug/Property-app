"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** « Filtres » button with the number of active criteria. */
export function FilterButton({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="filter-panel"
      aria-label={count > 0 ? `Filtres (${count} actif${count > 1 ? "s" : ""})` : "Filtres"}
      data-slot="filter-button"
      className={cn(
        "glass pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm text-text-muted shadow-panel outline-none transition-colors hover:border-border-strong hover:text-text focus-visible:outline-2 focus-visible:outline-accent",
        (open || count > 0) && "text-text",
      )}
    >
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      <span>Filtres</span>
      {count > 0 && (
        <span aria-hidden="true" className="numeric flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-bg">
          {count}
        </span>
      )}
    </button>
  );
}
