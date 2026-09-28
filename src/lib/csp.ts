/**
 * Builds the Content-Security-Policy header value.
 *
 * No external origin is ever allowed: everything is `'self'`, plus `data:` and
 * `blob:` for images and `blob:` workers (required by MapLibre at step 6).
 * Scripts rely on a per-request nonce with `'strict-dynamic'` (no
 * `'unsafe-inline'`). `'unsafe-eval'` is added in development only, because
 * React's dev tooling needs it.
 *
 * Styles allow `'unsafe-inline'`: server-rendered `style="…"` attributes (Radix
 * positioning, MapLibre) cannot carry a nonce. Style injection cannot execute
 * code, and every style source remains same-origin.
 *
 * @param nonce - Base64 nonce generated for the current request.
 * @param isDev - Whether the server runs in development mode.
 * @returns The serialized policy, on a single line.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
