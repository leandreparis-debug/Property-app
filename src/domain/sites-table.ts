/**
 * Sorting of the site list (/sites). The sort lives in the URL:
 * `sort=area` (ascending) or `sort=-area` (descending). Default: severity,
 * then name.
 */
import { DEADLINE_RANK, type SiteIndexEntry } from "./site-index";

/** Sortable columns. */
export const SORT_KEYS = ["status", "code", "name", "city", "department", "region", "portfolio", "typology", "area", "deadline", "completeness", "reasons"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** A sort. `status` ascending = most severe first. */
export interface TableSort {
  key: SortKey;
  direction: "asc" | "desc";
}

/** Default sort: severity (most severe first), then name. */
export const DEFAULT_SORT: TableSort = { key: "status", direction: "asc" };

/** Reads `sort=` (unknown values → default). */
export function parseSort(value: string | null | undefined): TableSort {
  if (!value) return DEFAULT_SORT;
  const desc = value.startsWith("-");
  const key = (desc ? value.slice(1) : value) as SortKey;
  return (SORT_KEYS as readonly string[]).includes(key) ? { key, direction: desc ? "desc" : "asc" } : DEFAULT_SORT;
}

/** Writes `sort=` (null for the default sort). */
export function serializeSort(sort: TableSort): string | null {
  if (sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction) return null;
  return `${sort.direction === "desc" ? "-" : ""}${sort.key}`;
}

/** Next sort when a header is clicked: ascending, then descending. */
export function nextSort(current: TableSort, key: SortKey): TableSort {
  return current.key === key && current.direction === "asc" ? { key, direction: "desc" } : { key, direction: "asc" };
}

const text = (a: string | null, b: string | null) => {
  // Missing values always last.
  if (a === b) return 0;
  if (a === null || a === "") return 1;
  if (b === null || b === "") return -1;
  return a.localeCompare(b, "fr", { numeric: true });
};
const num = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);

/** Comparator of one column (ascending). */
function compare(key: SortKey, a: SiteIndexEntry, b: SiteIndexEntry): number {
  switch (key) {
    case "status":
      return b.statusRank - a.statusRank;
    case "code":
      return text(a.code, b.code);
    case "name":
      return text(a.name, b.name);
    case "city":
      return text(a.city, b.city);
    case "department":
      return text(a.departmentCode, b.departmentCode);
    case "region":
      return text(a.region, b.region);
    case "portfolio":
      return text(a.portfolio, b.portfolio);
    case "typology":
      return text(a.typology, b.typology);
    case "area":
      return num(a.totalArea, b.totalArea);
    case "deadline":
      return DEADLINE_RANK[a.leaseDeadlineBucket] - DEADLINE_RANK[b.leaseDeadlineBucket];
    case "completeness":
      return a.completeness - b.completeness;
    case "reasons":
      return a.reasons.length - b.reasons.length;
  }
}

/**
 * Sorted copy of the entries (ties broken by severity then name).
 */
export function sortEntries(entries: readonly SiteIndexEntry[], sort: TableSort): SiteIndexEntry[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const primary = compare(sort.key, a, b);
    // Missing values stay last whatever the direction.
    if (primary !== 0) {
      if (sort.key === "area" && (a.totalArea === null || b.totalArea === null)) return primary;
      return sign * primary;
    }
    return b.statusRank - a.statusRank || text(a.name, b.name);
  });
}
