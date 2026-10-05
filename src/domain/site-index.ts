/**
 * The SITE INDEX: one minimal entry per non-archived site, shared by the map,
 * the list, the search and the supervision (all filtering is done in the
 * browser on this < 200 entries array).
 *
 * Like the map DTO it carries NO amount, NO rent and NO exact lease date:
 * lease deadlines are only sent as a bucket computed on the server.
 */
import { addMonths, compareDateOnly } from "./dates";
import { arbitrationDate, type ArbitrationFields } from "./derived";
import type { ComplianceReason } from "./compliance/types";
import type { ComplianceStatus } from "@/lib/status";

/** Lease deadline buckets. */
export const DEADLINE_BUCKETS = ["overdue", "lt3m", "lt6m", "lt12m", "gt12m", "renewed", "unknown"] as const;

/** A lease deadline bucket. */
export type DeadlineBucket = (typeof DEADLINE_BUCKETS)[number];

/** French labels of the buckets. */
export const DEADLINE_LABELS: Readonly<Record<DeadlineBucket, string>> = {
  overdue: "Arbitrage dépassé",
  lt3m: "< 3 mois",
  lt6m: "< 6 mois",
  lt12m: "< 12 mois",
  gt12m: "> 12 mois",
  renewed: "Renouvelé",
  unknown: "Non renseigné",
};

/** Urgency rank of a bucket (sorting: most urgent first). */
export const DEADLINE_RANK: Readonly<Record<DeadlineBucket, number>> = {
  overdue: 0,
  lt3m: 1,
  lt6m: 2,
  lt12m: 3,
  gt12m: 4,
  unknown: 5,
  renewed: 6,
};

/** Lease facts needed for the bucket. */
export interface DeadlineLease extends ArbitrationFields {
  endDate?: Date | null;
  renewalConditionsSigned?: boolean | null;
}

/**
 * Lease deadline bucket.
 * - signed renewal conditions → `renewed`;
 * - reference date = computed arbitration date, else next exit date, else end date;
 * - no reference → `unknown`; before today → `overdue`; then < 3, < 6, < 12
 *   months, otherwise `gt12m` (each bound exclusive: exactly 3 months ahead is `lt6m`).
 * @param lease - Lease facts (business dates), or null.
 * @param today - Today's business date.
 */
export function leaseDeadlineBucket(lease: DeadlineLease | null | undefined, today: Date): DeadlineBucket {
  if (!lease) return "unknown";
  if (lease.renewalConditionsSigned === true) return "renewed";
  const reference = arbitrationDate(lease) ?? lease.nextExitDate ?? lease.endDate ?? null;
  if (!(reference instanceof Date)) return "unknown";
  if (compareDateOnly(reference, today) < 0) return "overdue";
  if (compareDateOnly(reference, addMonths(today, 3)) < 0) return "lt3m";
  if (compareDateOnly(reference, addMonths(today, 6)) < 0) return "lt6m";
  if (compareDateOnly(reference, addMonths(today, 12)) < 0) return "lt12m";
  return "gt12m";
}

/** External identifiers of a site (searchable). */
export interface SiteExternalIds {
  qlik: string[];
  al: string[];
  ramses: string[];
  leaseCode: string | null;
}

/** One entry of the site index. */
export interface SiteIndexEntry {
  id: string;
  code: string;
  name: string;
  city: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  region: string | null;
  /** WGS 84, or null when the site is not located. */
  lat: number | null;
  lon: number | null;
  portfolio: string | null;
  occupyingBu: string | null;
  typology: string | null;
  logisticsOperator: string | null;
  isActive: boolean;
  status: ComplianceStatus;
  statusRank: number;
  /** All the reasons, most severe first. */
  reasons: ComplianceReason[];
  completeness: number;
  /** Reference area (m²). */
  totalArea: number | null;
  leaseDeadlineBucket: DeadlineBucket;
  externalIds: SiteExternalIds;
}

/** Keys of an entry (used by the tests on the DTO). */
export const SITE_INDEX_KEYS = [
  "id", "code", "name", "city", "departmentCode", "departmentName", "region", "lat", "lon",
  "portfolio", "occupyingBu", "typology", "logisticsOperator", "isActive",
  "status", "statusRank", "reasons", "completeness", "totalArea", "leaseDeadlineBucket", "externalIds",
] as const satisfies readonly (keyof SiteIndexEntry)[];
