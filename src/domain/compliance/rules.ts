/**
 * Declarative compliance rules (V1). Each rule is a pure function of the
 * site facts and today's business date. Thresholds are grouped in
 * COMPLIANCE_THRESHOLDS; docs/compliance-rules.md describes every rule.
 *
 * Insufficient lease data never triggers a lease rule: the gap is reflected
 * by the completeness score instead.
 */
import { formatDate } from "@/lib/format";
import { addMonths, compareDateOnly, diffInDays } from "../dates";
import { arbitrationDate, referenceArea } from "../derived";
import { completenessScore } from "./completeness";
import type { ComplianceRule, ComplianceSite } from "./types";

/** Configurable thresholds. */
export const COMPLIANCE_THRESHOLDS = {
  /** A notice date closer than this (months) is imminent. */
  noticeImminentMonths: 3,
  /** An arbitration date closer than this (months) is soon. */
  arbitrationSoonMonths: 6,
  /** Minimum completeness (%) before LOW_COMPLETENESS triggers. */
  minCompleteness: 60,
} as const;

const signed = (site: ComplianceSite) => site.lease?.renewalConditionsSigned === true;
const before = (a: Date, b: Date) => compareDateOnly(a, b) < 0;
const days = (n: number) => `${n} jour${Math.abs(n) > 1 ? "s" : ""}`;
const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/** V1 rules, in display order within a severity. */
export const COMPLIANCE_RULES: readonly ComplianceRule[] = [
  {
    id: "LEASE_ARBITRATION_OVERDUE",
    severity: "critical",
    labelFr: "Arbitrage de bail dépassé",
    evaluate(site, today) {
      const arbitration = arbitrationDate(site.lease);
      if (!arbitration || signed(site) || !before(arbitration, today)) return { triggered: false };
      return { triggered: true, detailFr: `Arbitrage dépassé depuis le ${formatDate(arbitration)}` };
    },
  },
  {
    id: "LEASE_NOTICE_IMMINENT",
    severity: "critical",
    labelFr: "Préavis imminent",
    evaluate(site, today) {
      const notice = site.lease?.noticeDate ?? null;
      if (!notice || signed(site)) return { triggered: false };
      const limit = addMonths(today, COMPLIANCE_THRESHOLDS.noticeImminentMonths);
      if (before(notice, today) || !before(notice, limit)) return { triggered: false };
      const left = diffInDays(today, notice);
      return { triggered: true, detailFr: `Date de préavis le ${formatDate(notice)} (${left === 0 ? "aujourd'hui" : `dans ${days(left)}`})` };
    },
  },
  {
    id: "LEASE_END_PASSED",
    severity: "critical",
    labelFr: "Bail échu",
    evaluate(site, today) {
      const end = site.lease?.endDate ?? null;
      const exit = site.lease?.nextExitDate ?? null;
      if (!end || !exit || signed(site) || !before(end, today) || !before(exit, today)) return { triggered: false };
      return { triggered: true, detailFr: `Fin de bail le ${formatDate(end)} et prochaine sortie le ${formatDate(exit)} dépassées` };
    },
  },
  {
    id: "LEASE_ARBITRATION_SOON",
    severity: "warning",
    labelFr: "Arbitrage de bail à préparer",
    evaluate(site, today) {
      const arbitration = arbitrationDate(site.lease);
      if (!arbitration) return { triggered: false };
      const limit = addMonths(today, COMPLIANCE_THRESHOLDS.arbitrationSoonMonths);
      if (before(arbitration, today) || !before(arbitration, limit)) return { triggered: false };
      const left = diffInDays(today, arbitration);
      return { triggered: true, detailFr: `Arbitrage le ${formatDate(arbitration)} (${left === 0 ? "aujourd'hui" : `dans ${days(left)}`})` };
    },
  },
  {
    id: "CRITICAL_DATA_MISSING",
    severity: "warning",
    labelFr: "Données essentielles manquantes",
    evaluate(site) {
      const missing = [
        blank(site.addressLine) ? "adresse" : null,
        blank(site.city) ? "ville" : null,
        referenceArea(site.technical) === null ? "surface de référence" : null,
        blank(site.icpe?.holder) ? "détenteur ICPE" : null,
      ].filter((m): m is string => m !== null);
      return missing.length === 0 ? { triggered: false } : { triggered: true, detailFr: `Manquant : ${missing.join(", ")}` };
    },
  },
  {
    id: "LOW_COMPLETENESS",
    severity: "warning",
    labelFr: "Fiche incomplète",
    evaluate(site) {
      const score = completenessScore(site);
      return score >= COMPLIANCE_THRESHOLDS.minCompleteness
        ? { triggered: false }
        : { triggered: true, detailFr: `Complétude ${score} % (minimum ${COMPLIANCE_THRESHOLDS.minCompleteness} %)` };
    },
  },
];
