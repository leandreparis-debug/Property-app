"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildFilterOptions, CRITERION_LABELS, type FilterOption, type ListCriterion } from "@/domain/filters";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status/StatusDot";
import type { ComplianceStatus } from "@/lib/status";
import { foldText } from "@/lib/text";
import { useSiteFilters } from "./use-site-filters";

/** Sections of the panel, in display order. */
const SECTIONS: readonly ListCriterion[] = ["status", "deadline", "rule", "region", "department", "portfolio", "bu", "typology", "operator"];

/** Values above which a section gets its own search field. */
const SEARCH_THRESHOLD = 8;

function Section({ criterion, options, selected, onToggle }: { criterion: ListCriterion; options: FilterOption[]; selected: readonly string[]; onToggle: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = foldText(query);
    return q ? options.filter((o) => foldText(o.label).includes(q)) : options;
  }, [options, query]);
  if (options.length === 0) return null;
  const id = `filter-${criterion}`;
  return (
    <fieldset className="border-b border-border py-3 last:border-b-0">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">{CRITERION_LABELS[criterion]}</legend>
      {options.length > SEARCH_THRESHOLD && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Chercher (${options.length})`}
          aria-label={`Chercher dans ${CRITERION_LABELS[criterion]}`}
          className="mb-2 h-8 w-full rounded-sm border border-border bg-surface-2 px-2.5 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:border-accent"
        />
      )}
      <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
        {visible.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={checked} onChange={() => onToggle(o.value)} className="size-3.5 accent-[var(--color-accent)]" id={`${id}-${o.value}`} />
                {criterion === "status" && <StatusDot status={o.value as ComplianceStatus} size="sm" />}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="numeric text-xs text-text-muted">{o.count}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-1.5 py-1 text-xs text-text-subtle">Aucune valeur</li>}
      </ul>
    </fieldset>
  );
}

/**
 * Glass panel on the left (≈320 px) with one section per criterion; closed
 * with Escape or the close button.
 */
export function FilterPanel({ onClose }: { onClose: () => void }) {
  const { filters, entries, toggleValue, setFilter, clear, activeCount } = useSiteFilters();
  const options = useMemo(() => buildFilterOptions(entries), [entries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside id="filter-panel" aria-labelledby="filter-panel-title" data-slot="filter-panel" className="glass pointer-events-auto fixed top-[7.75rem] bottom-3 left-8 z-40 flex w-80 flex-col rounded-lg text-text shadow-panel">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="filter-panel-title" className="text-sm font-semibold tracking-tight">Filtres</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={clear} disabled={activeCount === 0}>
            Tout effacer
          </Button>
          <Button variant="ghost" size="icon" aria-label="Fermer les filtres" onClick={onClose}>
            <X />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <fieldset className="border-b border-border py-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">{CRITERION_LABELS.active}</legend>
          <div role="radiogroup" className="flex gap-1">
            {(["all", "active", "inactive"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm hover:bg-surface-2">
                <input type="radio" name="active" checked={filters.active === v} onChange={() => setFilter("active", v)} className="accent-[var(--color-accent)]" />
                {v === "all" ? "Tous" : v === "active" ? "Actifs" : "Inactifs"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="border-b border-border py-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">{CRITERION_LABELS.completenessBelow}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.completenessBelow !== null}
              onChange={(e) => setFilter("completenessBelow", e.target.checked ? 60 : null)}
              className="accent-[var(--color-accent)]"
            />
            Complétude inférieure à <span className="numeric text-text">{filters.completenessBelow ?? 60} %</span>
          </label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={filters.completenessBelow ?? 60}
            disabled={filters.completenessBelow === null}
            onChange={(e) => setFilter("completenessBelow", Number(e.target.value))}
            aria-label="Complétude inférieure à (%)"
            className="mt-2 w-full accent-[var(--color-accent)] disabled:opacity-40"
          />
        </fieldset>
        {SECTIONS.map((criterion) => (
          <Section key={criterion} criterion={criterion} options={options[criterion]} selected={filters[criterion] as string[]} onToggle={(v) => toggleValue(criterion, v)} />
        ))}
      </div>
    </aside>
  );
}
