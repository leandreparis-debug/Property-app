/**
 * Values available for each criterion, with their number of occurrences in
 * the index (not in the filtered result), sorted by French label — except
 * statuses (severity order) and deadlines (urgency order).
 */
import { COMPLIANCE_RULES, INACTIVE_REASON } from "../compliance";
import { DEADLINE_BUCKETS, DEADLINE_LABELS, type SiteIndexEntry } from "../site-index";
import { STATUS_META, STATUSES_BY_SEVERITY } from "@/lib/status";
import type { ListCriterion } from "./schema";

/** One option of a criterion. */
export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Options of every list criterion. */
export type FilterOptions = Record<ListCriterion, FilterOption[]>;

/** French label of a rule id. */
export function ruleLabel(id: string): string {
  if (id === INACTIVE_REASON.ruleId) return INACTIVE_REASON.labelFr;
  return COMPLIANCE_RULES.find((r) => r.id === id)?.labelFr ?? id;
}

function tally(values: Iterable<string | null>, label: (v: string) => string = (v) => v): FilterOption[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v !== null && v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, label: label(value), count })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/**
 * Builds the options of each criterion.
 * @param entries - Site index.
 */
export function buildFilterOptions(entries: readonly SiteIndexEntry[]): FilterOptions {
  const departments = new Map<string, string>();
  for (const e of entries) if (e.departmentCode) departments.set(e.departmentCode, e.departmentName ?? e.departmentCode);
  const statusCounts = tally(entries.map((e) => e.status));
  const deadlineCounts = tally(entries.map((e) => e.leaseDeadlineBucket));
  return {
    status: STATUSES_BY_SEVERITY.map((s) => ({ value: s, label: STATUS_META[s].label, count: statusCounts.find((o) => o.value === s)?.count ?? 0 })),
    region: tally(entries.map((e) => e.region)),
    department: tally(entries.map((e) => e.departmentCode), (code) => `${code} — ${departments.get(code) ?? code}`),
    portfolio: tally(entries.map((e) => e.portfolio)),
    bu: tally(entries.map((e) => e.occupyingBu)),
    typology: tally(entries.map((e) => e.typology)),
    operator: tally(entries.map((e) => e.logisticsOperator)),
    rule: tally(entries.flatMap((e) => [...new Set(e.reasons.map((r) => r.ruleId))]), ruleLabel),
    deadline: DEADLINE_BUCKETS.map((b) => ({ value: b, label: DEADLINE_LABELS[b], count: deadlineCounts.find((o) => o.value === b)?.count ?? 0 })),
  };
}

/** Label of a value of a criterion (chips). */
export function valueLabel(criterion: ListCriterion, value: string, options?: FilterOptions): string {
  if (criterion === "status") return STATUS_META[value as keyof typeof STATUS_META]?.label ?? value;
  if (criterion === "deadline") return DEADLINE_LABELS[value as keyof typeof DEADLINE_LABELS] ?? value;
  if (criterion === "rule") return ruleLabel(value);
  return options?.[criterion].find((o) => o.value === value)?.label ?? value;
}
