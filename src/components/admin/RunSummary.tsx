import { formatBytes, formatNumber } from "@/lib/format";

/** French labels of the summary keys returned by the jobs. */
const LABELS: Readonly<Record<string, string>> = {
  folder: "Dossier",
  sites: "Sites",
  files: "Fichiers",
  bytes: "Taille",
  auditLines: "Lignes d'audit exportées",
  deletedExports: "Exports supprimés (rétention)",
  orphanTmpRemoved: "Dossiers temporaires supprimés",
  sessionsDeleted: "Sessions supprimées",
  graceDays: "Délai avant suppression (jours)",
  rateLimiterKeysTracked: "Adresses suivies (limitation des tentatives)",
  inTrash: "Fichiers dans la corbeille",
  erased: "Fichiers effacés",
  bytesFreed: "Espace libéré",
  missing: "Fichiers déjà absents du disque",
  retentionDays: "Rétention (jours)",
};

const BYTE_KEYS = new Set(["bytes", "bytesFreed"]);

function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return BYTE_KEYS.has(key) ? formatBytes(value) : formatNumber(value);
  if (Array.isArray(value)) return value.length === 0 ? "aucun" : value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "oui" : "non";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Props of {@link RunSummary}. */
export interface RunSummaryProps {
  summary: Record<string, unknown>;
}

/** Summary of a job run as a definition list (French labels). */
export function RunSummary({ summary }: RunSummaryProps) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {Object.entries(summary).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-text-muted">{LABELS[key] ?? key}</dt>
          <dd className="numeric min-w-0 break-words text-text">{valueText(key, value)}</dd>
        </div>
      ))}
    </dl>
  );
}
