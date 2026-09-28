import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Liveness probe. Database checks are added at step 2. */
export function GET() {
  return NextResponse.json(
    { status: "ok", version: packageJson.version, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
