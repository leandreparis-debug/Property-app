"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, SearchIcon, Zap } from "lucide-react";
import { parseFilters, withFilters, type SiteFilters } from "@/domain/filters";
import { highlight, prepareSearch, searchPlaces, searchSites } from "@/domain/search";
import { searchActions, type PaletteAction } from "@/domain/search/actions";
import { FilterButton } from "@/components/filters/FilterButton";
import { FilterChips } from "@/components/filters/FilterChips";
import { FilterPanel } from "@/components/filters/FilterPanel";
import { useSiteFilters } from "@/components/filters/use-site-filters";
import { useSiteIndex } from "@/components/sites/SiteIndexProvider";
import { replaceQuery } from "@/components/sites/url";
import { StatusDot } from "@/components/status/StatusDot";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { isPresenting, isSiteView } from "./presentation";

/** Search field placeholder, shared by the bar and the palette. */
export const SEARCH_PLACEHOLDER = "Rechercher un site, une ville, un code…";

/** Event asking the national map to go back to the national view. */
export const NATIONAL_VIEW_EVENT = "vigie:national-view";

/** Props of {@link CommandBar}. */
export interface CommandBarProps {
  /** Extra classes. */
  className?: string;
}

/** Text with the query words highlighted in accent. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((s, i) =>
        s.match ? (
          <mark key={i} className="bg-transparent font-semibold text-accent">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Floating command bar, top center, with — on the site views (map, list,
 * supervision) — the « Filtres » button, the panel and the active chips.
 * Ctrl+K (⌘K) opens the universal search: sites, places and actions, all
 * computed locally on the site index.
 */
export function CommandBar({ className }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { entries } = useSiteIndex();
  const { activeCount, setFilters, clear } = useSiteFilters();
  const siteView = isSiteView(pathname);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const prepared = useMemo(() => prepareSearch(entries), [entries]);
  const sites = useMemo(() => searchSites(prepared, query), [prepared, query]);
  const places = useMemo(() => searchPlaces(entries, query), [entries, query]);
  const actions = useMemo(() => searchActions(query), [query]);

  /** Opens the map with the given filters (and optional site). */
  const openMap = useCallback(
    (filters: SiteFilters, site: string | null) => {
      const next = withFilters(window.location.search, filters, ["site", "present", "sort"]);
      const query = [next, site ? `site=${encodeURIComponent(site)}` : ""].filter(Boolean).join("&");
      if (pathname === "/") replaceQuery(query);
      else router.push(`/${query ? `?${query}` : ""}`);
    },
    [pathname, router],
  );

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const runAction = (action: PaletteAction) =>
    run(() => {
      const current = parseFilters(window.location.search);
      const effect = action.effect;
      if (effect.kind === "filter") setFilters({ ...current, ...effect.patch });
      else if (effect.kind === "clear-filters") clear();
      else if (effect.kind === "navigate") {
        const q = withFilters(window.location.search, current, ["site", "present", "sort"]);
        router.push(`${effect.path}${q ? `?${q}` : ""}`);
      } else if (effect.kind === "national-view") {
        if (pathname === "/") window.dispatchEvent(new Event(NATIONAL_VIEW_EVENT));
        else openMap(current, null);
      }
    });

  if (isPresenting(pathname, params)) return null;
  const empty = sites.length === 0 && places.length === 0 && actions.length === 0;

  return (
    <>
      <div
        data-slot="command-bar"
        className={cn("pointer-events-none fixed top-3 right-0 left-0 z-30 flex flex-col items-center gap-2 pr-3 pl-24", className)}
      >
        <div className="flex w-full max-w-2xl items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-keyshortcuts="Control+K"
            className={cn(
              "glass pointer-events-auto flex h-11 w-full max-w-xl items-center gap-3 rounded-lg px-4 text-left text-sm text-text-muted shadow-panel transition-colors",
              "hover:border-border-strong hover:text-text",
            )}
          >
            <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{SEARCH_PLACEHOLDER}</span>
            <kbd className="flex h-6 items-center gap-0.5 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-[11px] font-medium text-text-muted">
              <span className="sr-only">Raccourci : </span>Ctrl K
            </kbd>
          </button>
          {siteView && <FilterButton count={activeCount} open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />}
        </div>
        {siteView && <FilterChips />}
      </div>
      {siteView && panelOpen && <FilterPanel onClose={() => setPanelOpen(false)} />}

      <CommandDialog open={open} onOpenChange={setOpen} title="Recherche" description="Rechercher un site, une ville ou un code" shouldFilter={false}>
        <CommandInput placeholder={SEARCH_PLACEHOLDER} aria-label="Rechercher" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[420px]">
          {empty && <CommandEmpty>Aucun résultat pour « {query} »</CommandEmpty>}
          {sites.length > 0 && (
            <CommandGroup heading="Sites">
              {sites.map(({ entry }) => (
                <CommandItem key={entry.id} value={`site:${entry.code}`} onSelect={() => run(() => openMap(parseFilters(window.location.search), entry.code))}>
                  <StatusDot status={entry.status} size="sm" />
                  <span className="sr-only">{STATUS_META[entry.status].label} : </span>
                  <span className="min-w-0 flex-1 truncate">
                    <Highlighted text={entry.name} query={query} />
                    <span className="text-text-muted">
                      {" · "}
                      <span className="numeric">
                        <Highlighted text={entry.code} query={query} />
                      </span>
                      {entry.city ? (
                        <>
                          {" · "}
                          <Highlighted text={entry.city} query={query} />
                        </>
                      ) : null}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {places.length > 0 && (
            <CommandGroup heading="Lieux">
              {places.map((p) => (
                <CommandItem
                  key={`${p.kind}:${p.value}`}
                  value={`place:${p.kind}:${p.value}`}
                  onSelect={() =>
                    run(() => {
                      const current = parseFilters(window.location.search);
                      openMap(p.kind === "region" ? { ...current, region: [p.value] } : { ...current, department: [p.value] }, null);
                    })
                  }
                >
                  <MapPin className="text-text-muted" aria-hidden="true" />
                  <span className="flex-1">
                    <Highlighted text={p.label} query={query} />
                    <span className="text-text-muted"> · {p.kind === "region" ? "région" : "département"}</span>
                  </span>
                  <span className="numeric text-xs text-text-muted">{p.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {actions.length > 0 && (
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action:${a.id}`} onSelect={() => runAction(a)}>
                  <Zap className="text-text-muted" aria-hidden="true" />
                  <Highlighted text={a.label} query={query} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
