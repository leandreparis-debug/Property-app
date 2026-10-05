import { formatDateTime } from "@/lib/format";
import { Notice } from "./Notice";

/** Props of {@link ExportFreshnessNotice}. */
export interface ExportFreshnessNoticeProps {
  /** Instant of the last successful export, or `null` when there is none. */
  latest: Date | null;
  className?: string;
}

/** « Le dernier export réussi date de plus de 36 heures » (or « aucun export »). */
export function ExportFreshnessNotice({ latest, className }: ExportFreshnessNoticeProps) {
  return (
    <Notice tone="warning" slot="export-stale" className={className} title={latest ? "Le dernier export réussi date de plus de 36 heures" : "Aucun export réussi"}>
      {latest ? `Dernier export réussi : ${formatDateTime(latest)}. ` : ""}
      Vérifier l&apos;historique de la tâche « Export nocturne » ci-dessous, puis la lancer manuellement si besoin (voir docs/exploitation.md).
    </Notice>
  );
}
