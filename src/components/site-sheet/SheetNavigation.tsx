"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Map as MapIcon, Printer } from "lucide-react";
import { useEffect, useMemo } from "react";
import { listContextQuery, siteNeighbours, siteSheetHref } from "@/domain/site-sheet/navigation";
import { parseSort, sortEntries } from "@/domain/sites-table";
import { filterQuery } from "@/domain/filters/url";
import { useSiteFilters } from "@/components/filters/use-site-filters";
import { Button } from "@/components/ui/button";
import { ArchiveControls } from "@/components/editing/ArchiveControls";

/** « Sites › {nom} »: back to the list with its filters and sort. */
export function SheetBreadcrumb({ name }: { name: string }) {
  const params = useSearchParams();
  const query = listContextQuery(params.toString());
  return (
    <nav aria-label="Fil d'Ariane" className="text-sm text-text-muted print:hidden">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link href={`/sites${query ? `?${query}` : ""}`} className="hover:text-text hover:underline">
            Sites
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page" className="truncate text-text">
          {name}
        </li>
      </ol>
    </nav>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest('[role="dialog"]') !== null;
}

/**
 * Previous / next site within the FILTERED and SORTED list (the same order as
 * /sites), with the `[` and `]` shortcuts. The list context and the open tab
 * are kept.
 */
export function SiblingNavigation({ siteId }: { siteId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { filtered } = useSiteFilters();
  const search = params.toString();
  const sort = parseSort(params.get("sort"));
  const ids = useMemo(() => sortEntries(filtered, sort).map((e) => e.id), [filtered, sort]);
  const neighbours = siteNeighbours(ids, siteId);
  const previous = neighbours?.previous ? siteSheetHref(neighbours.previous, search) : null;
  const next = neighbours?.next ? siteSheetHref(neighbours.next, search) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
      const href = event.key === "[" ? previous : event.key === "]" ? next : null;
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);

  if (!neighbours) return null;
  return (
    <nav aria-label="Sites voisins dans la liste" data-slot="sibling-nav" className="flex items-center gap-1 print:hidden">
      {previous ? (
        <Button asChild variant="ghost" size="icon" aria-keyshortcuts="[">
          <Link href={previous} aria-label="Site précédent">
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" size="icon" disabled aria-label="Site précédent">
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}
      <span className="numeric text-xs text-text-muted" data-slot="sibling-position">
        {neighbours.position} / {neighbours.total}
      </span>
      {next ? (
        <Button asChild variant="ghost" size="icon" aria-keyshortcuts="]">
          <Link href={next} aria-label="Site suivant">
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" size="icon" disabled aria-label="Site suivant">
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}

/** « Voir sur la carte », « Imprimer » and, for administrators, « Plus d'actions » (archiving). */
export function SheetActions({ code, siteId, name, canArchive, archived }: { code: string; siteId: string; name: string; canArchive: boolean; archived: boolean }) {
  const params = useSearchParams();
  const filters = filterQuery(params.toString());
  const mapHref = `/?${[filters, `site=${encodeURIComponent(code)}`].filter(Boolean).join("&")}`;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" data-slot="sheet-actions">
      {!archived && (
        <Button asChild variant="secondary" size="sm">
          <Link href={mapHref}>
            <MapIcon aria-hidden="true" />
            Voir sur la carte
          </Link>
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Imprimer
      </Button>
      {canArchive && <ArchiveControls siteId={siteId} name={name} archived={archived} />}
    </div>
  );
}
