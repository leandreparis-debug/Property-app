/**
 * Pure filtering of the site index: AND between criteria, OR between the
 * values of a criterion. Free text ignores accents, case and hyphens.
 */
import { foldText } from "@/lib/text";
import type { SiteIndexEntry } from "../site-index";
import type { SiteFilters } from "./schema";

/** Searchable text of an entry (code, name, city, department, external ids). */
export function haystack(e: SiteIndexEntry): string {
  return foldText(
    [e.code, e.name, e.city, e.departmentCode, e.departmentName, ...e.externalIds.qlik, ...e.externalIds.al, ...e.externalIds.ramses, e.externalIds.leaseCode]
      .filter(Boolean)
      .join(" "),
  );
}

const inList = (list: readonly string[], value: string | null) => list.length === 0 || (value !== null && list.includes(value));

/**
 * Whether an entry matches the filters.
 * @param e - Entry.
 * @param f - Filters.
 * @param text - Precomputed haystack (optional).
 */
export function matchesFilters(e: SiteIndexEntry, f: SiteFilters, text?: string): boolean {
  if (!inList(f.status, e.status)) return false;
  if (!inList(f.region, e.region)) return false;
  if (!inList(f.department, e.departmentCode)) return false;
  if (!inList(f.portfolio, e.portfolio)) return false;
  if (!inList(f.bu, e.occupyingBu)) return false;
  if (!inList(f.typology, e.typology)) return false;
  if (!inList(f.operator, e.logisticsOperator)) return false;
  if (!inList(f.deadline, e.leaseDeadlineBucket)) return false;
  if (f.rule.length > 0 && !e.reasons.some((r) => f.rule.includes(r.ruleId))) return false;
  if (f.active === "active" && !e.isActive) return false;
  if (f.active === "inactive" && e.isActive) return false;
  if (f.completenessBelow !== null && !(e.completeness < f.completenessBelow)) return false;
  const q = foldText(f.q);
  if (q !== "") {
    const h = text ?? haystack(e);
    if (!q.split(" ").every((token) => h.includes(token))) return false;
  }
  return true;
}

/**
 * Entries matching the filters (order kept).
 * @param entries - Site index.
 * @param filters - Filters.
 */
export function applyFilters(entries: readonly SiteIndexEntry[], filters: SiteFilters): SiteIndexEntry[] {
  return entries.filter((e) => matchesFilters(e, filters));
}
