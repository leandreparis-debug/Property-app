/**
 * Colors of the map, copied from the design tokens of src/app/globals.css
 * (MapLibre paints on a canvas and cannot read CSS variables). A unit test
 * checks that these values match the CSS tokens.
 *
 * - NEUTRAL: the only colors the basemap may use.
 * - STATUS: reserved for the sites (points, cluster rings, footprint edges).
 * - ACCENT: selection and focus only.
 */
import type { ComplianceStatus } from "@/lib/status";

/** Neutral design tokens (CSS custom property → value). */
export const NEUTRAL = {
  bg: "#f5f2ec",
  surface1: "#ffffff",
  surface2: "#faf8f4",
  surface3: "#efeae1",
  border: "#e7e1d7",
  borderStrong: "#cfc5b5",
  text: "#1d1b18",
  textMuted: "#635d54",
} as const;

/** Map-specific neutrals of the offline basemap (light, warm, derived from the tokens). */
export const MAP_NEUTRAL = {
  land: "#f1ece3",
  water: "#d6e0e6",
  /** Motorways and expressways: service axes, stronger than other roads. */
  highway: "#d9c7a4",
  highwayHalo: "#fbf7ef",
  majorRoad: "#ffffff",
  minorRoad: "#faf7f1",
  rail: "#d3cabb",
  landcover: "#e6e9d8",
} as const;

/** Status colors (RESERVED for the sites). */
export const STATUS_COLORS: Readonly<Record<ComplianceStatus, string>> = {
  ok: "#2f8f5b",
  warning: "#c98512",
  critical: "#cf3b32",
  unknown: "#8b867d",
};

/** Accent (selection, focus). */
export const ACCENT = "#1b4f9c";

/** Selected building volume: accent mixed with the light volume tone (edge stays pure accent). */
export const ACCENT_VOLUME = "#9fb6dc";

/**
 * Building volumes (neutral only, never status colors): two very close
 * warm light tones alternate between cells, firewalls and parapets are
 * darker, docks darker still.
 */
export const VOLUME_COLORS = {
  cellEven: "#ece6db",
  cellOdd: "#e3dccf",
  firewall: "#cfc5b5",
  edge: "#a89c88",
  dock: "#8f8472",
} as const;
