/**
 * Attributions of the map data, built from the installed bundle manifest
 * (or the fallback data). PLAIN TEXT only: no link, no HTML (MapLibre
 * renders attributions as HTML, so every string is escaped).
 */

/** A source as exposed by /api/map-assets/status. */
export interface ManifestSource {
  name: string;
  licence: string;
  attribution: string;
}

/** Attribution of the fallback basemap (world-atlas, Natural Earth data). */
export const FALLBACK_ATTRIBUTION = "Natural Earth (domaine public), world-atlas";

/** Escapes the HTML special characters. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * Attribution strings of the map (deduplicated, plain text, escaped).
 * @param sources - Sources of the manifest used by the map (fond, ortho).
 * @param fallback - True when the fallback basemap is displayed.
 */
export function buildAttributions(sources: readonly ManifestSource[], fallback: boolean): string[] {
  const texts = fallback ? [FALLBACK_ATTRIBUTION] : sources.map((s) => s.attribution.replace(/<[^>]*>/g, "").trim()).filter(Boolean);
  return [...new Set(texts)].map(escapeHtml);
}
