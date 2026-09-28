/**
 * Offline resolution of French departments and regions, and a coarse
 * metropolitan-France bounding box. Pure functions, no network.
 */
import { DEPARTMENTS, geoKey, REGION_ABBREVIATIONS, REGION_ALIASES, REGIONS, type Department, type RegionName } from "./data";

export { DEPARTMENTS, REGIONS, geoKey, type Department, type RegionName } from "./data";

const BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));
const BY_NAME = new Map(DEPARTMENTS.map((d) => [geoKey(d.name), d]));
const REGION_BY_KEY = new Map<string, RegionName>(REGIONS.map((r) => [geoKey(r), r]));

/** Normalises a department code: "1" → "01", "2a" → "2A"; `null` if not a code. */
function normalizeCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (/^\d{1,2}$/.test(value)) return value.padStart(2, "0");
  if (/^2[AB]$/.test(value)) return value;
  return null;
}

/**
 * Resolves a department from a code ("1", "01", "2a"), a name with or without
 * accents and hyphens ("Val-d'Oise", "val d oise", "VAL D'OISE"), or a
 * combination ("95 - Val-d'Oise", "Rhône (69)").
 *
 * @param input - Free text (number accepted).
 * @returns The department, or `null` if nothing matches (e.g. "20", ambiguous
 *   between 2A and 2B, or an overseas code).
 */
export function resolveDepartment(input: string | number | null | undefined): Department | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim();
  if (text === "") return null;

  const direct = normalizeCode(text);
  if (direct) return BY_CODE.get(direct) ?? null;

  const byName = BY_NAME.get(geoKey(text));
  if (byName) return byName;

  // "95 - Val-d'Oise", "95 Val d'Oise", "Val-d'Oise (95)"
  const leading = /^(\d{1,2}|2[ABab])\b[\s\-–:.)]*(.*)$/.exec(text);
  const trailing = /^(.*?)[\s(–-]+(\d{1,2}|2[ABab])\)?\s*$/.exec(text);
  for (const match of [leading, trailing]) {
    if (!match) continue;
    const code = normalizeCode(leading === match ? match[1]! : match[2]!);
    const department = code ? BY_CODE.get(code) : undefined;
    if (!department) continue;
    const rest = geoKey(leading === match ? match[2]! : match[1]!);
    // The name part, when present, must agree with the code.
    if (rest === "" || rest === geoKey(department.name)) return department;
  }
  return null;
}

/** Result of {@link resolveRegion}. */
export interface ResolvedRegion {
  name: RegionName;
  /** Set when the input was a former region name (pre-2016). */
  warning?: string;
}

/**
 * Resolves a metropolitan region from its name (accents, hyphens and case
 * ignored), an abbreviation (IDF, PACA, AURA…) or a former region name
 * ("Rhône-Alpes" → "Auvergne-Rhône-Alpes", with a warning).
 *
 * @param input - Free text.
 * @returns The region, or `null` if unknown.
 */
export function resolveRegion(input: string | null | undefined): ResolvedRegion | null {
  if (!input) return null;
  const key = geoKey(input);
  if (key === "") return null;
  const exact = REGION_BY_KEY.get(key);
  if (exact) return { name: exact };
  const alias = REGION_ALIASES[key];
  if (!alias) return null;
  if (REGION_ABBREVIATIONS.has(key)) return { name: alias };
  return { name: alias, warning: `Ancien nom de région « ${input.trim()} » remplacé par « ${alias} ».` };
}

/**
 * Department of a French postal code (first two digits; 20xxx → 2A below
 * 20200, 2B otherwise).
 * @param postalCode - 5-digit postal code.
 * @returns The department, or `null` (overseas or malformed code).
 */
export function departmentFromPostalCode(postalCode: string | null | undefined): Department | null {
  if (!postalCode || !/^\d{5}$/.test(postalCode)) return null;
  if (postalCode.startsWith("20")) return BY_CODE.get(Number(postalCode) < 20200 ? "2A" : "2B") ?? null;
  return BY_CODE.get(postalCode.slice(0, 2)) ?? null;
}

/** Coarse bounding box of metropolitan France, Corsica included (with margin). */
export const METROPOLITAN_BOUNDS = { minLat: 41.2, maxLat: 51.2, minLon: -5.3, maxLon: 9.7 } as const;

/**
 * Whether a point lies in the (generous) bounding box of metropolitan France.
 * @param lat - Latitude (WGS 84).
 * @param lon - Longitude (WGS 84).
 */
export function isInMetropolitanFrance(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const b = METROPOLITAN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}
