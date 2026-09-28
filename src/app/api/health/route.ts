import { NextResponse } from "next/server";
import { checkDatabase } from "@/server/health";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness probe: `{ status, version, timestamp, database }`.
 * HTTP 503 when the database is unreachable (no error detail is exposed).
 */
export async function GET() {
  const database = await checkDatabase();
  const healthy = database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      database,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
