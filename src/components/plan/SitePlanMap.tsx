"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { MonitorX } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { volumeFeatures, type FootprintRecord } from "@/domain/map-data";
import type { MapVolumeProperties } from "@/domain/map-dto";
import { EmptyState } from "@/components/empty/EmptyState";
import { SELECTED_SITE_STATE, VOLUME_APPROX_LAYER, VOLUME_EDGES_LAYER, VOLUME_SOLID_LAYER, VOLUMES_SOURCE, volumesSource } from "@/components/map/layers/sites";
import type { MapAssets } from "@/components/map/style/assets";
import { buildMapStyle } from "@/components/map/style/build";
import { ACCENT, NEUTRAL } from "@/components/map/style/theme";
import { cn } from "@/lib/utils";
import { EQUIPMENT_LAYER, EQUIPMENT_LAYERS, EQUIPMENT_SOURCE, equipmentCollection, equipmentSource, registerEquipmentImages, SELECTED_EQUIPMENT_STATE } from "./equipment-layers";

/** Corners of the plan image (TL, TR, BR, BL) as [lon, lat]. */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** A numbered control point drawn on the map. */
export interface MapControlPoint {
  n: number;
  lngLat: [number, number];
  suspect?: boolean;
}

/** Props of {@link SitePlanMap}. */
export interface SitePlanMapProps {
  assets: MapAssets;
  /** Initial center ([lon, lat]); the volume's footprint otherwise. */
  center: [number, number] | null;
  volume: FootprintRecord | null;
  /** Calibrated plan overlay, or null. */
  overlay: { url: string; corners: Corners; opacity: number; visible: boolean } | null;
  equipments: readonly { id: string; type: string; label: string | null; lngLat: [number, number] | null }[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Placing mode: a click calls `onMapClick` instead of selecting. */
  placing?: boolean;
  onMapClick?: (lngLat: [number, number]) => void;
  /** The selected equipment can be dragged: live position, then end. */
  draggable?: boolean;
  onDrag?: (id: string, lngLat: [number, number]) => void;
  /** Arrow keys on the map move the selected equipment (east, north in metres). */
  onNudge?: (eastM: number, northM: number) => void;
  controlPoints?: readonly MapControlPoint[];
  is3d?: boolean;
  /** Incremented to re-center the camera on the site. */
  recenter?: number;
  /** Centers the camera on a position (a new `key` triggers the move). */
  focusOn?: { lngLat: [number, number]; key: number } | null;
  ariaLabel: string;
  /** Test hook name on `window` (e2e only), or undefined. */
  testHook?: "__vigiePlanMap" | "__vigieCalibrationMap";
  className?: string;
}

declare global {
  interface Window {
    __vigiePlanMap?: PlanMapHook;
    __vigieCalibrationMap?: PlanMapHook;
  }
}

/** State exposed to the e2e tests (never sensitive). */
export interface PlanMapHook {
  ready: boolean;
  planVisible: boolean;
  planOpacity: number | null;
  equipments: number;
  /** Projects [lon, lat] to container pixels (tests click precise positions). */
  project?: (lngLat: [number, number]) => { x: number; y: number };
}

const PLAN_SOURCE = "plan-image";
const PLAN_LAYER = "plan-image";
const VIEW = { zoom: 17.5, pitch3d: 55, minZoom: 12, maxZoom: 21 } as const;
/** Volume opacity while a plan is shown on top of it (the plan must stay readable). */
const VOLUME_UNDER_PLAN_OPACITY = 0.25;

let protocolUsers = 0;
const acquire = () => protocolUsers++ === 0 && maplibregl.addProtocol("pmtiles", new Protocol().tile);
const release = () => --protocolUsers === 0 && maplibregl.removeProtocol("pmtiles");

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function volumeCollection(volume: FootprintRecord | null): FeatureCollection<Polygon | MultiPolygon, MapVolumeProperties> {
  return { type: "FeatureCollection", features: volume ? volumeFeatures(volume) : [] };
}

/** Center of a footprint's bounding box. */
function footprintCenter(volume: FootprintRecord | null): [number, number] | null {
  if (!volume) return null;
  const positions = (volume.geometry.type === "Polygon" ? [volume.geometry.coordinates] : volume.geometry.coordinates).flat(2);
  if (!positions.length) return null;
  const lons = positions.map((p) => p[0]!);
  const lats = positions.map((p) => p[1]!);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

/**
 * Map of one site for the Plan tab and the calibration wizard: generated 3D
 * volume, calibrated plan overlay (MapLibre `image` source placed by its four
 * corners), equipment pictograms, numbered control points. Uses the same
 * styles as the national map (full basemap or fallback, aerial imagery when
 * installed) and works without any of them.
 */
export default function SitePlanMap(props: SitePlanMapProps) {
  const { assets, center, volume, overlay, equipments, selectedId = null, placing = false, controlPoints, is3d = false, recenter = 0, focusOn = null, ariaLabel, testHook, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(true);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const home = center ?? footprintCenter(volume);
  // Latest props for the handlers registered once.
  const latest = useRef(props);
  latest.current = props;

  const hook = (patch: Partial<PlanMapHook>) => {
    if (!testHook) return;
    window[testHook] = { ready: false, planVisible: false, planOpacity: null, equipments: 0, ...window[testHook], ...patch };
  };

  // ── Creation (once) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!webglAvailable()) {
      setSupported(false);
      return;
    }
    const container = containerRef.current;
    if (!container || !home) return;
    let cancelled = false;
    acquire();
    void buildMapStyle(assets).then((style) => {
      if (cancelled) return;
      const map = new maplibregl.Map({
        container,
        style,
        center: home,
        zoom: VIEW.zoom,
        pitch: is3d ? VIEW.pitch3d : 0,
        minZoom: VIEW.minZoom,
        maxZoom: VIEW.maxZoom,
        maxPitch: 70,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", async () => {
        map.setGlobalStateProperty(SELECTED_SITE_STATE, "");
        map.addSource(VOLUMES_SOURCE, volumesSource(volumeCollection(latest.current.volume)));
        for (const layer of [VOLUME_SOLID_LAYER, VOLUME_APPROX_LAYER, VOLUME_EDGES_LAYER]) map.addLayer({ ...layer, minzoom: 0 });
        await registerEquipmentImages(map);
        if (cancelled) return;
        map.addSource(EQUIPMENT_SOURCE, equipmentSource(equipmentCollection(latest.current.equipments)));
        for (const layer of EQUIPMENT_LAYERS) map.addLayer(layer);
        map.setGlobalStateProperty(SELECTED_EQUIPMENT_STATE, latest.current.selectedId ?? "");
        setLoaded(true);
      });

      // Click: placing mode → position; otherwise select an equipment or zoom into a group.
      map.on("click", (e: MapMouseEvent) => {
        const p = latest.current;
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (p.placing || (p.onMapClick && !p.onSelect)) return p.onMapClick?.(lngLat);
        if (!map.getLayer(EQUIPMENT_LAYER.markers)) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: [EQUIPMENT_LAYER.markers, EQUIPMENT_LAYER.clusters] })[0];
        if (!hit) return p.onSelect?.(null);
        if (hit.properties?.cluster_id !== undefined) return map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom() + 2, 17.5) });
        p.onSelect?.(String(hit.properties?.id));
      });

      // Drag of the selected equipment.
      let dragging: string | null = null;
      map.on("mousedown", EQUIPMENT_LAYER.markers, (e) => {
        const p = latest.current;
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!p.draggable || !id || id !== p.selectedId) return;
        e.preventDefault();
        dragging = id;
        map.getCanvas().style.cursor = "grabbing";
      });
      map.on("mousemove", (e) => {
        if (dragging) latest.current.onDrag?.(dragging, [e.lngLat.lng, e.lngLat.lat]);
      });
      map.on("mouseup", () => {
        dragging = null;
        map.getCanvas().style.cursor = latest.current.placing ? "crosshair" : "";
      });
      map.on("mouseenter", EQUIPMENT_LAYER.markers, () => {
        if (!latest.current.placing) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", EQUIPMENT_LAYER.markers, () => {
        if (!latest.current.placing) map.getCanvas().style.cursor = "";
      });
    });
    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      release();
      if (testHook) delete window[testHook];
    };
    // Created once; the effects below push the changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Volume.
  useEffect(() => {
    if (loaded) (mapRef.current?.getSource(VOLUMES_SOURCE) as GeoJSONSource | undefined)?.setData(volumeCollection(volume));
  }, [volume, loaded]);

  // Plan overlay: image source, opacity, visibility; the volume fades under it.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    const source = m.getSource(PLAN_SOURCE) as ImageSource | undefined;
    if (!overlay) {
      if (m.getLayer(PLAN_LAYER)) m.removeLayer(PLAN_LAYER);
      if (source) m.removeSource(PLAN_SOURCE);
    } else if (!source) {
      m.addSource(PLAN_SOURCE, { type: "image", url: overlay.url, coordinates: overlay.corners });
      m.addLayer({ id: PLAN_LAYER, type: "raster", source: PLAN_SOURCE, paint: { "raster-opacity": overlay.opacity, "raster-fade-duration": 0 } }, VOLUME_SOLID_LAYER.id);
    } else {
      source.updateImage({ url: overlay.url, coordinates: overlay.corners });
    }
    if (overlay && m.getLayer(PLAN_LAYER)) {
      m.setPaintProperty(PLAN_LAYER, "raster-opacity", overlay.opacity);
      m.setLayoutProperty(PLAN_LAYER, "visibility", overlay.visible ? "visible" : "none");
    }
    const faded = Boolean(overlay?.visible);
    for (const id of [VOLUME_SOLID_LAYER.id, VOLUME_EDGES_LAYER.id]) m.setPaintProperty(id, "fill-extrusion-opacity", faded ? VOLUME_UNDER_PLAN_OPACITY : id === VOLUME_SOLID_LAYER.id ? 0.92 : 0.95);
    hook({ planVisible: Boolean(overlay?.visible), planOpacity: overlay ? overlay.opacity : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.url, overlay?.corners, overlay?.opacity, overlay?.visible, loaded]);

  // Equipments and selection.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    (m.getSource(EQUIPMENT_SOURCE) as GeoJSONSource | undefined)?.setData(equipmentCollection(equipments));
    hook({ equipments: equipments.filter((e) => e.lngLat).length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipments, loaded]);
  useEffect(() => {
    if (loaded) mapRef.current?.setGlobalStateProperty(SELECTED_EQUIPMENT_STATE, selectedId ?? "");
  }, [selectedId, loaded]);

  // Control points: numbered HTML markers (no glyph needed).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = (controlPoints ?? []).map((p) => {
      const el = document.createElement("div");
      el.className = "control-point";
      el.dataset.slot = "map-control-point";
      el.textContent = String(p.n);
      Object.assign(el.style, {
        width: "22px",
        height: "22px",
        borderRadius: "999px",
        display: "grid",
        placeItems: "center",
        font: "600 11px var(--font-mono, monospace)",
        color: NEUTRAL.text,
        background: NEUTRAL.surface2,
        border: `2px solid ${p.suspect ? NEUTRAL.textMuted : ACCENT}`,
        borderStyle: p.suspect ? "dashed" : "solid",
        pointerEvents: "none",
      });
      return new maplibregl.Marker({ element: el }).setLngLat(p.lngLat).addTo(m);
    });
  }, [controlPoints, loaded]);

  // Placing cursor.
  useEffect(() => {
    const m = mapRef.current;
    if (m && loaded) m.getCanvas().style.cursor = placing ? "crosshair" : "";
  }, [placing, loaded]);

  // 2D / 3D and re-centering.
  useEffect(() => {
    const m = mapRef.current;
    const pitch = is3d ? VIEW.pitch3d : 0;
    if (m && loaded && Math.abs(m.getPitch() - pitch) > 0.5) m.easeTo({ pitch, duration: 500 });
  }, [is3d, loaded]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded || recenter === 0 || !home) return;
    m.easeTo({ center: home, zoom: VIEW.zoom, bearing: 0, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter, loaded]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded || !focusOn) return;
    m.easeTo({ center: focusOn.lngLat, zoom: Math.max(m.getZoom(), 18.5), duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOn?.key, loaded]);

  useEffect(() => {
    if (!loaded || !testHook) return;
    hook({ ready: true, project: (lngLat) => mapRef.current!.project(lngLat) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Arrow keys move the selected equipment instead of the camera.
  const onKeyDownCapture = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const p = latest.current;
    if (!p.onNudge || !p.selectedId || !p.draggable) return;
    const step = e.shiftKey ? 5 : 0.5;
    const delta = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    p.onNudge(delta[0]!, delta[1]!);
  };

  if (!supported) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-1 p-6", className)}>
        <EmptyState icon={MonitorX} headingLevel="h3" title="Carte indisponible" description="Le navigateur ne permet pas l'affichage 3D (WebGL). La liste des équipements reste utilisable." />
      </div>
    );
  }
  if (!home) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-1 p-6", className)}>
        <EmptyState headingLevel="h3" title="Site non localisé" description="Renseignez les coordonnées du site pour afficher la carte. La liste des équipements reste utilisable." />
      </div>
    );
  }
  // MapLibre sets `position: relative` on its container: the positioning
  // classes go on a wrapper, the container only fills it.
  return (
    <div className={cn("bg-bg", className)}>
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        data-slot="site-plan-map"
        data-ready={loaded || undefined}
        onKeyDownCapture={onKeyDownCapture}
        className="h-full w-full"
      />
    </div>
  );
}
