/**
 * Input and output types of the compliance engine. The engine is PURE: it
 * receives the facts of one site and today's business date, never reads the
 * database and never stores its result.
 */
import type { ComplianceStatus } from "@/lib/status";
import type { NumericLike } from "../derived";

/** Lease facts used by the rules (dates are business dates, 00:00 UTC). */
export interface ComplianceLease {
  code: string | null;
  holdingEntity: string | null;
  endDate: Date | null;
  nextExitDate: Date | null;
  noticeDate: Date | null;
  noticePeriodMonths: number | null;
  renewalConditionsSigned: boolean | null;
}

/** Facts of one site evaluated by the compliance engine. */
export interface ComplianceSite {
  code: string;
  name: string;
  isActive: boolean | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  departmentCode: string | null;
  region: string | null;
  portfolio: string | null;
  typology: string | null;
  operatingMode: string | null;
  logisticsOperator: string | null;
  hasCoordinates: boolean;
  lease: ComplianceLease | null;
  technical: {
    surveyedTotalArea?: NumericLike;
    totalWarehouseArea?: NumericLike;
    socialOfficeArea?: NumericLike;
    landArea?: NumericLike;
    dockCount?: number | null;
  } | null;
  icpe: { holder: string | null; headingsCount: number } | null;
}

/** Severity of a rule (a rule never produces `ok` or `unknown`). */
export type RuleSeverity = "warning" | "critical";

/** Result of one rule. */
export interface RuleResult {
  triggered: boolean;
  /** Detail in French, e.g. « Arbitrage dépassé depuis le 12 mars 2026 ». */
  detailFr?: string;
}

/** A compliance rule. */
export interface ComplianceRule {
  id: string;
  severity: RuleSeverity;
  labelFr: string;
  evaluate(site: ComplianceSite, today: Date): RuleResult;
}

/** A triggered rule, as shown to the user. */
export interface ComplianceReason {
  ruleId: string;
  severity: RuleSeverity | "unknown";
  labelFr: string;
  detailFr: string | null;
}

/** Result of {@link evaluateSite}. */
export interface ComplianceEvaluation {
  status: ComplianceStatus;
  reasons: ComplianceReason[];
  /** Completeness score, 0–100 (integer). */
  completeness: number;
}
