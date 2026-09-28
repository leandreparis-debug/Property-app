/**
 * Vector basemap: extract of metropolitan France from the LATEST Protomaps
 * daily build (OpenStreetMap data), with `pmtiles extract` (HTTP range
 * requests: only the needed tiles are downloaded).
 */
import { stat } from "node:fs/promises";
import { ENDPOINTS, FRANCE_BBOX } from "../config";
import type { HttpClient } from "../http";
import { extractArgs, runPmtiles } from "./pmtiles-cli";

/**
 * Latest build key (« AAAAMMJJ.pmtiles ») of the Protomaps builds index. The
 * index format is not formally documented: every « AAAAMMJJ.pmtiles » string
 * found in the JSON is considered, the most recent wins.
 * @param json - Parsed `builds.json`.
 */
export function latestBuildKey(json: unknown): string | null {
  const keys = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      const m = /(\d{8})\.pmtiles$/.exec(v);
      if (m) keys.add(`${m[1]}.pmtiles`);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(json);
  return [...keys].sort().at(-1) ?? null;
}

/**
 * Resolves the URL of the latest daily build.
 * @param http - Shared client (the index itself is not cached: always fresh).
 */
export async function resolveLatestBuildUrl(http: HttpClient): Promise<string> {
  const { json } = await http.getJson("assets", `${ENDPOINTS.protomapsBuildsIndex}?t=${new Date().toISOString().slice(0, 10)}`);
  const key = latestBuildKey(json);
  if (!key) throw new Error(`Aucun build Protomaps trouvé dans ${ENDPOINTS.protomapsBuildsIndex}.`);
  return `${ENDPOINTS.protomapsBuilds}/${key}`;
}

/**
 * Extracts France into `output`.
 * @returns The source URL and the measured size in bytes.
 */
export async function buildBasemap(options: { http: HttpClient; output: string; maxzoom: number; sourceUrl?: string }): Promise<{ sourceUrl: string; bytes: number }> {
  const sourceUrl = options.sourceUrl ?? (await resolveLatestBuildUrl(options.http));
  await runPmtiles(extractArgs(sourceUrl, options.output, FRANCE_BBOX, options.maxzoom));
  return { sourceUrl, bytes: (await stat(options.output)).size };
}
