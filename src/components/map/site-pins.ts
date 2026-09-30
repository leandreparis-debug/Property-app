/**
 * Site pins of the national map: white labels (surface, lease deadline or
 * code) with the status dot, drawn as HTML markers over the individual
 * (unclustered) sites. HTML markers need no glyphs, so they work on every
 * basemap (IGN raster, offline vector, fallback). The selected site's pin
 * turns accent.
 */
import type { MapSiteProperties } from "@/domain/map-dto";
import { DEADLINE_LABELS } from "@/domain/site-index";
import { STATUS_META } from "@/lib/status";

/** What the pins display. */
export type PinLabel = "surface" | "deadline" | "code";

/** Choices of the « Étiquette » selector. */
export const PIN_LABELS: readonly { value: PinLabel; labelFr: string }[] = [
  { value: "surface", labelFr: "Surface" },
  { value: "deadline", labelFr: "Échéance" },
  { value: "code", labelFr: "Code" },
];

const surface = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Text of a pin.
 * @param site - Point properties.
 * @param mode - Label mode.
 */
export function pinText(site: Pick<MapSiteProperties, "code" | "totalArea" | "deadline">, mode: PinLabel): string {
  if (mode === "code") return site.code;
  if (mode === "deadline") return DEADLINE_LABELS[site.deadline] ?? DEADLINE_LABELS.unknown;
  return site.totalArea !== null ? `${surface.format(site.totalArea)} m²` : "Surface ?";
}

/**
 * Fills a pin element (status dot + text) and its accessible name.
 * @param el - Pin button.
 * @param site - Point properties.
 * @param mode - Label mode.
 * @param selected - Selected site.
 */
export function renderPin(el: HTMLElement, site: MapSiteProperties, mode: PinLabel, selected: boolean): void {
  const text = pinText(site, mode);
  const key = `${text}|${site.status}|${selected}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.dataset.selected = selected ? "true" : "false";
  el.setAttribute("aria-label", `${site.name} (${site.code}) — ${STATUS_META[site.status].label} — ${text}`);
  el.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "vigie-pin-dot";
  dot.dataset.status = site.status;
  el.append(dot, document.createTextNode(text));
}
