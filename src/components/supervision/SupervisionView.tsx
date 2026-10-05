"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FootprintRecord } from "@/domain/map-data";
import { withFilters } from "@/domain/filters/url";
import { DEADLINE_LABELS, type DeadlineBucket } from "@/domain/site-index";
import { computeSupervision } from "@/domain/supervision";
import { NationalMapLoader } from "@/components/map/NationalMapLoader";
import type { MapAssets } from "@/components/map/style/assets";
import { FilterChips } from "@/components/filters/FilterChips";
import { useSiteFilters } from "@/components/filters/use-site-filters";
import { isPresenting } from "@/components/shell/presentation";
import { useSiteIndex } from "@/components/sites/SiteIndexProvider";
import { replaceQuery } from "@/components/sites/url";
import { StatusDot } from "@/components/status/StatusDot";
import { Button } from "@/components/ui/button";
import { formatNumber, formatSurface } from "@/lib/format";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DeadlineHistogram, RegionBars, StatusStackedBar } from "./charts";

/** Refresh period of the presentation mode. */
export const PRESENTATION_REFRESH_MS = 5 * 60 * 1000;
/** Rows of the anomaly list before « +n autres ». */
const ANOMALY_ROWS = 15;

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex min-h-0 flex-col rounded-lg border border-border bg-surface-1 p-4", className)}>
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-text-muted uppercase">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-4 py-3" data-slot="kpi">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="numeric mt-1 text-3xl font-semibold tracking-tight text-text">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-subtle">{hint}</p>}
    </div>
  );
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

/**
 * Committee view: indicators, anomalies to handle, distribution by region,
 * lease deadlines and a compact national map — on the shared filters.
 * Presentation mode (`present=1`): rail and bar hidden, larger type,
 * fullscreen when available, data refreshed every 5 minutes.
 */
export function SupervisionView({ footprints, assets }: { footprints: FootprintRecord[]; assets: MapAssets }) {
  const { filtered, filters, toggleValue } = useSiteFilters();
  const { refresh, loadedAt } = useSiteIndex();
  const stats = useMemo(() => computeSupervision(filtered), [filtered]);
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const presenting = isPresenting(pathname, params);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const setPresent = useCallback((on: boolean) => {
    const next = new URLSearchParams(window.location.search);
    if (on) next.set("present", "1");
    else next.delete("present");
    replaceQuery(next.toString());
    if (on) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // Presentation: larger type, Escape / leaving fullscreen exits, refresh.
  useEffect(() => {
    if (!presenting) return;
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "115%";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setPresent(false);
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    const timer = window.setInterval(() => {
      refresh().then(() => setRefreshError(null), (e: Error) => setRefreshError(e.message));
    }, PRESENTATION_REFRESH_MS);
    return () => {
      root.style.fontSize = previous;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.clearInterval(timer);
    };
  }, [presenting, refresh, setPresent]);

  const openSite = (code: string) => {
    const q = withFilters(window.location.search, filters, ["site", "present", "sort"]);
    router.push(`/?${[q, `site=${encodeURIComponent(code)}`].filter(Boolean).join("&")}`);
  };
  const shown = stats.anomalies.slice(0, ANOMALY_ROWS);
  const more = stats.anomalies.length - shown.length;

  return (
    <div className={cn("flex h-full flex-col gap-3", presenting && "p-4")} data-slot="supervision" data-presenting={presenting || undefined}>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Supervision</h1>
        {presenting && <FilterChips className="flex-1" />}
        <div className="flex items-center gap-3">
          {presenting && (
            <p className="text-right text-xs text-text-muted" data-slot="updated-at">
              Mise à jour : <span className="numeric text-text">{timeFormat.format(new Date(loadedAt))}</span>
              {refreshError && <span className="block text-text-subtle">{refreshError}</span>}
            </p>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPresent(!presenting)}>
            {presenting ? <Minimize2 /> : <Maximize2 />}
            {presenting ? "Quitter" : "Mode présentation"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]" data-slot="kpis">
        <Kpi label="Sites" value={formatNumber(stats.total)} hint="périmètre filtré" />
        <Kpi label="Baux à arbitrer" value={formatNumber(stats.leaseAlerts)} hint="dépassés ou < 6 mois" />
        <Kpi label="Complétude moyenne" value={stats.averageCompleteness === null ? "—" : `${stats.averageCompleteness} %`} />
        <Kpi label="Surface totale" value={formatSurface(stats.totalArea)} />
        <div className="col-span-2 rounded-lg border border-border bg-surface-1 px-4 py-3 lg:col-span-1" data-slot="status-shares">
          <p className="mb-2 text-xs text-text-muted">Répartition par statut</p>
          <StatusStackedBar shares={stats.shares} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Anomalies à traiter" className="xl:row-span-2">
          <ul className="flex max-h-full flex-col gap-1 overflow-y-auto pr-1" data-slot="anomalies">
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => openSite(e.code)}
                  className="w-full rounded-sm px-2 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <StatusDot status={e.status} size="sm" />
                    <span className="sr-only">{STATUS_META[e.status].label} : </span>
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="numeric text-xs text-text-muted">{e.code}</span>
                    <span className="ml-auto shrink-0 text-xs text-text-muted">{DEADLINE_LABELS[e.leaseDeadlineBucket]}</span>
                  </span>
                  <ul className="mt-0.5 ml-4 text-xs text-text-muted">
                    {e.reasons.map((r) => (
                      <li key={r.ruleId}>
                        {r.labelFr}
                        {r.detailFr ? ` — ${r.detailFr}` : ""}
                      </li>
                    ))}
                  </ul>
                </button>
              </li>
            ))}
            {stats.anomalies.length === 0 && <li className="px-2 text-sm text-text-subtle">Aucune anomalie dans ce périmètre.</li>}
          </ul>
          {more > 0 && <p className="mt-2 px-2 text-xs text-text-muted">+{more} autre{more > 1 ? "s" : ""}</p>}
        </Card>
        <Card title="Répartition par région">
          <RegionBars regions={stats.regions} selected={filters.region} onSelect={(r) => toggleValue("region", r)} />
        </Card>
        <Card title="Carte">
          <div className="relative h-full min-h-56 overflow-hidden rounded-md" data-slot="mini-map">
            <NationalMapLoader footprints={footprints} assets={assets} isAdmin={false} exposeTestHook={false} variant="compact" />
          </div>
        </Card>
        <Card title="Échéances de bail" className="xl:col-span-2">
          <div className="h-44">
            <DeadlineHistogram deadlines={stats.deadlines} selected={filters.deadline} onSelect={(b: DeadlineBucket) => toggleValue("deadline", b)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
