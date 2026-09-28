"use client";

import Link from "next/link";
import { ChevronDown, MapPinOff } from "lucide-react";
import { useState } from "react";
import type { MapSitesData } from "@/domain/map-dto";
import { StatusLegend } from "@/components/status/StatusLegend";
import { StatusDot } from "@/components/status/StatusDot";
import { cn } from "@/lib/utils";

/** Props of {@link MapLegend}. */
export interface MapLegendProps {
  counts: MapSitesData["counts"];
  unlocated: MapSitesData["unlocated"];
}

/**
 * Bottom-left: the legend with the number of sites per status, and above it
 * the « n site(s) non localisé(s) » pill that unfolds the list (hidden if 0).
 */
export function MapLegend({ counts, unlocated }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const n = unlocated.length;
  return (
    <div className="absolute bottom-3 left-24 z-20 flex w-64 flex-col gap-2">
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
                    <StatusDot status={s.status} size="sm" label={undefined} />
                    <span className="numeric text-text-muted">{s.code}</span>
                    <span className="truncate">{s.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section aria-labelledby="legend-title" data-slot="map-legend" className="glass rounded-lg px-4 py-3 text-text shadow-panel">
        <h2 id="legend-title" className="mb-2.5 text-sm font-semibold tracking-tight">
          Statut de conformité
        </h2>
        <StatusLegend counts={counts} />
      </section>
    </div>
  );
}
