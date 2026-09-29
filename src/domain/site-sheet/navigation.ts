/**
 * Tabs of the site sheet (`?tab=`) and previous / next navigation within the
 * filtered and sorted site list.
 */
import { parseFilters, serializeFilters } from "../filters/url";
import { parseSort, serializeSort } from "../sites-table";

/** Tabs of the site sheet, in display order, with their French label. */
export const SITE_TABS = [
  { id: "overview", labelFr: "Vue d'ensemble" },
  { id: "lease", labelFr: "Bail" },
  { id: "operations", labelFr: "Exploitation" },
  { id: "finance", labelFr: "Financier" },
  { id: "energy", labelFr: "Énergie" },
  { id: "technical", labelFr: "Technique" },
  { id: "icpe", labelFr: "ICPE et risques" },
  { id: "documents", labelFr: "Documents" },
] as const;

/** A tab of the site sheet. */
export type SiteTab = (typeof SITE_TABS)[number]["id"];

/** Default tab. */
export const DEFAULT_TAB: SiteTab = "overview";

/**
 * Reads `?tab=`: unknown or missing values give `overview`.
 * @param value - Raw query value.
 */
export function parseTab(value: string | string[] | null | undefined): SiteTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return SITE_TABS.some((t) => t.id === raw) ? (raw as SiteTab) : DEFAULT_TAB;
}

/** Neighbours of a site in a list. */
export interface SiteNeighbours {
  previous: string | null;
  next: string | null;
  /** 1-based position. */
  position: number;
  total: number;
}

/**
 * Previous and next site ids in an ordered list (no wrap-around).
 * @param orderedIds - Ids of the filtered and sorted list.
 * @param currentId - Current site.
 * @returns The neighbours, or `null` when the site is not in the list.
 */
export function siteNeighbours(orderedIds: readonly string[], currentId: string): SiteNeighbours | null {
  const index = orderedIds.indexOf(currentId);
  if (index < 0) return null;
  return {
    previous: orderedIds[index - 1] ?? null,
    next: orderedIds[index + 1] ?? null,
    position: index + 1,
    total: orderedIds.length,
  };
}

/**
 * List context carried by the site sheet URL: the filters and the sort of
 * the list it was opened from (never `site`, `present` nor `tab`).
 * @param search - Query string (`?…` or empty).
 * @returns The query without « ? » (may be empty).
 */
export function listContextQuery(search: string): string {
  const params = serializeFilters(parseFilters(search));
  const sort = serializeSort(parseSort(new URLSearchParams(search).get("sort")));
  if (sort) params.set("sort", sort);
  return params.toString();
}

/**
 * Link to another site sheet, keeping the list context and the open tab.
 * @param id - Site id.
 * @param search - Current query string.
 */
export function siteSheetHref(id: string, search: string): string {
  const context = new URLSearchParams(listContextQuery(search));
  const tab = parseTab(new URLSearchParams(search).get("tab"));
  if (tab !== DEFAULT_TAB) context.set("tab", tab);
  const query = context.toString();
  return `/sites/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}
