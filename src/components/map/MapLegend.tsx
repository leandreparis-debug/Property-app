"use client";

import Link from "next/link";
import { ChevronDown, MapPinOff } from "lucide-react";
import { useState } from "react";
import type { MapSitesData } from "@/domain/map-dto";
import { StatusDot } from "@/components/status/StatusDot";
import { STATUS_META, STATUSES_BY_SEVERITY, type ComplianceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Props of {@link MapLegend}. */
export interface MapLegendProps {
  /** Counts of ALL the sites. */
  counts: MapSitesData["counts"];
  /** Counts of the filtered sites, when a filter is active. */
  filteredCounts: MapSitesData["counts"] | null;
  /** Statuses selected in the filter (empty: none). */
  selectedStatuses: readonly ComplianceStatus[];
  onToggleStatus: (status: ComplianceStatus) => void;
  unlocated: MapSitesData["unlocated"];
}

/**
 * Bottom-left: the CLICKABLE legend (a status toggles the status filter;
 * unselected statuses are dimmed) with the total per status — plus the
 * filtered number when a filter is active — and above it the « n site(s)
 * non localisé(s) » pill (hidden if 0).
 */
export function MapLegend({ counts, filteredCounts, selectedStatuses, onToggleStatus, unlocated }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const n = unlocated.length;
  const filtering = selectedStatuses.length > 0;
  return (
    <div className="absolute bottom-3 left-3 z-20 flex w-64 flex-col gap-2">
      {n > 0 && (
        <div data-slot="unlocated" className="glass rounded-lg text-text shadow-panel">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="unlocated-list"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-muted outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            <MapPinOff className="size-3.5" aria-hidden="true" />
            <span>
              <span className="numeric text-text">{n}</span> site{n > 1 ? "s" : ""} non localisé{n > 1 ? "s" : ""}
            </span>
            <ChevronDown className={cn("ml-auto size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
          </button>
          {open && (
            <ul id="unlocated-list" className="max-h-48 overflow-y-auto border-t border-border px-2 py-1.5">
              {unlocated.map((s) => (
                <li key={s.id}>
                  <Link href={`/sites/${s.id}`} className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                    <StatusDot status={s.status} size="sm" />
                    <span className="numeric text-text-muted">{s.code}</span>
                    <span className="truncate">{s.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section aria-labelledby="legend-title" data-slot="map-legend" className="glass rounded-lg px-3 py-3 text-text shadow-panel">
        <h2 id="legend-title" className="mb-2 px-1 text-sm font-semibold tracking-tight">
          Statut de conformité
        </h2>
        <ul aria-label="Légende des statuts de conformité" data-slot="status-legend" className="flex flex-col gap-0.5 text-xs text-text-muted">
          {STATUSES_BY_SEVERITY.map((status) => {
            const pressed = selectedStatuses.includes(status);
            const dimmed = filtering && !pressed;
            return (
              <li key={status} data-status={status}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onToggleStatus(status)}
                  aria-label={`${pressed ? "Retirer" : "Filtrer"} le statut ${STATUS_META[status].label}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-1 py-1 outline-none transition-opacity hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
                    dimmed && "opacity-45",
                    pressed && "text-text",
                  )}
                >
                  <StatusDot status={status} size="sm" />
                  <span>{STATUS_META[status].label}</span>
                  <span className="ml-auto flex items-baseline gap-1.5 pl-4">
                    {filteredCounts && (
                      <span data-slot="status-filtered-count" className="numeric text-text-muted">
                        {filteredCounts[status]} /
                      </span>
                    )}
                    <span data-slot="status-count" className="numeric text-text">
                      {counts[status]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
