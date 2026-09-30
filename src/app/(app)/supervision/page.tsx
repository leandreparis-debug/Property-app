import { basemapMode } from "@/lib/basemap";
import type { Metadata } from "next";
import { resolveMapAssets } from "@/components/map/style/assets";
import { PageContainer } from "@/components/shell/PageContainer";
import { SupervisionView } from "@/components/supervision/SupervisionView";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";
import { getFootprints } from "@/server/sites/index";

export const metadata: Metadata = { title: "Supervision" };

/** Committee view (shared filters; presentation mode with `present=1`). */
export default async function SupervisionPage() {
  const [footprints, manifest] = await Promise.all([getFootprints(), readInstalledManifest()]);
  return (
    <PageContainer className="h-[calc(100dvh-7.1rem)] pt-5 pb-4 has-[[data-presenting]]:h-dvh has-[[data-presenting]]:max-w-none has-[[data-presenting]]:p-0">
      <SupervisionView footprints={footprints} assets={resolveMapAssets(manifest ? publicManifest(manifest) : null, basemapMode() === "ign")} />
    </PageContainer>
  );
}
