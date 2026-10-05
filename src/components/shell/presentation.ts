/**
 * Site views (sharing the filters) and the presentation mode of the
 * supervision (`/supervision?present=1`), which hides the rail and the bar.
 */

/** Paths of the site views. */
export const SITE_VIEW_PATHS = ["/", "/sites", "/supervision"] as const;

/** Whether a path is one of the site views. */
export function isSiteView(pathname: string): boolean {
  return (SITE_VIEW_PATHS as readonly string[]).includes(pathname);
}

/** Whether the supervision is in presentation mode. */
export function isPresenting(pathname: string, params: { get(name: string): string | null }): boolean {
  return pathname === "/supervision" && params.get("present") === "1";
}
