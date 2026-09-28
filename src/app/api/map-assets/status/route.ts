import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/auth/api";
import { publicManifest, readInstalledManifest } from "@/server/map/assets";

export const dynamic = "force-dynamic";

/** Whether an offline map is installed, and its public manifest (no internal path). */
export const GET = withApiAuth(
  async () => {
    const manifest = await readInstalledManifest();
    return NextResponse.json(
      { installed: manifest !== null, manifest: manifest ? publicManifest(manifest) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { permission: "site:read" },
);
