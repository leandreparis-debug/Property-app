import { cookies, headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { isSameOrigin, jsonError } from "@/server/auth/api";
import { getClientIp } from "@/server/auth/client-ip";
import { expiredSessionCookieOptions, sessionCookieName } from "@/server/auth/cookies";
import { logLogout } from "@/server/auth/login";
import { invalidateSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * Logout (POST from the user menu form). Deletes the session in base, clears
 * the cookie and the browser cache for the origin, then redirects to /login
 * with a full page load (no protected page left in the client router cache).
 */
export async function POST(request: Request) {
  const env = getEnv();
  if (!isSameOrigin(request.headers.get("origin"), env.APP_URL, env.SERVER_ACTIONS_ALLOWED_ORIGINS)) {
    return jsonError(403, "Origine de la requête refusée.");
  }
  const cookieStore = await cookies();
  const name = sessionCookieName(env);
  const userId = await invalidateSession(cookieStore.get(name)?.value);
  if (userId) await logLogout(userId, getClientIp(await headers(), env.TRUST_PROXY));
  cookieStore.set(name, "", expiredSessionCookieOptions(env));

  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Cache-Control": "no-store", "Clear-Site-Data": '"cache"' },
  });
}
