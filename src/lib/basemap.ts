/**
 * Source of the detailed basemap.
 *
 * - `ign` (default): « Plan IGN » and aerial photographs of the IGN
 *   Géoplateforme, loaded ONLINE by each user's browser (the server itself
 *   never calls it). The users' workstations must reach `data.geopf.fr`.
 * - `offline`: the offline bundle installed on the server (step 5), or the
 *   fallback style when none is installed — the closed-network mode, also
 *   used by the end-to-end tests.
 */
export type BasemapMode = "ign" | "offline";

/** Origin of the IGN Géoplateforme services (tiles), allowed by the CSP in `ign` mode. */
export const IGN_ORIGIN = "https://data.geopf.fr";

/**
 * Configured basemap mode (`MAP_BASEMAP`, `ign` by default).
 * @param source - Environment (defaults to `process.env`).
 */
export function basemapMode(source: Record<string, string | undefined> = process.env): BasemapMode {
  return source.MAP_BASEMAP?.trim().toLowerCase() === "offline" ? "offline" : "ign";
}

/** External origins the browser may contact for the map (CSP `img-src` / `connect-src`). */
export function mapOrigins(mode: BasemapMode = basemapMode()): string[] {
  return mode === "ign" ? [IGN_ORIGIN] : [];
}
