"use client";

import dynamic from "next/dynamic";
import type { NationalMapProps } from "./NationalMap";

/**
 * Client-only, lazily loaded national map: MapLibre, PMTiles and the
 * basemap code live in their own chunk, downloaded by the map page only
 * (never by the login screen or the other pages). No server rendering.
 */
const loadMap = () => import("./NationalMap");
const loadWorld = () => import("world-atlas/countries-50m.json");

// Start downloading the map chunk as soon as this module runs in the browser
// (during hydration), instead of waiting for the first render.
if (typeof window !== "undefined") void loadMap();

const NationalMap = dynamic(loadMap, {
  ssr: false,
  loading: () => (
    <div aria-hidden="true" className="absolute inset-0 bg-bg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(7_9_12/0.55)_55%,var(--color-bg)_100%)]" />
    </div>
  ),
});

export function NationalMapLoader(props: NationalMapProps) {
  // Fallback basemap: fetch the country data in parallel with the map chunk.
  if (typeof window !== "undefined" && !props.assets.basemap) void loadWorld();
  return <NationalMap {...props} />;
}
