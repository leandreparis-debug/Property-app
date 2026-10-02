/**
 * Compliance status of a site. The computation rules arrive at step 6; this
 * module only defines the vocabulary, presentation and ordering.
 */
export const COMPLIANCE_STATUSES = ["ok", "warning", "critical", "unknown"] as const;

/** A site's compliance status. */
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

/** Visual emphasis: how loudly a status should speak in the interface. */
export type StatusEmphasis = "subtle" | "neutral" | "elevated" | "salient";

/** Presentation metadata for a status. */
export interface StatusMeta {
  /** French label, always displayed next to the color. */
  label: string;
  /** Name of the CSS design token holding the status color. */
  token: `--color-status-${ComplianceStatus}`;
  /** Tailwind background utility bound to the token (literal, so Tailwind can detect it). */
  bgClass: string;
  /** Emphasis level: `ok` is discreet, `critical` the most salient. */
  emphasis: StatusEmphasis;
  /** Severity rank used for sorting (higher = more severe). */
  severity: number;
}

/** Presentation metadata for every compliance status. */
export const STATUS_META: Readonly<Record<ComplianceStatus, StatusMeta>> = {
  critical: {
    label: "Critique",
    token: "--color-status-critical",
    bgClass: "bg-status-critical",
    emphasis: "salient",
    severity: 3,
  },
  warning: {
    label: "À surveiller",
    token: "--color-status-warning",
    bgClass: "bg-status-warning",
    emphasis: "elevated",
    severity: 2,
  },
  unknown: {
    label: "Non évalué",
    token: "--color-status-unknown",
    bgClass: "bg-status-unknown",
    emphasis: "neutral",
    severity: 1,
  },
  ok: {
    label: "Conforme",
    token: "--color-status-ok",
    bgClass: "bg-status-ok",
    emphasis: "subtle",
    severity: 0,
  },
};

/** Statuses ordered from most to least severe (legend / display order). */
export const STATUSES_BY_SEVERITY: readonly ComplianceStatus[] = [
  "critical",
  "warning",
  "unknown",
  "ok",
];

/**
 * Type guard for untrusted input.
 * @param value - Any value.
 * @returns `true` if `value` is a known compliance status.
 */
export function isComplianceStatus(value: unknown): value is ComplianceStatus {
  return typeof value === "string" && (COMPLIANCE_STATUSES as readonly string[]).includes(value);
}

/**
 * French label for a status.
 * @param status - Compliance status.
 * @returns The label, e.g. « Critique ».
 */
export function getStatusLabel(status: ComplianceStatus): string {
  return STATUS_META[status].label;
}

/**
 * Comparator for `Array.prototype.sort`, most severe first:
 * critical > warning > unknown > ok.
 *
 * @param a - First status.
 * @param b - Second status.
 * @returns A negative number if `a` is more severe than `b`, positive if less, 0 if equal.
 */
export function compareStatusSeverity(a: ComplianceStatus, b: ComplianceStatus): number {
  return STATUS_META[b].severity - STATUS_META[a].severity;
}
