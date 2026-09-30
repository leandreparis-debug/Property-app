/**
 * Hand-drawn equipment pictograms (no sprite, no font, no dependency).
 *
 * Each pictogram is the inner markup of a 24 × 24 SVG drawn with strokes in
 * the `GLYPH` color; {@link markerSvg} places it in the marker SHAPE of its
 * category, filled with surface-2. Status colors are never used; the accent
 * only appears on the selection ring (a separate map layer).
 *
 * At load time, the map rasterizes each marker to a canvas and registers it
 * with `map.addImage` (see equipment-images.ts).
 */
import type { MarkerShape } from "@/domain/equipment/catalog";

/** Marker fill (surface-2), outline (border-strong) and glyph (text) colors. */
export const MARKER_COLORS = { fill: "#131923", outline: "#8b96a8", glyph: "#e6eaf2" } as const;

/** Pictograms by icon key (inner SVG, 24 × 24 units, stroke = glyph color). */
export const PICTOGRAMS: Readonly<Record<string, string>> = {
  // Incendie
  extinguisher: '<rect x="9" y="8" width="6" height="12" rx="2"/><path d="M12 8V5h3M10 5h5l2 2"/>',
  hose: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.5"/><path d="M18 12h3"/>',
  sprinkler: '<path d="M12 4v7M8 11h8"/><path d="M9 15l-1.5 3M12 15v4M15 15l1.5 3"/>',
  hydrant: '<path d="M9 20V10a3 3 0 0 1 6 0v10M7 20h10M7 13h2M15 13h2M12 5V4"/>',
  reserve: '<path d="M5 9c2-2 4 2 7 0s5 2 7 0"/><path d="M5 9v9h14V9"/>',
  alarm: '<rect x="5" y="6" width="14" height="12" rx="1.5"/><path d="M8 10h8M8 14h5"/>',
  vent: '<path d="M5 17h14M7 17l2-9h6l2 9"/><path d="M12 5v3"/>',
  lever: '<rect x="7" y="4" width="10" height="16" rx="1.5"/><path d="M12 8v5"/><circle cx="12" cy="15" r="1.5"/>',
  door: '<path d="M7 20V4h10v16"/><path d="M5 20h14"/><circle cx="14.5" cy="12" r="0.8"/>',
  // Électricité
  panel: '<rect x="6" y="4" width="12" height="16" rx="1"/><path d="M9 8h6M9 12h6M9 16h6"/>',
  bolt: '<path d="M13 3L7 13h5l-1 8 6-10h-5z"/>',
  generator: '<circle cx="12" cy="12" r="7"/><path d="M9 14c1-4 5-0 6-4"/>',
  battery: '<rect x="5" y="8" width="13" height="9" rx="1"/><path d="M18 11h2v3h-2M10 10l-1.5 3h3L10 16"/>',
  // Fluides
  flame: '<path d="M12 4c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  tank: '<rect x="4" y="8" width="16" height="9" rx="4.5"/><path d="M8 17v2M16 17v2"/>',
  valve: '<path d="M4 9v6l8-3zM20 9v6l-8-3z"/><path d="M12 12V6M9 6h6"/>',
  // Environnement
  separator: '<path d="M5 8h14v10H5z"/><path d="M10 8v6M14 12v6"/>',
  basin: '<path d="M4 8l2 10h12l2-10"/><path d="M7 13c2-1 3 1 5 0s3 1 5 0"/>',
  gate: '<path d="M5 18h14M8 18V7M16 18V7M8 11h8"/><path d="M11 7h2"/>',
  // Sécurité des personnes
  heart: '<path d="M12 19l-6-6a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>',
  assembly: '<circle cx="12" cy="7" r="1.6"/><circle cx="7" cy="11" r="1.4"/><circle cx="17" cy="11" r="1.4"/><path d="M12 10v5M7 14v3M17 14v3M5 20h14"/>',
};

/** Pictogram of unknown types. */
export const FALLBACK_PICTOGRAM = '<circle cx="12" cy="12" r="1.5"/><path d="M12 6v3M12 15v3"/>';

/** Outline path of a marker shape in a 32 × 32 box. */
function shapePath(shape: MarkerShape): string {
  switch (shape) {
    case "circle":
      return '<circle cx="16" cy="16" r="14"/>';
    case "square":
      return '<rect x="3" y="3" width="26" height="26" rx="3"/>';
    case "diamond":
      return '<path d="M16 1.5L30.5 16 16 30.5 1.5 16z"/>';
    case "hexagon":
      return '<path d="M16 2l12.5 7v14L16 30 3.5 23V9z"/>';
    case "pill":
      return '<rect x="1.5" y="6" width="29" height="20" rx="10"/>';
  }
}

/**
 * SVG of a marker: category shape (surface-2 fill, muted outline) and the
 * type pictogram (light strokes). 32 × 32 units.
 * @param shape - Category shape.
 * @param icon - Pictogram key.
 */
export function markerSvg(shape: MarkerShape, icon: string): string {
  const glyph = PICTOGRAMS[icon] ?? FALLBACK_PICTOGRAM;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' +
    `<g fill="${MARKER_COLORS.fill}" stroke="${MARKER_COLORS.outline}" stroke-width="1.5">${shapePath(shape)}</g>` +
    `<g transform="translate(5.6 5.6) scale(0.86)" fill="none" stroke="${MARKER_COLORS.glyph}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>` +
    "</svg>"
  );
}
