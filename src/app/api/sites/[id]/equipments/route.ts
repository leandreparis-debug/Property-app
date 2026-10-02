import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/auth/api";
import { getSiteEquipmentsForMap } from "@/server/plans/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/sites/[id]/equipments — equipments of a site for the national map
 * (`site:read`, read-only): id, type, label and position of the
 * non-archived equipments; nothing else.
 */
export const GET = withApiAuth<Context>(
  async (_request, { params }) => {
    const { id } = await params;
    return NextResponse.json({ equipments: await getSiteEquipmentsForMap(id) }, { headers: { "Cache-Control": "private, no-store" } });
  },
  { permission: "site:read" },
);
