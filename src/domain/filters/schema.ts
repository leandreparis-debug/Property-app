/**
 * Site filters shared by the map, the list and the supervision. The state
 * lives in the URL (see url.ts); unknown values are ignored silently.
 */
import { z } from "zod";
import { COMPLIANCE_STATUSES, type ComplianceStatus } from "@/lib/status";
import { DEADLINE_BUCKETS, type DeadlineBucket } from "../site-index";

/** Active filter on the operating state. */
export const ACTIVE_VALUES = ["all", "active", "inactive"] as const;
export type ActiveFilter = (typeof ACTIVE_VALUES)[number];

/** Filters of the site views. Lists: OR between values; criteria: AND. */
export interface SiteFilters {
  status: ComplianceStatus[];
  region: string[];
  department: string[];
  portfolio: string[];
  bu: string[];
  typology: string[];
  operator: string[];
  /** Rule identifiers (reasons). */
  rule: string[];
  deadline: DeadlineBucket[];
  active: ActiveFilter;
  /** Keep sites whose completeness is strictly below this value (0–100). */
  completenessBelow: number | null;
  /** Free text (code, name, city, department, external ids). */
  q: string;
}

/** List criteria (the order is the URL order). */
export const LIST_CRITERIA = ["status", "region", "department", "portfolio", "bu", "typology", "operator", "rule", "deadline"] as const;
export type ListCriterion = (typeof LIST_CRITERIA)[number];

/** Short URL parameter of each criterion. */
export const FILTER_PARAMS: Readonly<Record<ListCriterion | "active" | "completenessBelow" | "q", string>> = {
  status: "status",
  region: "region",
  department: "dep",
  portfolio: "portfolio",
  bu: "bu",
  typology: "typo",
  operator: "operator",
  rule: "rule",
  deadline: "deadline",
  active: "active",
  completenessBelow: "compl",
  q: "q",
};

/** French label of each criterion (chips, panel). */
export const CRITERION_LABELS: Readonly<Record<keyof SiteFilters, string>> = {
  status: "Statut",
  region: "Région",
  department: "Département",
  portfolio: "Portefeuille",
  bu: "BU occupante",
  typology: "Typologie",
  operator: "Exploitant",
  rule: "Raison",
  deadline: "Échéance",
  active: "Activité",
  completenessBelow: "Complétude",
  q: "Recherche",
};

/** Filters with no criterion (defaults). */
export const EMPTY_FILTERS: SiteFilters = {
  status: [],
  region: [],
  department: [],
  portfolio: [],
  bu: [],
  typology: [],
  operator: [],
  rule: [],
  deadline: [],
  active: "all",
  completenessBelow: null,
  q: "",
};

const freeValue = z.string().trim().min(1).max(200);

/** Validation of one value of each list criterion (invalid values are dropped). */
export const VALUE_SCHEMAS: Readonly<Record<ListCriterion, z.ZodType>> = {
  status: z.enum(COMPLIANCE_STATUSES),
  region: freeValue,
  department: z.string().trim().regex(/^(\d{2,3}|2[AB])$/i).transform((v) => v.toUpperCase()),
  portfolio: freeValue,
  bu: freeValue,
  typology: freeValue,
  operator: freeValue,
  rule: z.string().regex(/^[A-Z][A-Z0-9_]{2,59}$/),
  deadline: z.enum(DEADLINE_BUCKETS),
};

/** Scalar criteria. */
export const activeSchema = z.enum(ACTIVE_VALUES);
export const completenessSchema = z.coerce.number().int().min(0).max(100);
export const querySchema = z.string().max(200);

/** Maximum number of values kept per criterion. */
export const MAX_VALUES = 50;

/** Number of active criteria (the badge of the « Filtres » button). */
export function activeCriteriaCount(filters: SiteFilters): number {
  let n = LIST_CRITERIA.filter((c) => filters[c].length > 0).length;
  if (filters.active !== "all") n++;
  if (filters.completenessBelow !== null) n++;
  if (filters.q.trim() !== "") n++;
  return n;
}
