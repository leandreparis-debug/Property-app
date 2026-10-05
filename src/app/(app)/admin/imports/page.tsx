import type { Metadata } from "next";
import { Download, Lock } from "lucide-react";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminCard";
import { ImportLockControl } from "@/components/admin/ImportLockControl";
import { Notice } from "@/components/admin/Notice";
import { ImportBatchStatus } from "@/domain/enums";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { hasSuccessfulImport, listImportRuns } from "@/server/import/history";
import { IMPORT_LOCKED_MESSAGE, isImportLocked } from "@/server/settings";

export const metadata: Metadata = { title: "Imports" };

const STATUS_FR: Readonly<Record<string, string>> = { SUCCEEDED: "Réussi", PARTIAL: "Partiel", FAILED: "Échec", RUNNING: "En cours" };

/**
 * Imports (`import:run`): history of the real imports and simulations with
 * their reports, and the import lock (`settings:manage`). Imports are run
 * from the command line only.
 */
export default async function ImportsPage() {
  const user = await requirePagePermission("import:run");
  const [runs, locked, succeeded] = await Promise.all([listImportRuns(), isImportLocked(), hasSuccessfulImport()]);
  const canLock = can(user.role, "settings:manage");

  return (
    <>
      <AdminPageHeader
        title="Imports"
        description={
          <>
            Historique des imports du tableur. L&apos;import se lance uniquement en ligne de commande : <code className="font-mono text-xs">pnpm import:spreadsheet --dry-run</code> d&apos;abord.
          </>
        }
        actions={canLock ? <ImportLockControl locked={locked} /> : undefined}
      />
      {locked && (
        <div role="status" data-slot="import-locked-banner" className="mb-6 flex items-center gap-3 rounded-md border border-border-strong bg-surface-3 px-4 py-3 text-sm font-semibold text-text">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {IMPORT_LOCKED_MESSAGE}
        </div>
      )}
      {!locked && succeeded && (
        <Notice tone="info" slot="import-lock-invite" className="mb-6" title="Import validé ? Verrouillez-le.">
          Au moins un import réel a réussi. Une fois les données vérifiées, verrouiller l&apos;import empêche qu&apos;un nouvel import du tableur n&apos;écrase les corrections faites dans l&apos;application.
          {!canLock && " Le verrou se pose par un détenteur de la permission settings:manage."}
        </Notice>
      )}

      <AdminCard title="Historique" description="Imports réels et simulations, du plus récent au plus ancien." slot="imports-history">
        {runs.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun import pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-slot="imports-table">
              <caption className="sr-only">Imports du tableur</caption>
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="py-1.5 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Type</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Acteur</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Fichier</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Statut</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Lignes</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Créés</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Modifiés</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Rejetés</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Préservés</th>
                  <th scope="col" className="py-1.5 font-medium">Rapports</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top" data-run={r.id} data-mode={r.mode}>
                    <td className="numeric py-2 pr-4 whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                    <td className="py-2 pr-4">{r.mode === "import" ? <span className="font-semibold">Import réel</span> : <span className="text-text-muted">Simulation</span>}</td>
                    <td className="py-2 pr-4 text-text-muted">{r.actor ?? "—"}</td>
                    <td className="max-w-56 truncate py-2 pr-4" title={r.file ?? undefined}>
                      {r.file ?? "—"}
                    </td>
                    <td className="py-2 pr-4">{ImportBatchStatus.is(r.status) ? ImportBatchStatus.label(r.status) : (STATUS_FR[r.status] ?? r.status)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.counters?.rowsRead)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.counters?.sitesCreated)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.counters?.sitesUpdated)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.counters?.rowsRejected)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.counters?.preservedFields)}</td>
                    <td className="py-2">
                      <ul className="flex flex-wrap gap-x-3 gap-y-1">
                        {r.files.map((f) => (
                          <li key={f}>
                            <a href={`/api/admin/imports/${encodeURIComponent(r.id)}/${encodeURIComponent(f)}`} download className="inline-flex items-center gap-1 text-accent hover:underline">
                              <Download className="size-3.5" aria-hidden="true" />
                              {f}
                            </a>
                          </li>
                        ))}
                        {r.files.length === 0 && <li className="text-text-muted">—</li>}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </>
  );
}
