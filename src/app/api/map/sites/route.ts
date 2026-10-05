import { NextResponse } from "next/server";
import { todayDateOnly } from "@/domain/dates";
import { withApiAuth } from "@/server/auth/api";
import { getMapSites } from "@/server/map/sites";

export const dynamic = "force-dynamic";

/** National map data (statuses computed on read). */
export const GET = withApiAuth(
  async () => NextResponse.json(await getMapSites(todayDateOnly()), { headers: { "Cache-Control": "no-store" } }),
  { permission: "site:read" },
);
