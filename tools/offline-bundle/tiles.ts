/**
 * Pure Web Mercator tile arithmetic (XYZ scheme, as WMTS « PM_0_19 »:
 * TileMatrix = z, TileCol = x, TileRow = y, origin top-left).
 */
import { bboxAround, type LonLat } from "./geo";

/** A tile address. */
export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** Web Mercator latitude limit. */
const MAX_LAT = 85.05112878;

/**
 * Tile containing a point at a zoom level.
 * @param lonLat - Point.
 * @param z - Zoom level.
 */
export function lonLatToTile(lonLat: LonLat, z: number): TileId {
  const n = 2 ** z;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lonLat[1]));
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lonLat[0] + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/**
 * North-west corner of a tile.
 * @returns [lon, lat].
 */
export function tileToLonLat(tile: TileId): LonLat {
  const n = 2 ** tile.z;
  const lon = (tile.x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Stable string key « z/x/y ». */
export function tileKey(tile: TileId): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Tiles covering a disc around a point (its bounding box) at one zoom.
 * @param center - Centre.
 * @param radiusM - Radius in metres.
 * @param z - Zoom level.
 */
export function tilesAround(center: LonLat, radiusM: number, z: number): TileId[] {
  const [west, south, east, north] = bboxAround(center, radiusM);
  const nw = lonLatToTile([west, north], z);
  const se = lonLatToTile([east, south], z);
  const tiles: TileId[] = [];
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) tiles.push({ z, x, y });
  return tiles;
}

/**
 * Deduplicated tile set for several sites and a zoom range, sorted by z, x, y.
 * @param centers - Site coordinates.
 * @param radiusM - Radius around each site.
 * @param minZoom - First zoom (inclusive).
 * @param maxZoom - Last zoom (inclusive).
 */
export function tilesForSites(centers: readonly LonLat[], radiusM: number, minZoom: number, maxZoom: number): TileId[] {
  const seen = new Map<string, TileId>();
  for (let z = minZoom; z <= maxZoom; z++) {
    for (const center of centers) for (const tile of tilesAround(center, radiusM, z)) seen.set(tileKey(tile), tile);
  }
  return [...seen.values()].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

/** MBTiles stores rows in the TMS scheme (origin bottom-left). */
export function xyzToTmsRow(tile: TileId): number {
  return 2 ** tile.z - 1 - tile.y;
}

/** Bounds (west, south, east, north) of a tile set, for the MBTiles metadata. */
export function tilesBounds(tiles: readonly TileId[]): [number, number, number, number] | null {
  if (tiles.length === 0) return null;
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const t of tiles) {
    const [w, n] = tileToLonLat(t);
    const [e, s] = tileToLonLat({ z: t.z, x: t.x + 1, y: t.y + 1 });
    west = Math.min(west, w);
    north = Math.max(north, n);
    east = Math.max(east, e);
    south = Math.min(south, s);
  }
  return [west, south, east, north];
}
