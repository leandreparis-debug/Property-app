import { parseAllowedHosts } from "@/lib/allowed-origins";

/**
 * CSRF check for route handlers: the `Origin` header must equal the origin of
 * `APP_URL`, or have one of the hosts of `SERVER_ACTIONS_ALLOWED_ORIGINS`
 * (GitHub Codespaces: the port-forwarding proxy rewrites the Origin header to
 * `localhost:3000`). A missing Origin is refused (browsers always send it on
 * cross-site and on same-site POST requests).
 * @param origin - Value of the Origin header.
 * @param appUrl - Configured `APP_URL`.
 * @param allowedHosts - `SERVER_ACTIONS_ALLOWED_ORIGINS` (comma-separated), if set.
 */
export function isSameOrigin(origin: string | null, appUrl: string, allowedHosts?: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.origin === new URL(appUrl).origin) return true;
    return parseAllowedHosts(allowedHosts).includes(url.host.toLowerCase());
  } catch {
    return false;
  }
}
