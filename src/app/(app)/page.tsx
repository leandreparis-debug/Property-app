import { NationalMapLoader } from "@/components/map/NationalMapLoader";
import { resolveMapAssets } from "@/components/map/style/assets";
import { MapStage } from "@/components/shell/MapStage";
import { requireUser } from "@/server/auth/current-user";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";
import { getFootprints } from "@/server/sites/index";
import { testHooksEnabled } from "@/server/test-hooks";

/**
 * Home: the national map. The sites come from the shared site index (loaded
 * by the layout); this page only adds the building footprints and the
 * installed map assets.
 */
export default async function MapPage() {
  const user = await requireUser();
  const [footprints, manifest] = await Promise.all([getFootprints(), readInstalledManifest()]);
  const assets = resolveMapAssets(manifest ? publicManifest(manifest) : null);

  return (
    <>
      <h1 className="sr-only">Carte des entrepôts</h1>
      <MapStage aria-label="Carte des entrepôts">
        <NationalMapLoader footprints={footprints} assets={assets} isAdmin={user.role === "admin"} exposeTestHook={testHooksEnabled()} />
      </MapStage>
    </>
  );
}
