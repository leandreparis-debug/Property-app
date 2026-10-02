import "server-only";
import { mapDataFromIndex } from "@/domain/map-data";
import type { MapSitesData } from "@/domain/map-dto";
import { getSiteData } from "../sites/index";

/**
 * Data of the national map, derived from the site index (one query). The
 * compliance status is computed on read and never stored.
 *
 * @param today - Today's business date (injected; see todayDateOnly()).
 */
export async function getMapSites(today: Date): Promise<MapSitesData> {
  const { index, footprints, evaluatedOn } = await getSiteData(today);
  return mapDataFromIndex(index, footprints, evaluatedOn);
}
