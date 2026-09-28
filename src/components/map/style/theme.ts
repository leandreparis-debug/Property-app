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
  bg: "#07090c",
  surface1: "#0d1117",
  surface2: "#131923",
  surface3: "#1a2230",
  border: "#232c3b",
  borderStrong: "#33405a",
  text: "#e6eaf2",
  textMuted: "#8b96a8",
} as const;

/** Map-specific neutrals (derived from the tokens, darker for the canvas). */
export const MAP_NEUTRAL = {
  land: "#0b0f15",
  water: "#05070a",
  /** Motorways and expressways: service axes, lighter than other roads. */
  highway: "#3a4a66",
  highwayHalo: "#1b2433",
  majorRoad: "#1a2230",
  minorRoad: "#131923",
  rail: "#1a2230",
  landcover: "#0c1118",
} as const;

/** Status colors (RESERVED for the sites). */
export const STATUS_COLORS: Readonly<Record<ComplianceStatus, string>> = {
  ok: "#2fb67c",
  warning: "#f2a93b",
  critical: "#f0524f",
  unknown: "#5b6578",
};

/** Accent (selection, focus). */
export const ACCENT = "#6e8bff";

/** Selected building volume: accent at 35 % over surface-3 (edge stays pure accent). */
export const ACCENT_VOLUME = "#374778";
