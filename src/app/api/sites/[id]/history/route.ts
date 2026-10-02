import { NextResponse } from "next/server";
import { hasField, getField } from "@/domain/fields";
import { jsonError, withApiAuth } from "@/server/auth/api";
import { can } from "@/server/auth/permissions";
import { siteExists } from "@/server/sites/detail";
import { getFieldHistory } from "@/server/sites/history";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/sites/[id]/history?entity=Lease&field=endDate — history of one
 * registry field (`site:read`, plus `finance:read` for a financial field),
 * newest first, 50 entries at most.
 */
export const GET = withApiAuth<Context>(
  async (request, { params, user }) => {
    const { id } = await params;
    const entity = request.nextUrl.searchParams.get("entity") ?? "";
    const field = request.nextUrl.searchParams.get("field") ?? "";
    const key = `${entity}.${field}`;
    if (!hasField(key)) return NextResponse.json({ error: "Champ inconnu." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const def = getField(key);
    if (def.financial && !can(user.role, "finance:read")) return jsonError(403, "Accès refusé.");
    if (!(await siteExists(id))) return jsonError(404, "Site introuvable.");
    return NextResponse.json({ field: { entity: def.entity, key: def.key, labelFr: def.labelFr }, entries: await getFieldHistory(id, def) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "site:read" },
);
