/**
 * Aerial imagery around the sites: IGN orthophotos (Géoplateforme WMTS,
 * ORTHOIMAGERY.ORTHOPHOTOS, TileMatrixSet PM_0_19), zooms 15–18 within
 * 500 m of each site, stored in an intermediate MBTiles then converted with
 * `pmtiles convert` into `ortho-sites.pmtiles`.
 */
import { rm, stat } from "node:fs/promises";
import { ENDPOINTS } from "../config";
import type { LonLat } from "../geo";
import { withQuery, type HttpClient } from "../http";
import { tilesForSites, type TileId } from "../tiles";
import { MbtilesWriter } from "./mbtiles";
import { runPmtiles } from "./pmtiles-cli";

/**
 * WMTS GetTile URL (KVP) of an orthophoto tile.
 * PM_0_19 uses the standard Web Mercator grid: TILEMATRIX = z, TILECOL = x, TILEROW = y.
 */
export function orthoTileUrl(tile: TileId): string {
  return withQuery(ENDPOINTS.wmts, {
    SERVICE: "WMTS",
    REQUEST: "GetTile",
    VERSION: "1.0.0",
    LAYER: ENDPOINTS.wmtsOrthoLayer,
    STYLE: "normal",
    TILEMATRIXSET: ENDPOINTS.wmtsOrthoTileMatrixSet,
    TILEMATRIX: tile.z,
    TILEROW: tile.y,
    TILECOL: tile.x,
    FORMAT: "image/jpeg",
  });
}

/** Result of the imagery build. */
export interface OrthoResult {
  tilesPlanned: number;
  tilesWritten: number;
  tilesMissing: number;
  bytes: number;
}

/**
 * Downloads the tiles and produces the PMTiles file.
 * @param options.centers - Site positions.
 * @param options.mbtilesPath - Intermediate file (deleted at the end).
 * @param options.output - `ortho-sites.pmtiles`.
 */
export async function buildOrtho(options: {
  http: HttpClient;
  centers: readonly LonLat[];
  radiusM: number;
  minZoom: number;
  maxZoom: number;
  mbtilesPath: string;
  output: string;
  attribution: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<OrthoResult> {
  const tiles = tilesForSites(options.centers, options.radiusM, options.minZoom, options.maxZoom);
  await rm(options.mbtilesPath, { force: true });
  const writer = new MbtilesWriter(options.mbtilesPath);
  let missing = 0;
  for (const [i, tile] of tiles.entries()) {
    const response = await options.http.request("ortho", orthoTileUrl(tile), { headers: { Accept: "image/jpeg, image/*" } });
    const isImage = response.status === 200 && (response.contentType ?? "").startsWith("image/");
    if (isImage && response.body.length > 0) writer.addTile(tile, response.body);
    else missing++;
    if (i % 100 === 0 || i === tiles.length - 1) options.onProgress?.(i + 1, tiles.length);
  }
  const written = writer.count;
  writer.finish({ name: "Vigie — orthophotographies des sites", format: "jpg", attribution: options.attribution });
  await rm(options.output, { force: true });
  await runPmtiles(["convert", options.mbtilesPath, options.output]);
  await rm(options.mbtilesPath, { force: true });
  return { tilesPlanned: tiles.length, tilesWritten: written, tilesMissing: missing, bytes: (await stat(options.output)).size };
}
