import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { SESSION_COOKIE_NAMES } from "@/server/auth/cookies";

/** Header carrying the requested path to server components (for `?next=`). */
const PATH_HEADER = "x-atlas-path";

/** Paths reachable without a session. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/api/health" || pathname === "/api/auth/logout") return true;
  return process.env.NODE_ENV !== "production" && (pathname === "/dev" || pathname.startsWith("/dev/"));
}

/**
 * 1. Generates a per-request nonce and applies the Content-Security-Policy.
 * 2. Early redirect when the session cookie is ABSENT (pages → /login?next=…,
 *    API → 401 JSON). This is only a fast path: the session itself is
 *    validated on the server by requireUser()/requireApiUser().
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));

  if (!hasSessionCookie && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentification requise." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(PATH_HEADER, `${pathname}${search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
