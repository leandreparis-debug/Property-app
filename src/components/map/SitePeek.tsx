"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { ComplianceReason } from "@/domain/compliance/types";
import type { MapFootprintProperties, MapSiteProperties } from "@/domain/map-dto";
import { StatusBadge } from "@/components/status/StatusBadge";
import { StatusDot } from "@/components/status/StatusDot";
import { Button } from "@/components/ui/button";
import { formatSurface } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Props of {@link SitePeek}. */
export interface SitePeekProps {
  site: MapSiteProperties;
  /** All the reasons (the point only carries the first 3). */
  reasons: readonly ComplianceReason[];
  footprint: MapFootprintProperties | null;
  onClose: () => void;
  /** Disable the slide-in transition (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/**
 * Glass panel (≈380 px) sliding in from the right with the preview of the
 * selected site. Polite live region: its content is announced on selection.
 * Closed by Escape (handled by the map) or the close button.
 */
export function SitePeek({ site, reasons, footprint, onClose, reducedMotion }: SitePeekProps) {
  return (
    <aside
      aria-live="polite"
      aria-labelledby="site-peek-title"
      data-slot="site-peek"
      data-code={site.code}
      className={cn(
        "glass absolute top-20 right-3 bottom-3 z-30 flex w-[380px] max-w-[calc(100vw-7rem)] flex-col rounded-lg text-text shadow-panel",
        !reducedMotion && "animate-[peek-in_220ms_ease-out]",
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="site-peek-title" className="truncate text-base font-semibold tracking-tight">
            {site.name}
          </h2>
          <p className="mt-1 truncate text-xs text-text-muted">
            <span className="numeric">{site.code}</span>
            {site.city ? ` · ${site.city}` : ""}
            {site.departmentCode ? ` (${site.departmentCode})` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fermer l'aperçu" onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section aria-label="Statut de conformité">
          <StatusBadge status={site.status} />
          {reasons.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2.5">
              {reasons.map((r) => (
                <li key={r.ruleId} className="flex gap-2.5 text-sm">
                  {r.severity !== "unknown" ? <StatusDot status={r.severity} size="sm" className="mt-1.5 shrink-0" /> : <StatusDot status="unknown" size="sm" className="mt-1.5 shrink-0" />}
                  <div>
                    <p className="font-medium">{r.labelFr}</p>
                    {r.detailFr && <p className="text-xs text-text-muted">{r.detailFr}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Aucune règle déclenchée.</p>
          )}
        </section>

        <section aria-label="Complétude">
          <div className="flex items-baseline justify-between text-xs text-text-muted">
            <span>Complétude de la fiche</span>
            <span className="numeric text-text">{site.completeness} %</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="presentation">
            <div className="h-full rounded-full bg-text-muted" style={{ width: `${site.completeness}%` }} />
          </div>
        </section>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-muted">Surface de référence</dt>
          <dd className="numeric text-right">{formatSurface(site.totalArea)}</dd>
          {site.region && (
            <>
              <dt className="text-text-muted">Région</dt>
              <dd className="text-right">{site.region}</dd>
            </>
          )}
        </dl>
        {footprint?.heightEstimated && <p className="text-xs text-text-subtle">Volume estimé (hauteur par défaut)</p>}
      </div>

      <footer className="border-t border-border px-5 py-4">
        <Button asChild className="w-full">
          <Link href={`/sites/${site.id}`}>Ouvrir la fiche</Link>
        </Button>
      </footer>
    </aside>
  );
}
