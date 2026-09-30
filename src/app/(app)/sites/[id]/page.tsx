import { basemapMode } from "@/lib/basemap";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { resolveMapAssets } from "@/components/map/style/assets";
import { EditGuardProvider } from "@/components/editing/feedback";
import { HistoryProvider } from "@/components/editing/HistoryPanel";
import { PageContainer } from "@/components/shell/PageContainer";
import {
  DocumentsPanel,
  EnergyPanel,
  FinancePanel,
  IcpePanel,
  LeasePanel,
  OperationsPanel,
  OverviewPanel,
  TechnicalPanel,
  type SheetContext,
} from "@/components/site-sheet/panels";
import { SiteHeader } from "@/components/site-sheet/SiteHeader";
import { SitePreview } from "@/components/site-sheet/SitePreview";
import { SiteTabs } from "@/components/site-sheet/SiteTabs";
import { PlanPanel } from "@/components/plan/PlanPanel";
import { todayDateOnly } from "@/domain/dates";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";
import { getFieldProvenance, getSiteDetail, isWellFormedSiteId, provenanceHint } from "@/server/sites/detail";
import { sectionPermissions } from "@/server/sites/edit";
import { getSitePlanData } from "@/server/plans/data";
import { testHooksEnabled } from "@/server/test-hooks";

type Props = { params: Promise<{ id: string }> };

/** One read per request (metadata and page share it). */
const loadDetail = cache((id: string) => getSiteDetail(id, todayDateOnly()));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = isWellFormedSiteId(id) ? await loadDetail(id) : null;
  return {
    title: detail ? `${detail.site.name} (${detail.site.code})` : "Site introuvable",
  };
}

/**
 * Site sheet: header, map preview and nine tabs (`?tab=`). Every
 * value comes with its provenance (last audited write). Financial data is
 * rendered only with `finance:read`.
 */
export default async function SitePage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  if (!isWellFormedSiteId(id)) notFound();
  const today = todayDateOnly();
  const [detail, provenance, manifest, planData] = await Promise.all([loadDetail(id), getFieldProvenance(id), readInstalledManifest(), getSitePlanData(id)]);
  if (!detail || !planData) notFound();

  const archived = detail.site.archivedAt !== null;
  const ctx: SheetContext = {
    detail,
    today,
    canFinance: can(user.role, "finance:read"),
    hint: (entity, entityId, field) => provenanceHint(provenance, entity, entityId, field),
    metricHint: (code, year) => provenanceHint(provenance, "AnnualMetric", detail.metricRowIds[`${code}|${year}`], "value"),
    canEditSection: (section) => !archived && sectionPermissions(section).every((a) => can(user.role, a)),
    canWrite: !archived && can(user.role, "site:write"),
    canUpload: !archived && can(user.role, "document:upload"),
  };
  const { site } = detail;
  const center: [number, number] | null = site.latitude !== null && site.longitude !== null ? [site.longitude, site.latitude] : null;
  const footprint = detail.volume;
  const assets = resolveMapAssets(manifest ? publicManifest(manifest) : null, basemapMode() === "ign");

  return (
    <EditGuardProvider>
      <HistoryProvider siteId={site.id}>
        <PageContainer className="mx-auto max-w-[1440px] space-y-6 print:max-w-none print:p-0">
          <SiteHeader
            detail={detail}
            canArchive={can(user.role, "site:archive")}
            printedOn={new Date()}
            preview={<SitePreview code={site.code} center={center} footprint={footprint} assets={assets} />}
          />
          <SiteTabs
            panels={{
              overview: <OverviewPanel {...ctx} />,
              lease: <LeasePanel {...ctx} />,
              operations: <OperationsPanel {...ctx} />,
              finance: <FinancePanel {...ctx} />,
              energy: <EnergyPanel {...ctx} />,
              technical: <TechnicalPanel {...ctx} />,
              plan: (
                <PlanPanel
                  data={planData}
                  assets={assets}
                  canCalibrate={!archived && can(user.role, "plan:calibrate")}
                  canEditEquipment={!archived && can(user.role, "equipment:write")}
                  canWrite={!archived && can(user.role, "site:write")}
                  exposeTestHook={testHooksEnabled()}
                />
              ),
              icpe: <IcpePanel {...ctx} />,
              documents: <DocumentsPanel {...ctx} />,
            }}
          />
        </PageContainer>
      </HistoryProvider>
    </EditGuardProvider>
  );
}
