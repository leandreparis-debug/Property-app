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
    <PageContainer className="h-dvh pt-[7.5rem] pb-3 has-[[data-presenting]]:p-0">
      <SupervisionView footprints={footprints} assets={resolveMapAssets(manifest ? publicManifest(manifest) : null)} />
    </PageContainer>
  );
}
