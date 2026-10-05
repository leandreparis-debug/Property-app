import type { LayerSpecification, Map as MapLibreMap, SourceSpecification, StyleSpecification } from "maplibre-gl";
import { IGN_ORIGIN } from "@/lib/basemap";
import { MAP_NEUTRAL } from "./theme";

/**
 * Basemap of the IGN Géoplateforme (open data, Etalab licence), loaded
 * ONLINE by the browser. Only the Géoplateforme origin is allowed by the CSP
 * (lib/basemap.ts).
 *
 * - Plan: the « Plan IGN » vector tiles with the IGN « gris » style (grey,
 *   discreet, so the status colors of the sites stand out). The style is
 *   fetched at runtime; if it cannot be (network, unexpected content), the
 *   raster « Plan IGN v2 » is used, fully desaturated and lightened.
 * - Photo: aerial photographs (BD ORTHO), raster.
 *
 * Every layer of the basemap is tagged with the base it belongs to (layer
 * metadata), so {@link setBaseLayer} can switch between them.
 */

/** Attribution displayed on the map. */
export const IGN_ATTRIBUTION = "© IGN – Géoplateforme";

/** Layer and source ids of the raster IGN basemaps. */
export const IGN_LAYER = { plan: "ign-plan", photo: "ign-photo" } as const;

/** A basemap the user can choose. */
export type BaseLayer = keyof typeof IGN_LAYER;

/** Grey vector style of the Plan IGN (Géoplateforme). */
export const IGN_VECTOR_STYLE_URL = `${IGN_ORIGIN}/annexes/ressources/vectorTiles/styles/PLAN.IGN/gris.json`;

/** Layer metadata keys set on every basemap layer. */
export const BASE_META = { base: "vigie:base", visible: "vigie:visible" } as const;

/** Delay after which the vector style is given up for the raster plan. */
const VECTOR_STYLE_TIMEOUT_MS = 5000;

/**
 * WMTS tile URL template of an IGN layer (TILEMATRIXSET PM = Web Mercator).
 * @param layer - Géoplateforme layer name.
 * @param format - Image type.
 */
export function ignTileUrl(layer: string, format: "image/png" | "image/jpeg"): string {
  return `${IGN_ORIGIN}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${encodeURIComponent(format)}`;
}

/** URLs a style makes the browser load (sources, glyphs, sprites). */
function styleUrls(style: StyleSpecification): string[] {
  const urls: string[] = [];
  for (const source of Object.values(style.sources ?? {})) {
    const s = source as { url?: unknown; tiles?: unknown; data?: unknown };
    if (typeof s.url === "string") urls.push(s.url);
    if (Array.isArray(s.tiles)) urls.push(...s.tiles.map(String));
    if (typeof s.data === "string") urls.push(s.data);
  }
  if (typeof style.glyphs === "string") urls.push(style.glyphs);
  const sprite = style.sprite as unknown;
  if (typeof sprite === "string") urls.push(sprite);
  else if (Array.isArray(sprite)) urls.push(...sprite.map((s) => String((s as { url?: unknown }).url)));
  return urls;
}

/**
 * Whether a fetched style can be used: a MapLibre v8 style with layers,
 * whose every resource is on the Géoplateforme (the only origin the CSP
 * allows).
 * @param value - Parsed JSON.
 */
export function isUsableIgnStyle(value: unknown): value is StyleSpecification {
  const style = value as Partial<StyleSpecification> | null;
  if (!style || style.version !== 8 || !Array.isArray(style.layers) || style.layers.length === 0) return false;
  if (!style.sources || typeof style.sources !== "object") return false;
  return styleUrls(style as StyleSpecification).every((url) => url.startsWith(`${IGN_ORIGIN}/`));
}

let vectorStyle: Promise<StyleSpecification | null> | null = null;

/**
 * The grey Plan IGN vector style, fetched once per page (shared by the
 * national map and the Plan tab); `null` when unavailable.
 */
export function loadIgnVectorStyle(): Promise<StyleSpecification | null> {
  vectorStyle ??= (async () => {
    try {
      const response = await fetch(IGN_VECTOR_STYLE_URL, { signal: AbortSignal.timeout(VECTOR_STYLE_TIMEOUT_MS), credentials: "omit" });
      if (!response.ok) return null;
      const json: unknown = await response.json();
      return isUsableIgnStyle(json) ? json : null;
    } catch {
      return null;
    }
  })().then((style) => {
    // A failure is retried on the next map creation.
    if (!style) vectorStyle = null;
    return style;
  });
  return vectorStyle;
}

const tag = (layer: LayerSpecification, base: BaseLayer, shown: BaseLayer): LayerSpecification => {
  const visible = layer.layout?.visibility !== "none";
  return {
    ...layer,
    metadata: { ...(layer.metadata as object | undefined), [BASE_META.base]: base, [BASE_META.visible]: visible },
    layout: { ...layer.layout, visibility: visible && base === shown ? "visible" : "none" },
  } as LayerSpecification;
};

/** Pure pictogram layers (points of interest): dropped for a sober plan. */
const isPictogramOnly = (layer: LayerSpecification) => layer.type === "symbol" && layer.layout?.["icon-image"] !== undefined && layer.layout?.["text-field"] === undefined;

/**
 * Style with both IGN basemaps (one visible): the grey vector plan when its
 * style is given, else the desaturated raster plan; and the photographs.
 * @param base - Basemap shown first.
 * @param vector - Grey Plan IGN vector style ({@link loadIgnVectorStyle}), or null.
 */
export function buildIgnStyle(base: BaseLayer = "plan", vector: StyleSpecification | null = null): StyleSpecification {
  const photoSource: SourceSpecification = { type: "raster", tiles: [ignTileUrl("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")], tileSize: 256, maxzoom: 19, attribution: IGN_ATTRIBUTION };
  const photoLayer: LayerSpecification = { id: IGN_LAYER.photo, type: "raster", source: IGN_LAYER.photo };
  const background: LayerSpecification = { id: "background", type: "background", paint: { "background-color": MAP_NEUTRAL.land } };

  if (vector) {
    const sources: StyleSpecification["sources"] = {};
    for (const [id, source] of Object.entries(vector.sources)) sources[id] = { ...source, attribution: IGN_ATTRIBUTION } as SourceSpecification;
    return {
      version: 8,
      ...(vector.glyphs ? { glyphs: vector.glyphs } : {}),
      ...(vector.sprite ? { sprite: vector.sprite } : {}),
      sources: { ...sources, [IGN_LAYER.photo]: photoSource },
      layers: [
        background,
        ...vector.layers.filter((l) => !isPictogramOnly(l)).map((l) => tag(l, "plan", base)),
        tag(photoLayer, "photo", base),
      ],
    };
  }

  return {
    version: 8,
    sources: {
      [IGN_LAYER.plan]: { type: "raster", tiles: [ignTileUrl("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")], tileSize: 256, maxzoom: 19, attribution: IGN_ATTRIBUTION },
      [IGN_LAYER.photo]: photoSource,
    },
    layers: [
      background,
      // Grey and light, like the vector « gris » style.
      tag({ id: IGN_LAYER.plan, type: "raster", source: IGN_LAYER.plan, paint: { "raster-saturation": -1, "raster-contrast": -0.2, "raster-brightness-min": 0.12 } }, "plan", base),
      tag(photoLayer, "photo", base),
    ],
  };
}

/**
 * Switches the visible IGN basemap of a map built with {@link buildIgnStyle}.
 * @param map - Loaded map.
 * @param base - Basemap to show.
 */
export function setBaseLayer(map: Pick<MapLibreMap, "getStyle" | "setLayoutProperty">, base: BaseLayer): void {
  for (const layer of map.getStyle().layers) {
    const meta = layer.metadata as Record<string, unknown> | undefined;
    const layerBase = meta?.[BASE_META.base];
    if (layerBase !== "plan" && layerBase !== "photo") continue;
    map.setLayoutProperty(layer.id, "visibility", layerBase === base && meta?.[BASE_META.visible] !== false ? "visible" : "none");
  }
}
