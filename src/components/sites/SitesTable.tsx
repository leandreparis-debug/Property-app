"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, MapPinned } from "lucide-react";
import { useMemo } from "react";
import { serializeFilters } from "@/domain/filters/url";
import { DEADLINE_LABELS } from "@/domain/site-index";
import { nextSort, parseSort, serializeSort, sortEntries, type SortKey } from "@/domain/sites-table";
import { useSiteFilters } from "@/components/filters/use-site-filters";
import { EmptyState } from "@/components/empty/EmptyState";
import { StatusDot } from "@/components/status/StatusDot";
import { Button } from "@/components/ui/button";
import { formatSurface } from "@/lib/format";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { siteSheetHref } from "@/domain/site-sheet/navigation";
import { replaceQuery } from "./url";

/** Columns of the table. */
const COLUMNS: readonly { key: SortKey; label: string; numeric?: boolean; className?: string }[] = [
  { key: "status", label: "Statut", className: "w-32" },
  { key: "code", label: "Code", className: "w-28" },
  { key: "name", label: "Nom", className: "min-w-56" },
  { key: "city", label: "Ville" },
  { key: "department", label: "Dép.", className: "w-16" },
  { key: "region", label: "Région" },
  { key: "portfolio", label: "Portefeuille" },
  { key: "typology", label: "Typologie" },
  { key: "area", label: "Surface", numeric: true },
  { key: "deadline", label: "Échéance" },
  { key: "completeness", label: "Complétude", numeric: true },
  { key: "reasons", label: "Raisons", className: "min-w-64" },
];

/** Short status labels (dense table). */
const SHORT_STATUS: Record<keyof typeof STATUS_META, string> = { critical: "Critique", warning: "À surveiller", unknown: "Non évalué", ok: "Conforme" };

/**
 * Dense, sortable site list sharing the URL filters with the map and the
 * supervision. Semantic <table> with aria-sort; a row opens the site record.
 */
export function SitesTable() {
  const { filtered, total, filters, clear } = useSiteFilters();
  const params = useSearchParams();
  const router = useRouter();
  const sort = parseSort(params.get("sort"));
  const rows = useMemo(() => sortEntries(filtered, sort), [filtered, sort]);
  const area = rows.reduce((s, e) => s + (e.totalArea ?? 0), 0);

  const sortBy = (key: SortKey) => {
    const next = new URLSearchParams(window.location.search);
    const value = serializeSort(nextSort(sort, key));
    if (value) next.set("sort", value);
    else next.delete("sort");
    replaceQuery(next.toString());
  };
  const filterPart = serializeFilters(filters).toString();
  const mapHref = (code: string) => `/?${[filterPart, `site=${encodeURIComponent(code)}`].filter(Boolean).join("&")}`;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
      <div className="min-h-0 flex-1 overflow-auto" data-slot="sites-table-scroll">
        <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-sm" data-slot="sites-table">
          <caption className="sr-only">Liste des sites, triée par {COLUMNS.find((c) => c.key === sort.key)?.label.toLowerCase()} ({sort.direction === "asc" ? "croissant" : "décroissant"})</caption>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("border-b border-border-strong px-3 py-0 text-left text-xs font-semibold text-text-muted whitespace-nowrap", c.numeric && "text-right", c.className)}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(c.key)}
                      className={cn("inline-flex h-9 items-center gap-1 outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-accent", active && "text-text", c.numeric && "flex-row-reverse")}
                    >
                      {c.label}
                      {active && (sort.direction === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="w-12 border-b border-border-strong">
                <span className="sr-only">Carte</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                tabIndex={0}
                data-code={e.code}
                onClick={() => router.push(siteSheetHref(e.id, params.toString()))}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && ev.target === ev.currentTarget) router.push(siteSheetHref(e.id, params.toString()));
                }}
                className="h-9 cursor-pointer outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&>td]:border-b [&>td]:border-border [&>td]:px-3 [&>td]:whitespace-nowrap"
              >
                <td>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <StatusDot status={e.status} size="sm" />
                    {SHORT_STATUS[e.status]}
                  </span>
                </td>
                <td className="numeric text-text-muted">{e.code}</td>
                <td className="max-w-72 truncate font-medium">{e.name}</td>
                <td className="text-text-muted">{e.city ?? "—"}</td>
                <td className="numeric text-text-muted">{e.departmentCode ?? "—"}</td>
                <td className="max-w-48 truncate text-text-muted">{e.region ?? "—"}</td>
                <td className="max-w-40 truncate text-text-muted">{e.portfolio ?? "—"}</td>
                <td className="max-w-40 truncate text-text-muted">{e.typology ?? "—"}</td>
                <td className="numeric text-right">{formatSurface(e.totalArea)}</td>
                <td className="text-text-muted">{DEADLINE_LABELS[e.leaseDeadlineBucket]}</td>
                <td className="numeric text-right">{e.completeness} %</td>
                <td className="max-w-80 truncate text-text-muted">
                  {e.reasons[0] ? (
                    <>
                      {e.reasons[0].labelFr}
                      {e.reasons.length > 1 && <span className="numeric ml-1.5 text-text-subtle">+{e.reasons.length - 1}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-right">
                  <Link
                    href={mapHref(e.code)}
                    onClick={(ev) => ev.stopPropagation()}
                    aria-label={`Voir ${e.name} sur la carte`}
                    className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted outline-none hover:bg-surface-3 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <MapPinned className="size-4" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-16">
            <EmptyState title="Aucun site ne correspond aux filtres" headingLevel="h2">
              <Button variant="secondary" onClick={clear}>
                Effacer les filtres
              </Button>
            </EmptyState>
          </div>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface-2 px-4 py-2 text-xs text-text-muted" data-slot="sites-table-footer">
        <span>
          <span className="numeric text-text">{rows.length}</span> / <span className="numeric">{total}</span> sites affichés
        </span>
        <span>
          Surface totale affichée : <span className="numeric text-text">{formatSurface(area)}</span>
        </span>
      </footer>
    </div>
  );
}
