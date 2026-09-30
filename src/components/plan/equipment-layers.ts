/**
 * Equipment markers on a MapLibre map (Plan tab and national map, zoom ≥ 17).
 *
 * - Markers are symbol layers whose images are the hand-drawn pictograms,
 *   rasterized once per map with `map.addImage` (no sprite, no font).
 * - Below zoom 17 the equipments are grouped (neutral discs sized by count).
 * - The selected equipment gets an accent ring (global state
 *   `selectedEquipmentId`), hovered ones a thinner one.
 */
import type { CircleLayerSpecification, ExpressionSpecification, GeoJSONSourceSpecification, Map as MapLibreMap, SymbolLayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import { categoryOf, EQUIPMENT_CATEGORIES, EQUIPMENT_TYPES, equipmentType } from "@/domain/equipment/catalog";
import { ACCENT, NEUTRAL } from "@/components/map/style/theme";
import { markerSvg, MARKER_COLORS } from "./pictograms";

export const EQUIPMENT_SOURCE = "equipments";
export const SELECTED_EQUIPMENT_STATE = "selectedEquipmentId";
export const EQUIPMENT_LAYER = { clusters: "equipment-clusters", markers: "equipment-markers", selected: "equipment-selected" } as const;
/** Grouped below this zoom; pictograms readable from 18. */
export const EQUIPMENT_CLUSTER_MAX_ZOOM = 16;
export const EQUIPMENT_MARKER_MIN_ZOOM = 17;

/** Properties of an equipment feature. */
export interface EquipmentFeatureProperties {
  id: string;
  type: string;
  label: string;
  icon: string;
}

/** Image name of a type's marker. */
export const markerImageName = (type: string) => `eq-${equipmentType(type) ? type : "UNKNOWN"}`;

/**
 * Feature collection of equipments with a position.
 * @param equipments - Equipments (id, type, label, [lon, lat]).
 */
export function equipmentCollection(equipments: readonly { id: string; type: string; label: string | null; lngLat: [number, number] | null }[]): FeatureCollection<Point, EquipmentFeatureProperties> {
  const features: Feature<Point, EquipmentFeatureProperties>[] = [];
  for (const e of equipments) {
    if (!e.lngLat) continue;
    features.push({ type: "Feature", id: e.id, geometry: { type: "Point", coordinates: e.lngLat }, properties: { id: e.id, type: e.type, label: e.label ?? "", icon: markerImageName(e.type) } });
  }
  return { type: "FeatureCollection", features };
}

/** Clustered GeoJSON source of the equipments. */
export function equipmentSource(data: FeatureCollection<Point, EquipmentFeatureProperties>): GeoJSONSourceSpecification {
  return { type: "geojson", data, cluster: true, clusterMaxZoom: EQUIPMENT_CLUSTER_MAX_ZOOM, clusterRadius: 36, promoteId: "id" };
}

const IS_SELECTED: ExpressionSpecification = ["==", ["get", "id"], ["to-string", ["global-state", SELECTED_EQUIPMENT_STATE]]];

/** Groups (zoom < 17): neutral discs, no status color. */
export const EQUIPMENT_CLUSTERS_LAYER: CircleLayerSpecification = {
  id: EQUIPMENT_LAYER.clusters,
  type: "circle",
  source: EQUIPMENT_SOURCE,
  filter: ["has", "point_count"],
  paint: {
    "circle-color": NEUTRAL.surface2,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 9, 20, 15, 100, 20],
    "circle-stroke-color": MARKER_COLORS.outline,
    "circle-stroke-width": 1.5,
    "circle-pitch-alignment": "viewport",
  },
};

/** Accent ring of the selected equipment (drawn under its pictogram). */
export const EQUIPMENT_SELECTED_LAYER: CircleLayerSpecification = {
  id: EQUIPMENT_LAYER.selected,
  type: "circle",
  source: EQUIPMENT_SOURCE,
  filter: ["all", ["!", ["has", "point_count"]], IS_SELECTED],
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 12, 18, 20, 21, 26],
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": ACCENT,
    "circle-stroke-width": 2.5,
    "circle-pitch-alignment": "viewport",
  },
};

/** Pictograms (individual equipments). */
export const EQUIPMENT_MARKERS_LAYER: SymbolLayerSpecification = {
  id: EQUIPMENT_LAYER.markers,
  type: "symbol",
  source: EQUIPMENT_SOURCE,
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": ["get", "icon"],
    "icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.55, 18, 1, 21, 1.25],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-pitch-alignment": "viewport",
    "symbol-sort-key": ["case", IS_SELECTED, 1, 0],
  },
};

/** Equipment layers in drawing order. */
export const EQUIPMENT_LAYERS = [EQUIPMENT_CLUSTERS_LAYER, EQUIPMENT_SELECTED_LAYER, EQUIPMENT_MARKERS_LAYER] as const;

/** Rasterizes one SVG to ImageData at `size` device pixels. */
function rasterize(svg: string, size: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image(size, size);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      // CPU-backed canvas: reading pixels back from a GPU canvas stalls the page.
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("canvas 2d indisponible"));
      ctx.drawImage(image, 0, 0, size, size);
      resolve(ctx.getImageData(0, 0, size, size));
    };
    image.onerror = () => reject(new Error("pictogramme illisible"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Registers the marker image of every catalog type (and of unknown types) on
 * a map. 32 CSS px, rendered at 2× for sharp pictograms.
 * @param map - A loaded map.
 */
export async function registerEquipmentImages(map: MapLibreMap): Promise<void> {
  if (map.hasImage(markerImageName("UNKNOWN"))) return;
  const unknownShape = EQUIPMENT_CATEGORIES[0].shape;
  const entries: [string, string][] = [
    ...EQUIPMENT_TYPES.map((t): [string, string] => [markerImageName(t.code), markerSvg(categoryOf(t.code)!.shape, t.icon)]),
    [markerImageName("UNKNOWN"), markerSvg(unknownShape, "")],
  ];
  const images = await Promise.all(entries.map(([, svg]) => rasterize(svg, 64)));
  entries.forEach(([name], i) => {
    if (!map.hasImage(name)) map.addImage(name, images[i]!, { pixelRatio: 2 });
  });
}
