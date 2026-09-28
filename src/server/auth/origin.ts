/**
 * CSRF check for route handlers: the `Origin` header must equal the origin of
 * `APP_URL`. A missing Origin is refused (browsers always send it on
 * cross-site and on same-site POST requests).
 * @param origin - Value of the Origin header.
 * @param appUrl - Configured `APP_URL`.
 */
export function isSameOrigin(origin: string | null, appUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
