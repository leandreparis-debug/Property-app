/**
 * Pure indicators of the supervision view (committee), computed in the
 * browser on the FILTERED site index.
 */
import { COMPLIANCE_STATUSES, STATUSES_BY_SEVERITY, type ComplianceStatus } from "@/lib/status";
import { DEADLINE_BUCKETS, DEADLINE_RANK, type DeadlineBucket, type SiteIndexEntry } from "./site-index";

/** Share of a status. */
export interface StatusShare {
  status: ComplianceStatus;
  count: number;
  /** Percentage, rounded so that the shares total exactly 100 (or 0 when empty). */
  pct: number;
}

/** Sites of one region per status. */
export interface RegionRow {
  region: string;
  counts: Record<ComplianceStatus, number>;
  total: number;
}

/** Indicators of the supervision view. */
export interface SupervisionStats {
  total: number;
  shares: StatusShare[];
  /** Leases whose arbitration is overdue or due within 6 months. */
  leaseAlerts: number;
  /** Average completeness (0–100, rounded), null when empty. */
  averageCompleteness: number | null;
  /** Sum of the reference areas (m²). */
  totalArea: number;
  /** Critical then warning sites, by severity then deadline urgency then name. */
  anomalies: SiteIndexEntry[];
  regions: RegionRow[];
  deadlines: { bucket: DeadlineBucket; count: number }[];
}

/**
 * Rounded percentages totalling 100 (largest remainder method).
 * @param counts - Counts.
 */
export function roundedPercentages(counts: readonly number[]): number[] {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const floors = exact.map(Math.floor);
  let rest = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]!++;
    rest--;
  }
  return floors;
}

const emptyCounts = () => Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, 0])) as Record<ComplianceStatus, number>;

/**
 * Computes the indicators.
 * @param entries - Filtered site index.
 */
export function computeSupervision(entries: readonly SiteIndexEntry[]): SupervisionStats {
  const counts = emptyCounts();
  for (const e of entries) counts[e.status]++;
  const pcts = roundedPercentages(STATUSES_BY_SEVERITY.map((s) => counts[s]));
  const shares = STATUSES_BY_SEVERITY.map((status, i) => ({ status, count: counts[status], pct: pcts[i] ?? 0 }));

  const regions = new Map<string, RegionRow>();
  for (const e of entries) {
    const key = e.region ?? "Région non renseignée";
    const row = regions.get(key) ?? { region: key, counts: emptyCounts(), total: 0 };
    row.counts[e.status]++;
    row.total++;
    regions.set(key, row);
  }

  const deadlineCounts = new Map<DeadlineBucket, number>();
  for (const e of entries) deadlineCounts.set(e.leaseDeadlineBucket, (deadlineCounts.get(e.leaseDeadlineBucket) ?? 0) + 1);

  return {
    total: entries.length,
    shares,
    leaseAlerts: entries.filter((e) => ["overdue", "lt3m", "lt6m"].includes(e.leaseDeadlineBucket)).length,
    averageCompleteness: entries.length === 0 ? null : Math.round(entries.reduce((s, e) => s + e.completeness, 0) / entries.length),
    totalArea: entries.reduce((s, e) => s + (e.totalArea ?? 0), 0),
    anomalies: entries
      .filter((e) => e.status === "critical" || e.status === "warning")
      .sort((a, b) => b.statusRank - a.statusRank || DEADLINE_RANK[a.leaseDeadlineBucket] - DEADLINE_RANK[b.leaseDeadlineBucket] || a.name.localeCompare(b.name, "fr")),
    regions: [...regions.values()].sort((a, b) => b.counts.critical - a.counts.critical || b.total - a.total || a.region.localeCompare(b.region, "fr")),
    deadlines: DEADLINE_BUCKETS.map((bucket) => ({ bucket, count: deadlineCounts.get(bucket) ?? 0 })),
  };
}
