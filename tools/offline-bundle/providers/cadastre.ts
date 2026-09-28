/**
 * Cadastre provider (P2) — API Carto, module cadastre (Parcellaire Express).
 *
 * `GET /api/cadastre/parcelle?geom=<GeoJSON>` returns the parcels intersecting
 * the geometry (the building footprint when known, else the site point).
 * Properties: `idu` (parcel identifier), `code_insee`, `section`, `numero`,
 * `contenance` (m²). The total is compared on the application side with
 * `landArea` (gap above 30 % reported). Informative only: no proposal.
 */
import { ENDPOINTS } from "../config";
import { withQuery } from "../http";
import { asArray, asNumber, asRecord, asString, entry, fetchEntry, skipped, type ParsedResult, type Provider } from "./types";

/** A cadastral parcel. */
export interface Parcel {
  idu: string;
  section: string | null;
  numero: string | null;
  inseeCode: string | null;
  areaM2: number | null;
}

/** Parcels of an API Carto response (deduplicated by idu). */
export function parseParcels(json: unknown): Parcel[] {
  const byId = new Map<string, Parcel>();
  for (const f of asArray(asRecord(json)?.features)) {
    const p = asRecord(asRecord(f)?.properties);
    const idu = p ? asString(p.idu) : null;
    if (!p || !idu) continue;
    byId.set(idu, { idu, section: asString(p.section), numero: asString(p.numero), inseeCode: asString(p.code_insee), areaM2: asNumber(p.contenance) });
  }
  return [...byId.values()].sort((a, b) => a.idu.localeCompare(b.idu));
}

/** The cadastre provider. */
export const cadastreProvider: Provider = {
  name: "cadastre",
  priority: "P2",
  sources: ["ign-cadastre"],

  async fetch(ctx, http) {
    const geom = ctx.footprint ?? (ctx.position ? { type: "Point", coordinates: ctx.position } : null);
    if (!geom) return { skipped: "Ni emprise ni position", responses: [] };
    const url = withQuery(ENDPOINTS.apiCartoParcels, { geom: JSON.stringify(geom), _limit: 500 });
    return { responses: [await fetchEntry(http, "cadastre", "parcels", url)] };
  },

  parse(raw): ParsedResult {
    if (raw.skipped) return skipped(raw.skipped);
    const parcels = parseParcels(entry(raw, "parcels")?.json);
    if (parcels.length === 0) return { status: "not_found", data: { parcels: 0 }, proposals: [], publicData: {} };
    const known = parcels.filter((p) => p.areaM2 !== null);
    const totalAreaM2 = known.length === 0 ? null : known.reduce((s, p) => s + (p.areaM2 ?? 0), 0);
    return {
      status: "ok",
      data: { parcels: parcels.length, totalAreaM2 },
      proposals: [],
      publicData: { parcels, parcelsTotalAreaM2: totalAreaM2 },
    };
  },
};
