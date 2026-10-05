import type { Metadata } from "next";
import { Download, FolderArchive } from "lucide-react";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminCard";
import { ExportFreshnessNotice } from "@/components/admin/ExportFreshnessNotice";
import { JobStatusLabel } from "@/components/admin/JobStatusLabel";
import { RunJobButton } from "@/components/admin/RunJobButton";
import { RunSummary } from "@/components/admin/RunSummary";
import { JobTrigger } from "@/domain/enums";
import { formatBytes, formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { getEnv } from "@/lib/env";
import { requirePagePermission } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { getExportFreshness, getExports, getJobViews, getStorageUsage, RUN_HISTORY, type RunView } from "@/server/ops/overview";

export const metadata: Metadata = { title: "Exploitation" };

const triggerLabel = (t: string) => (JobTrigger.is(t) ? JobTrigger.label(t) : t);

function RunLine({ run }: { run: RunView }) {
  return (
    <tr className="border-t border-border align-top" data-run={run.id}>
      <td className="numeric py-1.5 pr-4 whitespace-nowrap">{formatDateTime(run.startedAt)}</td>
      <td className="py-1.5 pr-4">
        <JobStatusLabel status={run.status} />
      </td>
      <td className="numeric py-1.5 pr-4 whitespace-nowrap text-text-muted">{formatDuration(run.durationMs)}</td>
      <td className="py-1.5 pr-4 text-text-muted">{triggerLabel(run.trigger)}</td>
      <td className="py-1.5 pr-4 text-text-muted">{run.triggeredBy ?? "Système"}</td>
      <td className="max-w-md py-1.5 text-text-muted">{run.error ?? ""}</td>
    </tr>
  );
}

/**
 * Operations screen (`settings:manage`): scheduled jobs (last run, status,
 * duration, summary, next occurrence, last 30 runs, « Lancer maintenant »),
 * nightly exports with per-file download, export freshness, disk usage.
 */
export default async function OperationsPage() {
  const user = await requirePagePermission("settings:manage");
  const env = getEnv();
  const [jobs, freshness, exports, usage] = await Promise.all([getJobViews(), getExportFreshness(), getExports(), getStorageUsage()]);
  const canDownload = can(user.role, "export:read") && can(user.role, "finance:read");

  return (
    <>
      <AdminPageHeader
        title="Exploitation"
        description={
          env.OPS_SCHEDULER === "on"
            ? `Tâches quotidiennes à ${env.OPS_DAILY_AT} (heure de Paris).`
            : "Planificateur désactivé (OPS_SCHEDULER=off) : les tâches ne s'exécutent qu'à la demande."
        }
      />
      {freshness.stale && <ExportFreshnessNotice latest={freshness.latest?.createdAt ?? null} className="mb-6" />}

      <div className="flex flex-col gap-6">
        {jobs.map((job) => {
          const last = job.runs[0];
          return (
            <AdminCard key={job.name} title={job.labelFr} description={job.descriptionFr} actions={<RunJobButton job={job.name} label={job.labelFr} />} slot={`job-${job.name}`}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-text-muted">Dernière exécution</dt>
                  <dd className="numeric">{last ? formatDateTime(last.startedAt) : "Aucune"}</dd>
                  <dt className="text-text-muted">Statut</dt>
                  <dd data-slot="job-last-status">{last ? <JobStatusLabel status={last.status} /> : "—"}</dd>
                  <dt className="text-text-muted">Durée</dt>
                  <dd className="numeric">{formatDuration(last?.durationMs)}</dd>
                  <dt className="text-text-muted">Déclenchement</dt>
                  <dd>{last ? `${triggerLabel(last.trigger)}${last.triggeredBy ? ` — ${last.triggeredBy}` : ""}` : "—"}</dd>
                  <dt className="text-text-muted">Prochaine échéance</dt>
                  <dd className={job.nextRunAt ? "numeric" : "text-text-muted"}>{job.nextRunAt ? formatDateTime(job.nextRunAt) : job.daily ? "Planificateur désactivé" : "À la demande"}</dd>
                </dl>
                <div className="min-w-0 rounded-md border border-border bg-surface-2 p-3">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">Résumé de la dernière exécution</p>
                  {last?.error && <p className="mb-2 text-sm font-semibold text-text">{last.error}</p>}
                  {last?.summary ? <RunSummary summary={last.summary} /> : !last?.error && <p className="text-sm text-text-muted">—</p>}
                </div>
              </div>
              {job.runs.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-text-muted hover:text-text">
                    Historique ({job.runs.length} dernière{job.runs.length > 1 ? "s" : ""} exécution{job.runs.length > 1 ? "s" : ""}, {RUN_HISTORY} au plus)
                  </summary>
                  <table className="mt-2 w-full text-sm">
                    <caption className="sr-only">Historique des exécutions de {job.labelFr}</caption>
                    <thead>
                      <tr className="text-left text-xs text-text-muted">
                        <th scope="col" className="py-1 pr-4 font-medium">Début</th>
                        <th scope="col" className="py-1 pr-4 font-medium">Statut</th>
                        <th scope="col" className="py-1 pr-4 font-medium">Durée</th>
                        <th scope="col" className="py-1 pr-4 font-medium">Déclenchement</th>
                        <th scope="col" className="py-1 pr-4 font-medium">Par</th>
                        <th scope="col" className="py-1 font-medium">Erreur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.runs.map((run) => (
                        <RunLine key={run.id} run={run} />
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </AdminCard>
          );
        })}

        <AdminCard title="Exports nocturnes" description="Copies complètes des données (données financières comprises). Ce ne sont pas des sauvegardes de la base." slot="exports">
          {exports.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun export pour l&apos;instant.</p>
          ) : (
            <table className="w-full text-sm" data-slot="exports-table">
              <caption className="sr-only">Exports nocturnes, du plus récent au plus ancien</caption>
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="py-1 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-1 pr-4 text-right font-medium">Sites</th>
                  <th scope="col" className="py-1 pr-4 text-right font-medium">Taille</th>
                  <th scope="col" className="py-1 font-medium">Fichiers</th>
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.name} className="border-t border-border align-top" data-export={e.name}>
                    <td className="numeric py-2 pr-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderArchive className="size-4 text-text-muted" aria-hidden="true" />
                        {formatDateTime(e.createdAt)}
                      </span>
                      {!e.complete && <span className="block text-xs text-text-muted">Incomplet (sans manifeste)</span>}
                    </td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(e.manifest?.sites)}</td>
                    <td className="numeric py-2 pr-4 text-right whitespace-nowrap">{formatBytes(e.manifest?.files.reduce((s, f) => s + f.bytes, 0))}</td>
                    <td className="py-2">
                      {canDownload && e.manifest ? (
                        <ul className="flex flex-wrap gap-x-3 gap-y-1">
                          {[...e.manifest.files.map((f) => f.name), "manifest.json"].map((name) => (
                            <li key={name}>
                              <a href={`/api/admin/exports/${encodeURIComponent(e.name)}/${encodeURIComponent(name)}`} download className="inline-flex items-center gap-1 text-accent hover:underline">
                                <Download className="size-3.5" aria-hidden="true" />
                                {name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>

        <AdminCard title="Espace disque" description="Espace occupé par chaque dossier de STORAGE_ROOT. À surveiller : documents, exports et carte grossissent avec le temps." slot="storage-usage">
          {usage.length === 0 ? (
            <p className="text-sm text-text-muted">Dossier de stockage vide.</p>
          ) : (
            <table className="w-full max-w-xl text-sm">
              <caption className="sr-only">Espace occupé par dossier</caption>
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="py-1 pr-4 font-medium">Dossier</th>
                  <th scope="col" className="py-1 pr-4 text-right font-medium">Fichiers</th>
                  <th scope="col" className="py-1 text-right font-medium">Taille</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.name} className="border-t border-border">
                    <td className="py-1.5 pr-4 font-mono text-xs">{u.name}/</td>
                    <td className="numeric py-1.5 pr-4 text-right">{formatNumber(u.files)}</td>
                    <td className="numeric py-1.5 text-right">{formatBytes(u.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>
      </div>
    </>
  );
}
