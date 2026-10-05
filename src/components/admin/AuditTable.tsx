import Link from "next/link";
import { Lock } from "lucide-react";
import { auditQuery, auditValueText, entityLabel, type AuditFilters } from "@/domain/audit/view";
import { AuditAction, AuditSource } from "@/domain/enums";
import { formatDateTime } from "@/lib/format";
import type { AuditRow } from "@/server/audit/journal";

/** Props of {@link AuditTable}. */
export interface AuditTableProps {
  rows: readonly AuditRow[];
  /** Current filters (a batch link keeps them and adds the batch). */
  filters: AuditFilters;
}

function Value({ json, masked }: { json: string | null; masked: boolean }) {
  const text = auditValueText(json);
  const isMasked = masked && text.startsWith("Masqué");
  return (
    <span title={text.length > 80 ? text : undefined} className="line-clamp-3 break-words">
      {isMasked && <Lock className="mr-1 inline size-3.5 align-[-2px] text-text-muted" aria-hidden="true" />}
      {text}
    </span>
  );
}

/**
 * Lines of the audit journal: date, actor, source, entity (action, site),
 * field (registry label), old and new values (masked financial values
 * marked by a padlock), reason, batch (link filtering on the batch).
 */
export function AuditTable({ rows, filters }: AuditTableProps) {
  return (
    <table className="w-full min-w-[1240px] table-fixed text-sm" data-slot="audit-table">
      <caption className="sr-only">Journal d&apos;audit, du plus récent au plus ancien</caption>
      <colgroup>
        <col className="w-32" />
        <col className="w-40" />
        <col className="w-44" />
        <col className="w-40" />
        <col />
        <col />
        <col className="w-44" />
      </colgroup>
      <thead className="bg-surface-2">
        <tr className="text-left text-xs text-text-muted">
          <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Acteur et source</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Entité</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Champ</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Ancienne valeur</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Nouvelle valeur</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Motif et lot</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-8 text-center text-text-muted">
              Aucune ligne ne correspond aux filtres.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id.toString()} className="border-t border-border align-top" data-audit-id={r.id.toString()} data-masked={r.masked || undefined}>
            <td className="numeric px-3 py-2 text-xs text-text-muted">{formatDateTime(r.occurredAt)}</td>
            <td className="px-3 py-2">
              <span className="block truncate" title={r.actorLabel}>
                {r.actorLabel}
              </span>
              <span className="block text-xs text-text-muted">{AuditSource.is(r.source) ? AuditSource.label(r.source) : r.source}</span>
            </td>
            <td className="px-3 py-2">
              <span className="block text-xs text-text-muted">{AuditAction.is(r.action) ? AuditAction.label(r.action) : r.action}</span>
              <span className="block">{entityLabel(r.entityType)}</span>
              {r.siteCode && r.siteId && (
                <Link href={`/sites/${r.siteId}`} className="font-mono text-xs text-accent hover:underline">
                  {r.siteCode}
                </Link>
              )}
            </td>
            <td className="px-3 py-2 break-words" title={r.field ?? undefined}>
              {r.fieldLabel}
            </td>
            <td className="px-3 py-2 text-text-muted">
              <Value json={r.beforeValue} masked={r.masked} />
            </td>
            <td className="px-3 py-2">
              <Value json={r.afterValue} masked={r.masked} />
            </td>
            <td className="px-3 py-2">
              {r.comment && <span className="block break-words text-text-muted">{r.comment}</span>}
              {r.batchId && (
                <Link href={`/admin/audit?${auditQuery({ ...filters, batch: r.batchId })}`} className="block truncate font-mono text-xs text-accent hover:underline" title={`Filtrer sur le lot ${r.batchId}`}>
                  {r.batchId}
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
