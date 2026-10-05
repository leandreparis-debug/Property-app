import type { StyleSpecification } from "maplibre-gl";
import type { MapAssets } from "./assets";
import { buildAttributions } from "./attribution";
import { buildBasemapStyle } from "./basemap-style";
import { buildFallbackStyle, countriesFromTopology, type WorldTopology } from "./fallback-style";
import { buildIgnStyle, loadIgnVectorStyle, type BaseLayer } from "./ign-style";

/**
 * Style of a map for the available assets: the IGN online basemap when
 * enabled (grey vector plan, raster plan if its style cannot be loaded); otherwise the offline vector basemap, or the fallback style
 * (world-atlas countries) when it is missing, with the installed aerial
 * imagery. Shared by the national map and the Plan tab.
 * @param assets - Map assets.
 * @param base - IGN basemap shown first (plan or photographs).
 */
export async function buildMapStyle(assets: MapAssets, base: BaseLayer = "plan"): Promise<StyleSpecification> {
  if (assets.ign) return buildIgnStyle(base, await loadIgnVectorStyle());
  const origin = window.location.origin;
  const fallback = !assets.basemap;
  const attributions = buildAttributions(assets.sources, fallback);
  if (!fallback) return buildBasemapStyle({ origin, ortho: assets.ortho, attributions });
  const topology = (await import("world-atlas/countries-50m.json")).default as unknown as WorldTopology;
  return buildFallbackStyle({ countries: countriesFromTopology(topology), origin, ortho: assets.ortho, attributions });
}
