/**
 * FALLBACK style, used when the full basemap is not installed: country
 * silhouettes of world-atlas (Natural Earth 1:50m), France highlighted,
 * neighbours dimmed, ocean in `bg`. NO text layer, NO glyphs and NO sprite:
 * the fallback never requests fonts.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import { feature } from "topojson-client";
import { ORTHO_LAYER_SPEC, ORTHO_SOURCE, orthoSource } from "./ortho";
import { MAP_NEUTRAL, NEUTRAL } from "./theme";
import { mapAssetUrls } from "./urls";

/** ISO 3166-1 numeric code of France in world-atlas. */
export const FRANCE_ID = "250";

/**
 * ISO 3166-1 numeric codes of the countries around France: only these are
 * converted from TopoJSON (the whole world would cost ~1 s more to process).
 */
export const WESTERN_EUROPE_IDS: ReadonlySet<string> = new Set([
  "250", "724", "620", "020", "492", "380", "674", "336", "756", "438", "040", "276", "056", "528", "442",
  "826", "372", "208", "203", "616", "705", "191", "348", "703", "504", "012", "788", "578", "752",
  "070", "688", "499", "008", "470", "833", "832", "831", "234",
]);

/** Western Europe box kept from the world data (west, south, east, north). */
export const FALLBACK_BOUNDS = [-25, 30, 35, 65] as const;

/** A world-atlas topology (countries-50m.json). */
export type WorldTopology = Parameters<typeof feature>[0];

/** Properties of a country feature. */
export interface CountryProperties {
  name: string;
  isFrance: boolean;
}

function inBounds(coords: unknown): boolean {
  // Any vertex inside the box keeps the feature.
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [x, y] = coords as [number, number];
    return x >= FALLBACK_BOUNDS[0] && x <= FALLBACK_BOUNDS[2] && y >= FALLBACK_BOUNDS[1] && y <= FALLBACK_BOUNDS[3];
  }
  return Array.isArray(coords) && coords.some(inBounds);
}

/**
 * Countries of Western Europe from a world-atlas topology.
 * @param topology - countries-50m.json.
 */
export function countriesFromTopology(topology: WorldTopology): FeatureCollection<Polygon | MultiPolygon, CountryProperties> {
  const countries = topology.objects.countries as { type: "GeometryCollection"; geometries: { id?: string | number }[] };
  const subset = { ...countries, geometries: countries.geometries.filter((g) => WESTERN_EUROPE_IDS.has(String(g.id))) };
  const all = feature(topology, subset as Parameters<typeof feature>[1]) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  return {
    type: "FeatureCollection",
    features: all.features
      .filter((f) => f.geometry && inBounds(f.geometry.coordinates))
      .map((f) => ({ ...f, properties: { name: f.properties?.name ?? "", isFrance: String(f.id) === FRANCE_ID } })),
  };
}

/** Options of {@link buildFallbackStyle}. */
export interface FallbackStyleOptions {
  countries: FeatureCollection<Polygon | MultiPolygon, CountryProperties>;
  origin: string;
  /** Aerial imagery can still be shown (raster: no glyph needed). */
  ortho: boolean;
  attributions: readonly string[];
}

/** Builds the fallback style (no glyphs, no sprite, no text). */
export function buildFallbackStyle({ countries, origin, ortho, attributions }: FallbackStyleOptions): StyleSpecification {
  const n = NEUTRAL;
  return {
    version: 8,
    name: "Vigie — fond de secours",
    sources: {
      countries: { type: "geojson", data: countries, attribution: attributions.join(" · ") },
      ...(ortho ? { [ORTHO_SOURCE]: orthoSource(mapAssetUrls(origin).ortho) } : {}),
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": MAP_NEUTRAL.water } },
      { id: "countries-neighbours", type: "fill", source: "countries", filter: ["!", ["get", "isFrance"]], paint: { "fill-color": MAP_NEUTRAL.landcover } },
      { id: "countries-france", type: "fill", source: "countries", filter: ["get", "isFrance"], paint: { "fill-color": MAP_NEUTRAL.land } },
      ...(ortho ? [ORTHO_LAYER_SPEC] : []),
      { id: "borders-neighbours", type: "line", source: "countries", filter: ["!", ["get", "isFrance"]], paint: { "line-color": n.border, "line-width": 0.6 } },
      { id: "border-france", type: "line", source: "countries", filter: ["get", "isFrance"], paint: { "line-color": n.borderStrong, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 10, 2] } },
    ],
  };
}
