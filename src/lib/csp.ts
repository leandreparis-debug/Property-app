/**
 * Builds the Content-Security-Policy header value.
 *
 * No external origin is allowed, except the map tile service when the IGN
 * basemap is enabled (`mapOrigins`, images and fetch only): everything else
 * is `'self'`, plus `data:` and `blob:` for images and `blob:` workers
 * (required by MapLibre).
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
 * @param mapOrigins - External origins of the basemap tiles (see lib/basemap.ts).
 * @returns The serialized policy, on a single line.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean, mapOrigins: readonly string[] = []): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...mapOrigins],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...mapOrigins],
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
