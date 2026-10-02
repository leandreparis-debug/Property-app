import { NationalMapLoader } from "@/components/map/NationalMapLoader";
import { resolveMapAssets } from "@/components/map/style/assets";
import { NewSiteDialog } from "@/components/editing/NewSiteDialog";
import { PortfolioBriefs } from "@/components/home/PortfolioBriefs";
import { PageContainer } from "@/components/shell/PageContainer";
import { todayDateOnly } from "@/domain/dates";
import { basemapMode } from "@/lib/basemap";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";
import { getFootprints } from "@/server/sites/index";
import { testHooksEnabled } from "@/server/test-hooks";

/**
 * Home: « Carte du portefeuille ». Title, the three brief cards (deadlines,
 * sheets to complete, compliance) and the national map in a card, with the
 * selected site's summary in its right column. The sites come from the
 * shared site index (loaded by the layout); this page adds the building
 * footprints and the map assets.
 */
export default async function MapPage() {
  const user = await requireUser();
  const [footprints, manifest] = await Promise.all([getFootprints(), readInstalledManifest()]);
  const assets = resolveMapAssets(manifest ? publicManifest(manifest) : null, basemapMode() === "ign");
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(todayDateOnly());

  return (
    <PageContainer className="space-y-5 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carte du portefeuille</h1>
          <p className="mt-1 text-sm text-text-muted first-letter:uppercase">{today}</p>
        </div>
        {can(user.role, "site:write") && <NewSiteDialog />}
      </div>
      <PortfolioBriefs />
      <section
        role="region"
        aria-label="Carte des entrepôts"
        data-slot="map-stage"
        className="relative h-[max(560px,calc(100dvh-22rem))] overflow-hidden rounded-lg border border-border bg-surface-1 shadow-panel"
      >
        <div data-slot="map-canvas" className="absolute inset-0">
          <NationalMapLoader footprints={footprints} assets={assets} isAdmin={user.role === "admin"} exposeTestHook={testHooksEnabled()} />
        </div>
      </section>
    </PageContainer>
  );
}
