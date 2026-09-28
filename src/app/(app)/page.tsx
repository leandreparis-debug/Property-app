import { NationalMapLoader } from "@/components/map/NationalMapLoader";
import { resolveMapAssets } from "@/components/map/style/assets";
import { readSiteParam } from "@/components/map/url-state";
import { MapStage } from "@/components/shell/MapStage";
import { todayDateOnly } from "@/domain/dates";
import { requireUser } from "@/server/auth/current-user";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";
import { getMapSites } from "@/server/map/sites";

/**
 * Test hook `window.__vigieMap`: development, or a build started with
 * VIGIE_E2E_TEST_HOOKS=1 by the end-to-end suite. Never in a regular
 * production deployment (checked by an e2e test).
 */
function testHooksEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VIGIE_E2E_TEST_HOOKS === "1";
}

/** Home: the national map. Statuses are computed on read, for today. */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ site?: string | string[] }> }) {
  const user = await requireUser();
  const [data, manifest, params] = await Promise.all([getMapSites(todayDateOnly()), readInstalledManifest(), searchParams]);
  const assets = resolveMapAssets(manifest ? publicManifest(manifest) : null);
  const site = typeof params.site === "string" ? readSiteParam(new URLSearchParams({ site: params.site })) : null;

  return (
    <>
      <h1 className="sr-only">Carte des entrepôts</h1>
      <MapStage aria-label="Carte des entrepôts">
        <NationalMapLoader data={data} assets={assets} isAdmin={user.role === "admin"} initialSiteCode={site} exposeTestHook={testHooksEnabled()} />
      </MapStage>
    </>
  );
}
