import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { PasswordChangeRequiredError, requireApiUser, UnauthorizedError } from "./current-user";
import { assertCan, ForbiddenError, type Action } from "./permissions";
import { isSameOrigin } from "./origin";
import type { SessionUser } from "./session";

export { isSameOrigin } from "./origin";

/** HTTP methods that change state and therefore require a same-origin request. */
export const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** JSON error response with `Cache-Control: no-store`. */
export function jsonError(status: 401 | 403 | 404 | 500, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

type Handler<C> = (request: NextRequest, context: C & { user: SessionUser }) => Promise<Response>;

/**
 * Protects a route handler: same-origin check for mutating methods (403),
 * valid session (401 JSON, never a redirect), optional permission (403 JSON).
 *
 * @param handler - Route handler, receiving the authenticated user.
 * @param options - `permission` required, if any.
 */
export function withApiAuth<C extends object = object>(handler: Handler<C>, options: { permission?: Action } = {}) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    try {
      if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request.headers.get("origin"), getEnv().APP_URL, getEnv().SERVER_ACTIONS_ALLOWED_ORIGINS)) {
        return jsonError(403, "Origine de la requête refusée.");
      }
      const user = await requireApiUser();
      if (options.permission) assertCan(user.role, options.permission);
      return await handler(request, { ...context, user });
    } catch (error) {
      if (error instanceof UnauthorizedError) return jsonError(401, "Authentification requise.");
      if (error instanceof ForbiddenError) return jsonError(403, "Accès refusé.");
      if (error instanceof PasswordChangeRequiredError) return jsonError(403, error.message);
      throw error;
    }
  };
}
