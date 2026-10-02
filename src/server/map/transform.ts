/**
 * National map DTO from site rows: the site index (build.ts) projected by
 * the pure mapDataFromIndex (shared with the browser, which applies it to
 * the FILTERED entries).
 */
import { toIsoDate } from "@/domain/dates";
import { mapDataFromIndex } from "@/domain/map-data";
import type { MapSitesData } from "@/domain/map-dto";
import { buildSiteIndex, footprintsFromRows, parseFootprint, type SiteRow } from "../sites/build";

export { parseFootprint };

/** A site row as read for the map (see sites/build.ts). */
export type MapSiteRow = SiteRow;

/**
 * Builds the map DTO.
 * @param rows - Non-archived sites with their relations.
 * @param today - Today's business date (injected).
 */
export function buildMapSitesData(rows: readonly MapSiteRow[], today: Date): MapSitesData {
  return mapDataFromIndex(buildSiteIndex(rows, today), footprintsFromRows(rows), toIsoDate(today) ?? "");
}
