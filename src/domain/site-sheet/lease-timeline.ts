/**
 * Milestones of the lease timeline (« frise du bail »): initial effect, last
 * amendment, notice, computed arbitration, next exit, end of lease. Missing
 * milestones are omitted; nothing is stored.
 */
import { arbitrationDate } from "../derived";
import type { ComplianceReason } from "../compliance/types";

/** Identifier of a milestone, in chronological intent. */
export type LeaseMilestoneId = "initialEffective" | "lastAmendment" | "notice" | "arbitration" | "nextExit" | "end";

/** One milestone. */
export interface LeaseMilestone {
  id: LeaseMilestoneId;
  labelFr: string;
  /** Business date (00:00 UTC). */
  date: Date;
  /** Strictly before today: rendered dimmed. */
  past: boolean;
  /**
   * Only for the arbitration milestone: a lease rule is triggered, so it is
   * outlined with the status color. Never true otherwise.
   */
  flagged: boolean;
}

/** Lease dates used by the timeline. */
export interface TimelineLease {
  initialEffectiveDate: Date | null;
  lastAmendmentDate: Date | null;
  noticeDate: Date | null;
  noticePeriodMonths: number | null;
  nextExitDate: Date | null;
  endDate: Date | null;
}

const LABELS: Readonly<Record<LeaseMilestoneId, string>> = {
  initialEffective: "Effet du bail initial",
  lastAmendment: "Dernier avenant",
  notice: "Préavis",
  arbitration: "Arbitrage",
  nextExit: "Prochaine sortie",
  end: "Fin de bail",
};

/** Whether one of the reasons comes from a lease rule. */
export function hasLeaseRuleTriggered(reasons: readonly Pick<ComplianceReason, "ruleId">[]): boolean {
  return reasons.some((r) => r.ruleId.startsWith("LEASE_"));
}

/**
 * Milestones of a lease, ascending by date (ties keep the lease order).
 * @param lease - Lease dates (missing lease → no milestone).
 * @param today - Today's business date.
 * @param reasons - Compliance reasons of the site (to flag the arbitration).
 */
export function leaseMilestones(lease: TimelineLease | null, today: Date, reasons: readonly Pick<ComplianceReason, "ruleId">[] = []): LeaseMilestone[] {
  if (!lease) return [];
  const flagged = hasLeaseRuleTriggered(reasons);
  const candidates: [LeaseMilestoneId, Date | null][] = [
    ["initialEffective", lease.initialEffectiveDate],
    ["lastAmendment", lease.lastAmendmentDate],
    ["notice", lease.noticeDate],
    ["arbitration", arbitrationDate(lease)],
    ["nextExit", lease.nextExitDate],
    ["end", lease.endDate],
  ];
  return candidates
    .flatMap(([id, date]) =>
      date ? [{ id, labelFr: LABELS[id], date, past: date.getTime() < today.getTime(), flagged: id === "arbitration" && flagged }] : [],
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Time range drawn by the timeline: every milestone and today, with a margin
 * of 4 % on each side (at least 60 days).
 * @returns `[start, end]` in epoch ms, or `null` without milestones.
 */
export function timelineRange(milestones: readonly LeaseMilestone[], today: Date): [number, number] | null {
  if (milestones.length === 0) return null;
  const times = [...milestones.map((m) => m.date.getTime()), today.getTime()];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const margin = Math.max((max - min) * 0.04, 60 * 86_400_000);
  return [min - margin, max + margin];
}

/** Placement of one milestone label. */
export interface LabelPlacement {
  /** 0: row above the axis, 1: row below. */
  row: 0 | 1;
  /** Horizontal centre of the label (may differ from the milestone: a leader line joins them). */
  x: number;
}

/**
 * Places milestone labels on two rows (above / below the axis) so that labels
 * of the same row are at least `minGap` apart. Greedy, left to right: each
 * label goes to the row where it needs the smallest shift (row above on a
 * tie); a label is shifted to the right only when both rows are taken, then
 * the rows are pulled back inside `[minX, maxX]` from the right.
 *
 * @param xs - Milestone positions, ascending.
 * @param minGap - Minimum distance between two label centres of one row.
 * @param bounds - Allowed range of label centres.
 * @returns One placement per milestone, in the same order.
 */
export function layoutMilestoneLabels(xs: readonly number[], minGap: number, bounds: { minX: number; maxX: number }): LabelPlacement[] {
  const last: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const out: LabelPlacement[] = xs.map((x) => {
    const wanted = Math.max(x, bounds.minX);
    const above: LabelPlacement = { row: 0, x: Math.max(wanted, last[0] + minGap) };
    const below: LabelPlacement = { row: 1, x: Math.max(wanted, last[1] + minGap) };
    const best = below.x < above.x ? below : above;
    last[best.row] = best.x;
    return best;
  });
  // Pull each row back inside the right bound, keeping the spacing.
  for (const row of [0, 1] as const) {
    let limit = bounds.maxX;
    for (let i = out.length - 1; i >= 0; i--) {
      const p = out[i]!;
      if (p.row !== row) continue;
      p.x = Math.min(p.x, limit);
      limit = p.x - minGap;
    }
  }
  return out;
}
