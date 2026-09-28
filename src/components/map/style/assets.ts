/**
 * Availability of the offline map assets, derived from the installed
 * manifest (same data as GET /api/map-assets/status): the full basemap needs
 * france.pmtiles, the glyphs and the sprites; the aerial imagery is optional.
 */

/** Public manifest as returned by /api/map-assets/status (subset used here). */
export interface MapAssetsManifest {
  name: string;
  files: readonly { path: string; size: number }[];
  sources: readonly { name: string; licence: string; attribution: string }[];
}

/** Map assets to use. */
export interface MapAssets {
  /** Full vector basemap available (otherwise: fallback style). */
  basemap: boolean;
  /** Aerial imagery available. */
  ortho: boolean;
  /** Attributions (plain text). */
  sources: MapAssetsManifest["sources"];
}

/** Files required by the full basemap (paths relative to STORAGE_ROOT/map/). */
export const REQUIRED_BASEMAP_FILES = ["france.pmtiles", "sprites/v4/dark.json", "sprites/v4/dark.png"] as const;
/** Glyph range required for Latin labels. */
export const REQUIRED_GLYPH = "fonts/Noto Sans Regular/0-255.pbf";

/**
 * Decides which assets the map can use.
 * @param manifest - Installed manifest, or null when no map is installed.
 */
export function resolveMapAssets(manifest: MapAssetsManifest | null): MapAssets {
  if (!manifest) return { basemap: false, ortho: false, sources: [] };
  const files = new Map(manifest.files.map((f) => [f.path, f.size]));
  const present = (p: string) => (files.get(p) ?? 0) > 0;
  return {
    basemap: REQUIRED_BASEMAP_FILES.every(present) && present(REQUIRED_GLYPH),
    ortho: present("ortho-sites.pmtiles"),
    sources: manifest.sources,
  };
}
