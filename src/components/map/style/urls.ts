/**
 * Same-origin URLs of the offline map assets. The origin is ALWAYS given at
 * runtime (window.location.origin): no absolute URL is ever written in the
 * code.
 */

/** Base path of the map assets route. */
export const MAP_ASSETS_PATH = "/api/map-assets";

/** URLs of the map assets for an origin. */
export function mapAssetUrls(origin: string) {
  const base = `${origin}${MAP_ASSETS_PATH}`;
  return {
    basemap: `pmtiles://${base}/france.pmtiles`,
    ortho: `pmtiles://${base}/ortho-sites.pmtiles`,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/v4/dark`,
  };
}
