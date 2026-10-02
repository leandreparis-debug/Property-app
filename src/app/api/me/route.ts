import { NextResponse } from "next/server";
import { UserRole } from "@/domain/enums";
import { withApiAuth } from "@/server/auth/api";

export const dynamic = "force-dynamic";

/** Current user (protected: 401 JSON without a valid session). */
export const GET = withApiAuth(async (_request, { user }) =>
  NextResponse.json(
    { id: user.id, email: user.email, name: user.name, role: user.role, roleLabel: UserRole.label(user.role) },
    { headers: { "Cache-Control": "no-store" } },
  ),
);
