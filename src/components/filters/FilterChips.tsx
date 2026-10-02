"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { buildFilterOptions, CRITERION_LABELS, LIST_CRITERIA, valueLabel } from "@/domain/filters";
import { cn } from "@/lib/utils";
import { useSiteFilters } from "./use-site-filters";

/** One removable chip. */
interface Chip {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * Active filters as removable chips, with the « n / total sites » counter
 * announced in a polite live region.
 */
export function FilterChips({ className }: { className?: string }) {
  const { filters, filtered, total, entries, toggleValue, setFilter, clear, activeCount } = useSiteFilters();
  const options = useMemo(() => buildFilterOptions(entries), [entries]);

  const chips: Chip[] = [];
  for (const criterion of LIST_CRITERIA) {
    for (const value of filters[criterion] as string[]) {
      chips.push({ key: `${criterion}:${value}`, label: `${CRITERION_LABELS[criterion]} : ${valueLabel(criterion, value, options)}`, remove: () => toggleValue(criterion, value) });
    }
  }
  if (filters.active !== "all") chips.push({ key: "active", label: `${CRITERION_LABELS.active} : ${filters.active === "active" ? "sites actifs" : "sites inactifs"}`, remove: () => setFilter("active", "all") });
  if (filters.completenessBelow !== null) chips.push({ key: "compl", label: `${CRITERION_LABELS.completenessBelow} : < ${filters.completenessBelow} %`, remove: () => setFilter("completenessBelow", null) });
  if (filters.q) chips.push({ key: "q", label: `${CRITERION_LABELS.q} : « ${filters.q} »`, remove: () => setFilter("q", "") });

  return (
    <div data-slot="filter-chips" className={cn("pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5", className)}>
      <p aria-live="polite" data-slot="filter-count" className="rounded-full bg-surface-3 px-3 py-1 text-xs text-text-muted">
        <span className="numeric text-text">{filtered.length}</span> / <span className="numeric">{total}</span> sites
      </p>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          aria-label={`Retirer le filtre ${chip.label}`}
          className="flex h-7 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 text-xs text-accent-strong outline-none hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span>{chip.label}</span>
          <X className="size-3 text-text-muted" aria-hidden="true" />
        </button>
      ))}
      {activeCount > 1 && (
        <button type="button" onClick={clear} className="rounded-full px-2 text-xs text-text-muted underline-offset-2 outline-none hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent">
          Tout effacer
        </button>
      )}
    </div>
  );
}
