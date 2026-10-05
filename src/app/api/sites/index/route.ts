import { NextResponse } from "next/server";
import { todayDateOnly } from "@/domain/dates";
import { withApiAuth } from "@/server/auth/api";
import { getSiteIndex } from "@/server/sites/index";

export const dynamic = "force-dynamic";

/** The site index (statuses computed on read). Used to refresh the views. */
export const GET = withApiAuth(
  async () => NextResponse.json({ generatedAt: new Date().toISOString(), entries: await getSiteIndex(todayDateOnly()) }, { headers: { "Cache-Control": "no-store" } }),
  { permission: "site:read" },
);
