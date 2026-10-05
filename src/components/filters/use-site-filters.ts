"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  activeCriteriaCount,
  applyFilters,
  EMPTY_FILTERS,
  parseFilters,
  withFilters,
  type ListCriterion,
  type SiteFilters,
} from "@/domain/filters";
import type { SiteIndexEntry } from "@/domain/site-index";
import { useSiteIndex } from "@/components/sites/SiteIndexProvider";
import { replaceQuery } from "@/components/sites/url";

/** Result of {@link useSiteFilters}. */
export interface UseSiteFilters {
  filters: SiteFilters;
  /** Entries matching the filters. */
  filtered: SiteIndexEntry[];
  /** Every entry of the index. */
  entries: SiteIndexEntry[];
  total: number;
  /** Number of active criteria. */
  activeCount: number;
  setFilters: (next: SiteFilters) => void;
  setFilter: <K extends keyof SiteFilters>(key: K, value: SiteFilters[K]) => void;
  toggleValue: (criterion: ListCriterion, value: string) => void;
  clear: () => void;
}

/**
 * Filters of the site views, read from and written to the URL (shared by
 * the map, the list, the supervision and the palette). Filtering is local.
 */
export function useSiteFilters(): UseSiteFilters {
  const { entries } = useSiteIndex();
  const params = useSearchParams();
  const search = params.toString();
  const filters = useMemo(() => parseFilters(search), [search]);
  const filtered = useMemo(() => applyFilters(entries, filters), [entries, filters]);

  const setFilters = useCallback((next: SiteFilters) => replaceQuery(withFilters(window.location.search, next)), []);
  const setFilter = useCallback(
    <K extends keyof SiteFilters>(key: K, value: SiteFilters[K]) => setFilters({ ...parseFilters(window.location.search), [key]: value }),
    [setFilters],
  );
  const toggleValue = useCallback(
    (criterion: ListCriterion, value: string) => {
      const current = parseFilters(window.location.search);
      const list = current[criterion] as string[];
      setFilters({ ...current, [criterion]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
    },
    [setFilters],
  );
  const clear = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  return { filters, filtered, entries, total: entries.length, activeCount: activeCriteriaCount(filters), setFilters, setFilter, toggleValue, clear };
}
