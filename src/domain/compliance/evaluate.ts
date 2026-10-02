/**
 * Evaluation of one site: status = highest severity among the triggered
 * rules, `ok` when none triggers; an inactive site is `unknown` (« Site
 * inactif ») without evaluating the other rules. Nothing is stored.
 */
import { compareStatusSeverity, type ComplianceStatus } from "@/lib/status";
import { completenessScore } from "./completeness";
import { COMPLIANCE_RULES } from "./rules";
import type { ComplianceEvaluation, ComplianceReason, ComplianceRule, ComplianceSite } from "./types";

/** Reason of an inactive site. */
export const INACTIVE_REASON: ComplianceReason = { ruleId: "SITE_INACTIVE", severity: "unknown", labelFr: "Site inactif", detailFr: null };

/**
 * Sorts reasons most severe first (stable: rule order within a severity).
 * @param reasons - Reasons to sort (not mutated).
 */
export function sortReasons(reasons: readonly ComplianceReason[]): ComplianceReason[] {
  return [...reasons].sort((a, b) => compareStatusSeverity(a.severity, b.severity));
}

/**
 * Evaluates a site.
 * @param site - Facts of the site.
 * @param today - Today's business date (injected: never read the clock here).
 * @param rules - Rules to apply (defaults to COMPLIANCE_RULES).
 */
export function evaluateSite(site: ComplianceSite, today: Date, rules: readonly ComplianceRule[] = COMPLIANCE_RULES): ComplianceEvaluation {
  const completeness = completenessScore(site);
  if (site.isActive === false) return { status: "unknown", reasons: [INACTIVE_REASON], completeness };

  const reasons: ComplianceReason[] = [];
  for (const rule of rules) {
    const result = rule.evaluate(site, today);
    if (result.triggered) reasons.push({ ruleId: rule.id, severity: rule.severity, labelFr: rule.labelFr, detailFr: result.detailFr ?? null });
  }
  const sorted = sortReasons(reasons);
  const status: ComplianceStatus = sorted[0]?.severity === "critical" ? "critical" : sorted.length > 0 ? "warning" : "ok";
  return { status, reasons: sorted, completeness };
}
