/**
 * Sanitizes the `?next=` parameter of the login page to prevent open
 * redirects: only internal relative paths are accepted (`/…`, but not `//…`
 * nor `/\…`, which browsers treat as another host), without control
 * characters. Anything else becomes `/`.
 *
 * @param next - Raw parameter value (may be missing or an array).
 * @param fallback - Path used when `next` is rejected.
 * @returns A safe internal path.
 */
export function safeRedirectPath(next: string | string[] | null | undefined, fallback = "/"): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters and backslashes can be normalised by browsers into a host.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    // Resolving against a reference origin (never requested) must keep that origin.
    const base = "http://localhost";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (path.startsWith("/login")) return fallback; // avoid loops
    return path;
  } catch {
    return fallback;
  }
}
