"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type MapGeoJSONFeature, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { FilterX, MonitorX } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mapDataFromIndex, type FootprintRecord } from "@/domain/map-data";
import type { MapSiteProperties } from "@/domain/map-dto";
import { serializeFilters, withFilters } from "@/domain/filters/url";
import { EmptyState } from "@/components/empty/EmptyState";
import { useSiteFilters } from "@/components/filters/use-site-filters";
import { NATIONAL_VIEW_EVENT } from "@/components/shell/CommandBar";
import { useSiteIndex } from "@/components/sites/SiteIndexProvider";
import { replaceQuery } from "@/components/sites/url";
import { Button } from "@/components/ui/button";
import type { ComplianceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
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
import { readSiteParam, SITE_PARAM } from "./url-state";

/** Props of {@link NationalMap}. */
export interface NationalMapProps {
  /** Building footprints (the sites come from the shared site index). */
  footprints: FootprintRecord[];
  assets: MapAssets;
  isAdmin: boolean;
  /** Expose `window.__vigieMap` (never in a production deployment). */
  exposeTestHook: boolean;
  /**
   * - `full` (home page);
   * - `compact` (supervision): fixed national view, no control, no hover, no
   *   SitePeek; a click opens the main map on the site;
   * - `site` (site sheet preview): centred on one site (zoom 16, pitch 55),
   *   only its point and footprint, no control; a click opens the main map.
   */
  variant?: "full" | "compact" | "site";
  /** For the `site` variant: the site shown and its position (lon, lat). */
  site?: { code: string; center: [number, number] };
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
/** Reframing on the filtered results: debounce, padding, max zoom. */
export const REFRAME = {
  debounceMs: 400,
  /** Leaves room for the chips (top), the legend and rail (left), the controls (right). */
  padding: { top: 130, bottom: 70, left: 380, right: 110 },
  maxZoom: 12,
  pitchZoomOut: 0.5,
  durationMs: 900,
} as const;
/** Camera of the site preview (`site` variant). */
export const SITE_PREVIEW = { zoom: 16, pitch: 55 } as const;
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

/** Bounds of located points, or null. */
function boundsOf(points: readonly [number, number][]): maplibregl.LngLatBounds | null {
  if (points.length === 0) return null;
  const bounds = new maplibregl.LngLatBounds();
  for (const p of points) bounds.extend(p);
  return bounds;
}

/**
 * National map (MapLibre GL), fully offline: full Protomaps basemap when
 * installed, otherwise the local fallback style. The sites come from the
 * shared site index, FILTERED by the URL filters; the selection is `?site=`.
 */
export default function NationalMap({ footprints, assets, isAdmin, exposeTestHook, variant = "full", site }: NationalMapProps) {
  // Every non-full variant is static: no control, no hover, no SitePeek.
  const compact = variant !== "full";
  const preview = variant === "site" ? site : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<number, maplibregl.Marker>());
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const router = useRouter();
  const params = useSearchParams();

  const { evaluatedOn } = useSiteIndex();
  const { entries, filtered, filters, activeCount, toggleValue, clear } = useSiteFilters();
  const hook = exposeTestHook && !compact;

  const [supported, setSupported] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [is3d, setIs3d] = useState(true);

  const selectedCode = compact ? null : readSiteParam(params);
  const selectedRef = useRef<string | null>(selectedCode);

  // All sites (lookups, legend totals) and the filtered ones (drawn).
  // The site preview draws its own site only, whatever the filters.
  const previewCode = preview?.code;
  const shown = useMemo(() => (previewCode ? entries.filter((e) => e.code === previewCode) : filtered), [previewCode, entries, filtered]);
  const all = useMemo(() => mapDataFromIndex(entries, footprints, evaluatedOn), [entries, footprints, evaluatedOn]);
  const data = useMemo(() => mapDataFromIndex(shown, footprints, evaluatedOn), [shown, footprints, evaluatedOn]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const sitesByCode = useMemo(() => new Map(all.points.features.map((f) => [f.properties.code, f])), [all]);
  const sitesById = useMemo(() => new Map(all.points.features.map((f) => [f.properties.id, f])), [all]);
  const visibleCodes = useMemo(() => new Set(data.points.features.map((f) => f.properties.code)), [data]);
  const footprintsById = useMemo(() => new Map(all.footprints.features.map((f) => [f.properties.id, f.properties])), [all]);
  const sitesList = useMemo(() => data.points.features.map((f) => f.properties), [data]);
  const filtersKey = serializeFilters(filters).toString();
  const fallback = !assets.basemap;

  const updateHook = useCallback(
    (patch: Partial<NonNullable<Window["__vigieMap"]>>) => {
      if (!hook) return;
      window.__vigieMap = { ready: false, selectedCode: null, ...window.__vigieMap, ...patch };
    },
    [hook],
  );

  /** Selects a site (or clears the selection) through the URL. */
  const select = useCallback((code: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (code) next.set(SITE_PARAM, code);
    else next.delete(SITE_PARAM);
    replaceQuery(next.toString());
  }, []);

  /** Compact variant: opens the main map on a site, filters kept. */
  const openOnMainMap = useCallback(
    (code: string) => {
      const q = withFilters(window.location.search, filters, ["site", "present", "sort"]);
      router.push(`/?${[q, `site=${encodeURIComponent(code)}`].filter(Boolean).join("&")}`);
    },
    [filters, router],
  );
  const onPointClick = useRef<(code: string) => void>(() => {});
  onPointClick.current = compact ? openOnMainMap : (code: string) => select(code);

  /** Reframes the camera on the filtered located sites. */
  const reframe = useCallback((animate: boolean) => {
    const m = mapRef.current;
    const bounds = boundsOf(dataRef.current.points.features.map((f) => f.geometry.coordinates as [number, number]));
    if (!m || !bounds) return;
    // Camera computed flat, then pulled back a little when the map is tilted
    // (a pitched view shows less ground towards the horizon).
    const camera = m.cameraForBounds(bounds, { padding: REFRAME.padding, maxZoom: REFRAME.maxZoom, bearing: m.getBearing() });
    if (!camera?.center || camera.zoom === undefined) return;
    const zoom = Math.min(REFRAME.maxZoom, camera.zoom - (m.getPitch() > 10 ? REFRAME.pitchZoomOut : 0));
    m.easeTo({ center: camera.center, zoom, bearing: m.getBearing(), pitch: m.getPitch(), duration: animate && !reducedRef.current ? REFRAME.durationMs : 0 });
  }, []);

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
          ...(preview
            ? { center: preview.center, zoom: SITE_PREVIEW.zoom, pitch: SITE_PREVIEW.pitch }
            : { bounds: FRANCE_BOUNDS, fitBoundsOptions: { padding: compact ? 16 : 48 }, pitch: INITIAL_VIEW.pitch }),
          bearing: INITIAL_VIEW.bearing,
          maxBounds: MAX_BOUNDS,
          minZoom: compact ? 3 : 4,
          maxZoom: 18,
          maxPitch: 70,
          attributionControl: false,
          // Compact: fixed national view, clicks only.
          dragPan: !compact,
          dragRotate: !compact,
          scrollZoom: !compact,
          boxZoom: !compact,
          doubleClickZoom: !compact,
          keyboard: !compact,
          touchZoomRotate: !compact,
          touchPitch: !compact,
          canvasContextAttributes: { antialias: true },
        });
      } catch (error) {
        devWarn("création impossible", error);
        setSupported(false);
        return;
      }
      mapRef.current = map;
      const m = map;
      m.addControl(new maplibregl.AttributionControl({ compact }), "bottom-right");
      m.on("error", (e) => devWarn(e.error?.message ?? e));

      m.on("load", () => {
        m.addSource(SITES_SOURCE, sitesSource(dataRef.current.points));
        m.addSource(FOOTPRINTS_SOURCE, footprintsSource(dataRef.current.footprints));
        for (const layer of SITE_LAYERS) m.addLayer(layer);
        setLoaded(true);
        // Site preview: its site is highlighted, no halo animation, any click opens the main map.
        if (preview) {
          const id = dataRef.current.points.features[0]?.properties.id;
          m.setFilter(LAYER.selected, ["==", ["get", "code"], preview.code]);
          if (id) m.setFeatureState({ source: FOOTPRINTS_SOURCE, id }, { selected: true });
          m.on("click", () => onPointClick.current(preview.code));
          m.getCanvas().style.cursor = "pointer";
          return;
        }

        // Pulsing halo of the critical sites: throttled to ~15 fps (a pulse
        // needs no more) and paused in a hidden tab — every paint change
        // re-renders the whole map.
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
        raf = requestAnimationFrame(pulse);
      });

      // Ready: after `idle`, or — since the pulsing halo repaints and may
      // prevent `idle` — once the style and the sites are rendered.
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
          const count = String(props.point_count ?? "");
          const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
          const existing = markers.get(id);
          if (existing) {
            existing.setLngLat(coords);
            if (existing.getElement().textContent !== count) existing.getElement().textContent = count;
            continue;
          }
          const el = document.createElement("div");
          el.className = "vigie-cluster-count";
          el.textContent = count;
          el.setAttribute("aria-hidden", "true");
          markers.set(id, new maplibregl.Marker({ element: el, pitchAlignment: "viewport" }).setLngLat(coords).addTo(m));
        }
        for (const [id, marker] of markers) {
          if (!seen.has(id)) {
            marker.remove();
            markers.delete(id);
          }
        }
      };
      m.on("render", syncClusterMarkers);

      // Hover preview (full map only).
      m.on("mousemove", LAYER.points, (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        m.getCanvas().style.cursor = "pointer";
        if (!compact) setHover({ id, x: e.point.x, y: e.point.y });
      });
      m.on("mouseleave", LAYER.points, () => {
        m.getCanvas().style.cursor = preview ? "pointer" : "";
        setHover(null);
      });
      m.on("mouseenter", LAYER.clusters, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", LAYER.clusters, () => (m.getCanvas().style.cursor = ""));

      // Click: point → selection (or main map); cluster → zoom to its extent.
      m.on("click", LAYER.points, (e) => {
        if (preview) return; // handled by the whole-map click
        const code = e.features?.[0]?.properties?.code as string | undefined;
        if (code) onPointClick.current(code);
      });
      m.on("click", LAYER.clusters, (e) => {
        if (compact) return;
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = f?.properties?.cluster_id as number | undefined;
        if (clusterId === undefined) return;
        const source = m.getSource(SITES_SOURCE) as GeoJSONSource;
        void source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const bounds = boundsOf(leaves.map((leaf) => (leaf.geometry as GeoJSON.Point).coordinates as [number, number]));
          if (bounds) m.fitBounds(bounds, { padding: 120, maxZoom: 12, duration: reducedRef.current ? 0 : 900 });
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
      if (hook) delete window.__vigieMap;
    };
    // The map is created once; data changes are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered data → sources (the cluster counts follow the filters).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    (m.getSource(SITES_SOURCE) as GeoJSONSource | undefined)?.setData(data.points);
    (m.getSource(FOOTPRINTS_SOURCE) as GeoJSONSource | undefined)?.setData(data.footprints);
  }, [data, loaded]);

  // Reframe after a filter change (debounced), and at load when the URL has
  // filters. Never while SitePeek is open nor on an empty result.
  const firstFrame = useRef(true);
  useEffect(() => {
    if (!loaded || compact) return;
    const initial = firstFrame.current;
    firstFrame.current = false;
    if (initial && (activeCount === 0 || selectedRef.current)) return;
    const timer = window.setTimeout(() => {
      if (selectedRef.current || dataRef.current.points.features.length === 0) return;
      reframe(!initial);
    }, initial ? 0 : REFRAME.debounceMs);
    return () => window.clearTimeout(timer);
  }, [filtersKey, loaded, compact, activeCount, reframe]);

  // National view requested by the palette.
  const nationalView = useCallback(() => {
    mapRef.current?.fitBounds(FRANCE_BOUNDS, { padding: 48, pitch: is3d ? INITIAL_VIEW.pitch : 0, bearing: INITIAL_VIEW.bearing, duration: reducedRef.current ? 0 : 1200 });
  }, [is3d]);
  useEffect(() => {
    if (compact) return;
    window.addEventListener(NATIONAL_VIEW_EVENT, nationalView);
    return () => window.removeEventListener(NATIONAL_VIEW_EVENT, nationalView);
  }, [compact, nationalView]);

  // ── Selection (?site=): highlight, camera flight, test hook ─────────────
  useEffect(() => {
    const m = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selectedCode;
    updateHook({ selectedCode });
    if (!m || !loaded) return;

    m.setFilter(LAYER.selected, ["==", ["get", "code"], selectedCode ?? ""]);
    const prevId = previous ? sitesByCode.get(previous)?.properties.id : undefined;
    if (prevId && m.getSource(FOOTPRINTS_SOURCE)) m.setFeatureState({ source: FOOTPRINTS_SOURCE, id: prevId }, { selected: false });
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
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (selectedRef.current) select(null);
      else setListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, select]);

  const duration = (ms: number) => (reducedMotion ? 0 : ms);
  const selected: MapSiteProperties | undefined = selectedCode ? sitesByCode.get(selectedCode)?.properties : undefined;
  const hovered: MapSiteProperties | undefined = hover ? sitesById.get(hover.id)?.properties : undefined;
  const noResult = filtered.length === 0 && entries.length > 0;

  if (!supported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <EmptyState
          icon={MonitorX}
          title="Carte indisponible"
          headingLevel="h2"
          description="Ce navigateur ne permet pas d'afficher la carte (WebGL désactivé ou indisponible). La liste des sites reste accessible."
        >
          {!compact && (
            <Button variant="secondary" onClick={() => setListOpen(true)}>
              Afficher la liste des sites
            </Button>
          )}
        </EmptyState>
        {listOpen && <SiteListPanel sites={sitesList} selectedCode={null} onSelect={(code) => (window.location.href = `/sites/${sitesByCode.get(code)?.properties.id ?? ""}`)} onClose={() => setListOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("vigie-map absolute inset-0", compact && "vigie-map-compact")}>
      {/* h-full/w-full: MapLibre's stylesheet forces `position: relative` on the container. */}
      <div ref={containerRef} className="h-full w-full" data-slot="map-container" />
      {!compact && (
        <>
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
            onFitResults={() => reframe(true)}
            listOpen={listOpen}
            onToggleList={() => setListOpen((o) => !o)}
          />
          <MapLegend
            counts={all.counts}
            filteredCounts={activeCount > 0 ? data.counts : null}
            selectedStatuses={filters.status}
            onToggleStatus={(s: ComplianceStatus) => toggleValue("status", s)}
            unlocated={data.unlocated}
          />
          {noResult && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
              <div className="glass pointer-events-auto rounded-lg px-8 py-7 shadow-panel" data-slot="no-result">
                <EmptyState icon={FilterX} title="Aucun site ne correspond aux filtres" headingLevel="h2">
                  <Button variant="secondary" onClick={clear}>
                    Effacer les filtres
                  </Button>
                </EmptyState>
              </div>
            </div>
          )}
          {listOpen && !selected && <SiteListPanel sites={sitesList} selectedCode={selectedCode} onSelect={(code) => select(code)} onClose={() => setListOpen(false)} />}
          {selected && (
            <SitePeek
              key={selected.id}
              site={selected}
              reasons={all.reasonsById[selected.id] ?? selected.reasons}
              footprint={footprintsById.get(selected.id) ?? null}
              hiddenByFilters={!visibleCodes.has(selected.code)}
              reducedMotion={reducedMotion}
              onClose={() => select(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
