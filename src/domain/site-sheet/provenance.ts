/**
 * Provenance of a displayed value: the last audited write of its field.
 */
import { formatDate } from "@/lib/format";

/** Last write of one field (from `audit_logs`). */
export interface FieldProvenance {
  /** ui | import | enrichment | system (AuditSource). */
  source: string;
  occurredAt: Date;
  /** Display name (or e-mail) of the author, when known. */
  actorName: string | null;
  batchId: string | null;
}

/** Short French date: « 28 sept. 2026 ». */
function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}

/**
 * French label of a provenance:
 * « Import du tableur — 28 sept. 2026 », « Saisie par Marie Dupont — 3 oct. 2026 »,
 * « Enrichissement (source publique) — … », « Système — … ».
 * @param p - Provenance (missing → « Origine inconnue »).
 */
export function resolveProvenanceLabel(p: FieldProvenance | null | undefined): string {
  if (!p) return "Origine inconnue";
  const date = Number.isNaN(p.occurredAt.getTime()) ? formatDate(null) : shortDate(p.occurredAt);
  switch (p.source) {
    case "import":
      return `Import du tableur — ${date}`;
    case "ui":
      return p.actorName ? `Saisie par ${p.actorName} — ${date}` : `Saisie manuelle — ${date}`;
    case "enrichment":
      return `Enrichissement (source publique) — ${date}`;
    default:
      return `Système — ${date}`;
  }
}
