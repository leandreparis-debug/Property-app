/**
 * Spherical Web Mercator (EPSG:3857), the projection of the map tiles.
 * Every computation local to a site (volume, plan calibration) is done in
 * these coordinates, in metres. Mercator metres are stretched by 1 / cos(lat)
 * relative to ground metres: see {@link mercatorScale}.
 */

/** Radius of the WGS 84 sphere used by Web Mercator, in metres. */
export const EARTH_RADIUS_M = 6_378_137;

/** Latitude limit of Web Mercator (degrees). */
export const MAX_LATITUDE = 85.05112878;

/** A position (lon, lat) in degrees, or (x, y) in metres. */
export type Point = readonly [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * WGS 84 longitude / latitude → Web Mercator metres.
 * @param lonLat - Degrees; the latitude is clamped to ±85.0511°.
 */
export function toMercator([lon, lat]: Point): [number, number] {
  const phi = rad(Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)));
  return [EARTH_RADIUS_M * rad(lon), EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

/**
 * Web Mercator metres → WGS 84 longitude / latitude (degrees).
 * @param xy - Mercator coordinates.
 */
export function fromMercator([x, y]: Point): [number, number] {
  return [deg(x / EARTH_RADIUS_M), deg(2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2)];
}

/**
 * Mercator metres per ground metre at a latitude (1 / cos(lat)). Multiply a
 * ground distance by it to draw it in Mercator; divide a Mercator distance by
 * it to get ground metres.
 * @param lat - Latitude in degrees.
 */
export function mercatorScale(lat: number): number {
  return 1 / Math.cos(rad(lat));
}
