/**
 * Aerial imagery layer (IGN orthophotos around the sites), shared by both
 * styles: visible from zoom 14, DESATURATED and DARKENED to stay in the
 * « control room » mood.
 */
import type { RasterLayerSpecification, RasterSourceSpecification } from "maplibre-gl";

/** Id of the aerial imagery source and layer. */
export const ORTHO_SOURCE = "ortho";
export const ORTHO_LAYER = "ortho";

/** Raster source (PMTiles). */
export function orthoSource(url: string): RasterSourceSpecification {
  return { type: "raster", url, tileSize: 256, minzoom: 15, maxzoom: 18 };
}

/** Raster layer, desaturated and darkened. */
export const ORTHO_LAYER_SPEC: RasterLayerSpecification = {
  id: ORTHO_LAYER,
  type: "raster",
  source: ORTHO_SOURCE,
  minzoom: 14,
  paint: {
    "raster-saturation": -0.7,
    "raster-brightness-max": 0.55,
    "raster-contrast": 0.12,
    "raster-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
    "raster-fade-duration": 200,
  },
};
