import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { IGN_ORIGIN } from "@/lib/basemap";
import { MAP_NEUTRAL } from "./theme";

/**
 * Basemap of the IGN Géoplateforme (open data, Etalab licence): « Plan IGN »
 * (v2) and aerial photographs (BD ORTHO), as WMTS raster tiles in Web
 * Mercator, loaded ONLINE by the browser. Only the tile service origin is
 * allowed by the CSP (lib/basemap.ts).
 */

/** Attribution displayed on the map. */
export const IGN_ATTRIBUTION = "© IGN – Géoplateforme";

/** Layers of the two IGN basemaps. */
export const IGN_LAYER = { plan: "ign-plan", photo: "ign-photo" } as const;

/** A basemap the user can choose. */
export type BaseLayer = keyof typeof IGN_LAYER;

/**
 * WMTS tile URL template of an IGN layer (TILEMATRIXSET PM = Web Mercator).
 * @param layer - Géoplateforme layer name.
 * @param format - Image type.
 */
export function ignTileUrl(layer: string, format: "image/png" | "image/jpeg"): string {
  return `${IGN_ORIGIN}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${encodeURIComponent(format)}`;
}

/**
 * Style with both IGN basemaps (the plan visible, the photographs hidden).
 * No glyphs nor sprites: the site layers need none.
 * @param base - Basemap shown first.
 */
export function buildIgnStyle(base: BaseLayer = "plan"): StyleSpecification {
  return {
    version: 8,
    sources: {
      [IGN_LAYER.plan]: { type: "raster", tiles: [ignTileUrl("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")], tileSize: 256, maxzoom: 19, attribution: IGN_ATTRIBUTION },
      [IGN_LAYER.photo]: { type: "raster", tiles: [ignTileUrl("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")], tileSize: 256, maxzoom: 19, attribution: IGN_ATTRIBUTION },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": MAP_NEUTRAL.land } },
      // Slightly softened so the status colors of the sites stay dominant.
      { id: IGN_LAYER.plan, type: "raster", source: IGN_LAYER.plan, layout: { visibility: base === "plan" ? "visible" : "none" }, paint: { "raster-saturation": -0.3, "raster-contrast": -0.05 } },
      { id: IGN_LAYER.photo, type: "raster", source: IGN_LAYER.photo, layout: { visibility: base === "photo" ? "visible" : "none" } },
    ],
  };
}

/**
 * Switches the visible IGN basemap of a map built with {@link buildIgnStyle}.
 * @param map - Loaded map.
 * @param base - Basemap to show.
 */
export function setBaseLayer(map: MapLibreMap, base: BaseLayer): void {
  for (const [key, id] of Object.entries(IGN_LAYER)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", key === base ? "visible" : "none");
  }
}
