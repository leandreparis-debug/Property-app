import { Archive, PauseCircle } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status/StatusBadge";
import { APP_NAME } from "@/config/app";
import { ExternalSystem } from "@/domain/enums";
import { resolveDepartment } from "@/domain/geo";
import { EMPTY_VALUE, formatDate, formatSurface } from "@/lib/format";
import { STATUS_META } from "@/lib/status";
import type { SiteDetail } from "@/server/sites/detail";
import { ArchiveControls } from "@/components/editing/ArchiveControls";
import { EmptyValue } from "./FieldList";
import { ReasonList } from "./panels";
import { SheetActions, SheetBreadcrumb, SiblingNavigation } from "./SheetNavigation";

function Landmark({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{value ?? <EmptyValue />}</dd>
    </div>
  );
}

/**
 * Header of the site sheet: breadcrumb, name, code and external ids, status
 * with every reason, archived / inactive banners, landmarks, actions and
 * previous / next navigation. `preview` is the map preview (top right).
 */
export function SiteHeader({ detail, canArchive, canAudit = false, preview, printedOn }: { detail: SiteDetail; canArchive: boolean; canAudit?: boolean; preview: ReactNode; printedOn: Date }) {
  const { site, evaluation } = detail;
  const department = resolveDepartment(site.departmentCode);
  const status = evaluation.status;
  return (
    <header className="space-y-4" data-slot="site-header">
      <p className="hidden text-xs print:block" data-slot="print-header">
        {APP_NAME} — Fiche {site.name} ({site.code}) — imprimée le {formatDate(printedOn)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SheetBreadcrumb name={site.name} />
        <SiblingNavigation siteId={site.id} />
      </div>

      {site.archivedAt && (
        <div role="note" data-slot="archived-banner" className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm">
          <Archive className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          Site archivé le {formatDate(site.archivedAt)} : il n&apos;apparaît plus sur la carte, dans la liste ni dans la recherche ; la fiche est en lecture seule.
          {canArchive && (
            <span className="ml-auto print:hidden">
              <ArchiveControls siteId={site.id} name={site.name} archived variant="button" />
            </span>
          )}
        </div>
      )}
      {site.isActive === false && (
        <div role="note" data-slot="inactive-banner" className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm">
          <PauseCircle className="size-4 text-text-muted" aria-hidden="true" />
          Site inactif : les règles de conformité ne sont pas évaluées.
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight" data-slot="site-name">
              {site.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-text-muted">
              <span data-slot="site-code" className="text-text">
                {site.code}
              </span>
              {detail.externalIds.map((e) => (
                <span key={`${e.system}-${e.value}`}>
                  <span className="text-text-muted">{ExternalSystem.is(e.system) ? ExternalSystem.label(e.system) : e.system} </span>
                  {e.value}
                </span>
              ))}
              {detail.lease?.code && (
                <span>
                  <span className="text-text-muted">Bail </span>
                  {detail.lease.code}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <div className="print:hidden">
              <StatusBadge status={status} />
            </div>
            <p className="hidden text-sm font-medium print:block">Statut : {STATUS_META[status].label}</p>
            <div className="min-w-0 flex-1">
              <ReasonList detail={detail} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" data-slot="landmarks">
            <Landmark label="Ville" value={site.city} />
            <Landmark label="Département" value={site.departmentCode ? `${department?.name ?? EMPTY_VALUE} (${site.departmentCode})` : null} />
            <Landmark label="Région" value={site.region} />
            <Landmark label="Portefeuille" value={site.portfolio} />
            <Landmark label="BU occupante" value={site.occupyingBu} />
            <Landmark label="Typologie" value={site.typology} />
            <Landmark label="Surface de référence" value={detail.referenceArea === null ? null : <span className="numeric">{formatSurface(detail.referenceArea)}</span>} />
            <div className="min-w-0">
              <dt className="text-[11px] tracking-wide text-text-muted uppercase">Complétude</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm" data-slot="completeness">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                  <span className="block h-full rounded-full bg-text-muted" style={{ width: `${evaluation.completeness}%` }} />
                </span>
                <span className="numeric">{evaluation.completeness} %</span>
              </dd>
            </div>
          </dl>

          <SheetActions code={site.code} siteId={site.id} name={site.name} canArchive={canArchive} archived={site.archivedAt !== null} canAudit={canAudit} />
        </div>
        {preview}
      </div>
    </header>
  );
}
