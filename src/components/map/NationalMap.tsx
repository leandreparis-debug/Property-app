"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type MapGeoJSONFeature, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { MonitorX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MapSiteProperties, MapSitesData } from "@/domain/map-dto";
import { EmptyState } from "@/components/empty/EmptyState";
import { Button } from "@/components/ui/button";
import { FallbackBanner } from "./FallbackBanner";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";
import { SiteHoverCard } from "./SiteHoverCard";
import { SiteListPanel } from "./SiteListPanel";
import { SitePeek } from "./SitePeek";
import { FOOTPRINTS_SOURCE, LAYER, SITE_LAYERS, SITES_SOURCE, footprintsSource, haloAt, HALO_PULSE, sitesSource } from "./layers/sites";
import type { MapAssets } from "./style/assets";
import { buildAttributions } from "./style/attribution";
import { buildBasemapStyle } from "./style/basemap-style";
import { buildFallbackStyle, countriesFromTopology, type WorldTopology } from "./style/fallback-style";
import { readSiteParam, withSiteParam } from "./url-state";

/** Props of {@link NationalMap}. */
export interface NationalMapProps {
  data: MapSitesData;
  assets: MapAssets;
  isAdmin: boolean;
  /** Code from `?site=` read by the server page. */
  initialSiteCode: string | null;
  /** Expose `window.__vigieMap` (never in a production deployment). */
  exposeTestHook: boolean;
}

declare global {
  interface Window {
    __vigieMap?: { ready: boolean; selectedCode: string | null };
  }
}

/** Metropolitan France (west, south, east, north). */
export const FRANCE_BOUNDS: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.2];
/** Western Europe: the camera never leaves it. */
export const MAX_BOUNDS: LngLatBoundsLike = [
  [-20, 33],
  [25, 62],
];
export const INITIAL_VIEW = { pitch: 45, bearing: -8 } as const;
export const FLY = { zoom: 16, pitch: 60, durationMs: 1600 } as const;
/** Minimum delay between two halo frames (~15 fps). */
const HALO_FRAME_MS = 66;

// pmtiles:// protocol: registered once, removed when the last map unmounts.
let protocolUsers = 0;
function acquirePmtiles(): void {
  if (protocolUsers++ === 0) maplibregl.addProtocol("pmtiles", new Protocol().tile);
}
function releasePmtiles(): void {
  if (--protocolUsers === 0) maplibregl.removeProtocol("pmtiles");
}

function subscribeReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const reducedMotionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether the browser can create a WebGL context. */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const devWarn = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.warn("[carte]", ...args);
};

/**
 * National map (MapLibre GL), fully offline: full Protomaps basemap when
 * installed, otherwise the local fallback style. Sites colored and ranked by
 * compliance status, clusters, hover preview, camera flight and SitePeek on
 * selection, `?site=` in the URL, accessible list.
 */
export default function NationalMap({ data, assets, isAdmin, initialSiteCode, exposeTestHook }: NationalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<number, maplibregl.Marker>());
  const selectedRef = useRef<string | null>(initialSiteCode);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const [supported, setSupported] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(initialSiteCode);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [is3d, setIs3d] = useState(true);

  const sitesById = useMemo(() => new Map(data.points.features.map((f) => [f.properties.id, f])), [data]);
  const sitesByCode = useMemo(() => new Map(data.points.features.map((f) => [f.properties.code, f])), [data]);
  const footprintsById = useMemo(() => new Map(data.footprints.features.map((f) => [f.properties.id, f.properties])), [data]);
  const sitesList = useMemo(() => data.points.features.map((f) => f.properties), [data]);
  const fallback = !assets.basemap;

  const updateHook = useCallback(
    (patch: Partial<NonNullable<Window["__vigieMap"]>>) => {
      if (!exposeTestHook) return;
      window.__vigieMap = { ready: false, selectedCode: null, ...window.__vigieMap, ...patch };
    },
    [exposeTestHook],
  );

  // ── Map creation (once) ────────────────────────────────────────────────
  useEffect(() => {
    if (!webglAvailable()) {
      setSupported(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    const markers = markersRef.current;
    acquirePmtiles();
    updateHook({ ready: false, selectedCode: selectedRef.current });

    const buildStyle = async (): Promise<StyleSpecification> => {
      const origin = window.location.origin;
      const attributions = buildAttributions(assets.sources, fallback);
      if (!fallback) return buildBasemapStyle({ origin, ortho: assets.ortho, attributions });
      const topology = (await import("world-atlas/countries-50m.json")).default as unknown as WorldTopology;
      return buildFallbackStyle({ countries: countriesFromTopology(topology), origin, ortho: assets.ortho, attributions });
    };

    performance.mark("vigie-map:start");
    void buildStyle().then((style) => {
      if (cancelled) return;
      performance.mark("vigie-map:style");
      try {
        map = new maplibregl.Map({
          container,
          style,
          bounds: FRANCE_BOUNDS,
          fitBoundsOptions: { padding: 48 },
          pitch: INITIAL_VIEW.pitch,
          bearing: INITIAL_VIEW.bearing,
          maxBounds: MAX_BOUNDS,
          minZoom: 4,
          maxZoom: 18,
          maxPitch: 70,
          attributionControl: false,
          dragRotate: true,
          canvasContextAttributes: { antialias: true },
        });
      } catch (error) {
        devWarn("création impossible", error);
        setSupported(false);
        return;
      }
      mapRef.current = map;
      const m = map;
      m.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
      m.on("error", (e) => devWarn(e.error?.message ?? e));

      m.on("load", () => {
        m.addSource(SITES_SOURCE, sitesSource(data.points));
        m.addSource(FOOTPRINTS_SOURCE, footprintsSource(data.footprints));
        for (const layer of SITE_LAYERS) m.addLayer(layer);
        setLoaded(true);

        // Pulsing halo of the critical sites (paint properties only).
        // Throttled to ~15 fps (a pulse needs no more) and paused in a hidden
        // tab: every paint change re-renders the whole map.
        const start = performance.now();
        let last = 0;
        const pulse = (now: number) => {
          if (!mapRef.current) return;
          raf = requestAnimationFrame(pulse);
          if (document.hidden || now - last < HALO_FRAME_MS) return;
          last = now;
          if (reducedRef.current) {
            m.setPaintProperty(LAYER.halo, "circle-radius", 12);
            m.setPaintProperty(LAYER.halo, "circle-opacity", 0.25);
          } else {
            const { radius, opacity } = haloAt((now - start) / HALO_PULSE.periodMs);
            m.setPaintProperty(LAYER.halo, "circle-radius", radius);
            m.setPaintProperty(LAYER.halo, "circle-opacity", opacity);
          }
        };
        if (data.counts.critical > 0) raf = requestAnimationFrame(pulse);
      });

      // Ready: after `idle`, or — since the pulsing halo repaints every frame
      // and may prevent `idle` — once the style and the sites are rendered.
      let ready = false;
      const markReady = () => {
        if (ready) return;
        ready = true;
        performance.mark("vigie-map:ready");
        updateHook({ ready: true });
      };
      m.on("idle", markReady);
      m.on("render", () => {
        if (!ready && m.isStyleLoaded() && m.getSource(SITES_SOURCE) && m.isSourceLoaded(SITES_SOURCE)) markReady();
      });

      // Cluster counts: light HTML markers (Geist Mono, no glyph needed).
      const syncClusterMarkers = () => {
        if (!m.getSource(SITES_SOURCE)) return;
        const seen = new Set<number>();
        for (const f of m.querySourceFeatures(SITES_SOURCE)) {
          const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number };
          if (!props.cluster || props.cluster_id === undefined) continue;
          const id = props.cluster_id;
          if (seen.has(id)) continue;
          seen.add(id);
          if (!markers.has(id)) {
            const el = document.createElement("div");
            el.className = "vigie-cluster-count";
            el.textContent = String(props.point_count ?? "");
            el.setAttribute("aria-hidden", "true");
            const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
            markers.set(id, new maplibregl.Marker({ element: el, pitchAlignment: "viewport" }).setLngLat(coords).addTo(m));
          }
        }
        for (const [id, marker] of markers) {
          if (!seen.has(id)) {
            marker.remove();
            markers.delete(id);
          }
        }
      };
      m.on("render", syncClusterMarkers);

      // Hover preview.
      m.on("mousemove", LAYER.points, (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (!id) return;
        m.getCanvas().style.cursor = "pointer";
        setHover({ id, x: e.point.x, y: e.point.y });
      });
      m.on("mouseleave", LAYER.points, () => {
        m.getCanvas().style.cursor = "";
        setHover(null);
      });
      m.on("mouseenter", LAYER.clusters, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", LAYER.clusters, () => (m.getCanvas().style.cursor = ""));

      // Click: point → selection; cluster → zoom to its extent.
      m.on("click", LAYER.points, (e) => {
        const code = e.features?.[0]?.properties?.code as string | undefined;
        if (code) setSelectedCode(code);
      });
      m.on("click", LAYER.clusters, (e) => {
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = f?.properties?.cluster_id as number | undefined;
        if (clusterId === undefined) return;
        const source = m.getSource(SITES_SOURCE) as GeoJSONSource;
        void source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const bounds = new maplibregl.LngLatBounds();
          for (const leaf of leaves) bounds.extend((leaf.geometry as GeoJSON.Point).coordinates as [number, number]);
          m.fitBounds(bounds, { padding: 120, maxZoom: 12, duration: reducedRef.current ? 0 : 900 });
        });
      });

      resizeObserver = new ResizeObserver(() => m.resize());
      resizeObserver.observe(container);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map?.remove();
      mapRef.current = null;
      releasePmtiles();
      if (exposeTestHook) delete window.__vigieMap;
    };
    // The map is created once; data changes are pushed by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data refresh (same map, new GeoJSON).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    (m.getSource(SITES_SOURCE) as GeoJSONSource | undefined)?.setData(data.points);
    (m.getSource(FOOTPRINTS_SOURCE) as GeoJSONSource | undefined)?.setData(data.footprints);
  }, [data, loaded]);

  // ── Selection: highlight, camera flight, URL, test hook ────────────────
  useEffect(() => {
    const m = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selectedCode;
    updateHook({ selectedCode });
    const url = withSiteParam(window.location.href, selectedCode);
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      // replaceState: no history entry and no server re-render of the page.
      window.history.replaceState(window.history.state, "", url);
    }
    if (!m || !loaded) return;

    m.setFilter(LAYER.selected, ["==", ["get", "code"], selectedCode ?? ""]);
    const prevId = previous ? sitesByCode.get(previous)?.properties.id : undefined;
    if (prevId) m.setFeatureState({ source: FOOTPRINTS_SOURCE, id: prevId }, { selected: false });
    const feature = selectedCode ? sitesByCode.get(selectedCode) : undefined;
    if (!feature) return;
    m.setFeatureState({ source: FOOTPRINTS_SOURCE, id: feature.properties.id }, { selected: true });
    const center = feature.geometry.coordinates as [number, number];
    const camera = { center, zoom: FLY.zoom, pitch: FLY.pitch, bearing: m.getBearing() };
    if (reducedRef.current) m.jumpTo(camera);
    else m.flyTo({ ...camera, duration: FLY.durationMs, essential: false });
  }, [selectedCode, loaded, sitesByCode, updateHook]);

  // Escape closes the peek (or the list).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) setSelectedCode(null);
      else setListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Back/forward or manual edit of ?site=.
  useEffect(() => {
    const onPop = () => setSelectedCode(readSiteParam(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const duration = (ms: number) => (reducedMotion ? 0 : ms);
  const nationalView = () =>
    mapRef.current?.fitBounds(FRANCE_BOUNDS, { padding: 48, pitch: is3d ? INITIAL_VIEW.pitch : 0, bearing: INITIAL_VIEW.bearing, duration: duration(1200) });

  const selected = selectedCode ? sitesByCode.get(selectedCode)?.properties : undefined;
  const hovered: MapSiteProperties | undefined = hover ? sitesById.get(hover.id)?.properties : undefined;

  if (!supported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <EmptyState
          icon={MonitorX}
          title="Carte indisponible"
          headingLevel="h2"
          description="Ce navigateur ne permet pas d'afficher la carte (WebGL désactivé ou indisponible). La liste des sites reste accessible."
        >
          <Button variant="secondary" onClick={() => setListOpen(true)}>
            Afficher la liste des sites
          </Button>
        </EmptyState>
        {listOpen && <SiteListPanel sites={sitesList} selectedCode={null} onSelect={(code) => (window.location.href = `/sites/${sitesByCode.get(code)?.properties.id ?? ""}`)} onClose={() => setListOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="vigie-map absolute inset-0">
      {/* h-full/w-full: MapLibre's stylesheet forces `position: relative` on the container. */}
      <div ref={containerRef} className="h-full w-full" data-slot="map-container" />
      {fallback && <FallbackBanner isAdmin={isAdmin} />}
      {hovered && hover && !selected && <SiteHoverCard site={hovered} x={hover.x} y={hover.y} />}
      <MapControls
        is3d={is3d}
        shifted={Boolean(selected) || listOpen}
        onZoomIn={() => mapRef.current?.zoomIn({ duration: duration(300) })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: duration(300) })}
        onToggle3d={() => {
          const next = !is3d;
          setIs3d(next);
          mapRef.current?.easeTo({ pitch: next ? INITIAL_VIEW.pitch : 0, duration: duration(600) });
        }}
        onNorth={() => mapRef.current?.easeTo({ bearing: 0, duration: duration(600) })}
        onNational={nationalView}
        listOpen={listOpen}
        onToggleList={() => setListOpen((o) => !o)}
      />
      <MapLegend counts={data.counts} unlocated={data.unlocated} />
      {listOpen && !selected && (
        <SiteListPanel
          sites={sitesList}
          selectedCode={selectedCode}
          onSelect={(code) => setSelectedCode(code)}
          onClose={() => setListOpen(false)}
        />
      )}
      {selected && (
        <SitePeek
          key={selected.id}
          site={selected}
          reasons={data.reasonsById[selected.id] ?? selected.reasons}
          footprint={footprintsById.get(selected.id) ?? null}
          reducedMotion={reducedMotion}
          onClose={() => setSelectedCode(null)}
        />
      )}
    </div>
  );
}
