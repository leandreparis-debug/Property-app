"use client";

import { X } from "lucide-react";
import type { MapSiteProperties } from "@/domain/map-dto";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { compareStatusSeverity } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Props of {@link SiteListPanel}. */
export interface SiteListPanelProps {
  sites: readonly MapSiteProperties[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}

/** Sites sorted by severity, then by name. */
export function sortSitesForList(sites: readonly MapSiteProperties[]): MapSiteProperties[] {
  return [...sites].sort((a, b) => compareStatusSeverity(a.status, b.status) || a.name.localeCompare(b.name, "fr"));
}

/**
 * Accessible alternative to the map: every located site as a button that
 * selects it exactly like a click on its point.
 */
export function SiteListPanel({ sites, selectedCode, onSelect, onClose }: SiteListPanelProps) {
  const sorted = sortSitesForList(sites);
  return (
    <aside aria-labelledby="site-list-title" data-slot="site-list" className="flex min-h-0 flex-1 flex-col text-text">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 id="site-list-title" className="text-sm font-semibold tracking-tight">
          Liste des sites <span className="numeric text-text-muted">({sorted.length})</span>
        </h2>
        <Button variant="ghost" size="icon" aria-label="Fermer la liste" onClick={onClose}>
          <X />
        </Button>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.map((site) => (
          <li key={site.id}>
            <button
              type="button"
              onClick={() => onSelect(site.code)}
              aria-current={site.code === selectedCode ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent",
                site.code === selectedCode && "bg-accent/15",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{site.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  <span className="numeric">{site.code}</span>
                  {site.city ? ` · ${site.city}` : ""}
                </span>
              </span>
              <StatusBadge status={site.status} className="shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
