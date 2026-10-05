import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminCard";
import { DivergenceReview } from "@/components/admin/DivergenceReview";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { ENRICHMENT_TARGETS } from "@/domain/enrichment-format";
import { DivergenceStatus, ImportBatchStatus } from "@/domain/enums";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/current-user";
import { divergenceProviders, listDivergences, listEnrichmentRuns, targetLabel } from "@/server/enrichment/divergences";

export const metadata: Metadata = { title: "Enrichissement" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const label = "text-xs font-medium text-text-muted";

/**
 * Enrichment (`enrichment:apply`): history of the applied bundles and review
 * of the divergences (filters in the URL; « À examiner » by default). No
 * bundle upload from the interface: `pnpm enrichment:apply`.
 */
export default async function EnrichmentPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePagePermission("enrichment:apply");
  const params = await searchParams;
  const status = one(params.status) === "all" ? "" : DivergenceStatus.is(one(params.status)) ? one(params.status) : "open";
  const filters = { site: one(params.site).slice(0, 100), target: one(params.target), provider: one(params.provider), status };
  const [runs, divergences, providers] = await Promise.all([listEnrichmentRuns(), listDivergences(filters), divergenceProviders()]);

  return (
    <>
      <AdminPageHeader
        title="Enrichissement"
        description={
          <>
            Données publiques appliquées par <code className="font-mono text-xs">pnpm enrichment:apply</code> : seuls les champs vides sont remplis, une valeur différente devient une divergence à examiner ici.
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <AdminCard title="Divergences" description="Valeur actuelle et valeur publique proposée côte à côte." slot="divergences">
          <form method="get" role="search" aria-label="Filtrer les divergences" className="mb-4 flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <label htmlFor="div-site" className={label}>Site (code ou nom)</label>
              <input id="div-site" name="site" defaultValue={filters.site} maxLength={100} className={`${INPUT_CLASS} w-52`} />
            </div>
            <div className="grid gap-1">
              <label htmlFor="div-target" className={label}>Champ</label>
              <select id="div-target" name="target" defaultValue={filters.target} className={`${INPUT_CLASS} w-56`}>
                <option value="">Tous</option>
                {ENRICHMENT_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {targetLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="div-provider" className={label}>Source</label>
              <select id="div-provider" name="provider" defaultValue={filters.provider} className={`${INPUT_CLASS} w-44`}>
                <option value="">Toutes</option>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="div-status" className={label}>Statut</label>
              <select id="div-status" name="status" defaultValue={status || "all"} className={`${INPUT_CLASS} w-56`}>
                <option value="all">Tous</option>
                {DivergenceStatus.values.map((s) => (
                  <option key={s} value={s}>
                    {DivergenceStatus.label(s)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              <Search aria-hidden="true" />
              Filtrer
            </Button>
            <Link href="/admin/enrichment" className="px-2 py-2 text-sm text-text-muted hover:text-text">
              Réinitialiser
            </Link>
          </form>
          <DivergenceReview
            items={divergences.map((d) => ({
              id: d.id,
              siteId: d.siteId,
              siteCode: d.siteCode,
              siteName: d.siteName,
              siteArchived: d.siteArchived,
              targetLabel: d.targetLabel,
              adoptable: d.adoptable,
              currentValue: d.currentValue,
              proposedValue: d.proposedValue,
              provider: d.provider,
              evidence: d.evidence,
              status: d.status,
              createdAt: d.createdAt.toISOString(),
              resolvedBy: d.resolvedBy,
              resolutionComment: d.resolutionComment,
            }))}
          />
        </AdminCard>

        <AdminCard title="Paquets appliqués" description="Historique des applications d'un paquet d'enrichissement." slot="enrichment-history">
          {runs.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun paquet appliqué pour l&apos;instant.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Paquets d&apos;enrichissement appliqués</caption>
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="py-1.5 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Acteur</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Fichier</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Statut</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Champs remplis</th>
                  <th scope="col" className="py-1.5 pr-4 text-right font-medium">Divergences</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Ignorés</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="numeric py-2 pr-4 whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                    <td className="py-2 pr-4 text-text-muted">{r.actor ?? "—"}</td>
                    <td className="py-2 pr-4">{r.file ?? "—"}</td>
                    <td className="py-2 pr-4">{ImportBatchStatus.is(r.status) ? ImportBatchStatus.label(r.status) : r.status}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.filled)}</td>
                    <td className="numeric py-2 pr-4 text-right">{formatNumber(r.divergences)}</td>
                    <td className="numeric py-2 text-right">{formatNumber(r.ignored)}</td>
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
