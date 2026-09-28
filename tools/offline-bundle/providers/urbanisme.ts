/**
 * Urban planning provider (P2) — API Carto, module GPU (Géoportail de
 * l'Urbanisme), `GET /api/gpu/zone-urba?geom=<GeoJSON point>`: zones of the
 * local urban plan (PLU/PLUi) at the site. Properties: `libelle` (e.g. UX),
 * `libelong`, `typezone` (U, AU, A, N), `partition`, `datappro`, `idurba`.
 * Informative only (`site_public_data`).
 */
import { ENDPOINTS } from "../config";
import { withQuery } from "../http";
import { asArray, asRecord, asString, entry, fetchEntry, skipped, type ParsedResult, type Provider } from "./types";

/** An urban planning zone. */
export interface UrbanZone {
  label: string | null;
  longLabel: string | null;
  zoneType: string | null;
  partition: string | null;
  approvedOn: string | null;
  documentId: string | null;
}

/** Zones of a GPU response. */
export function parseUrbanZones(json: unknown): UrbanZone[] {
  return asArray(asRecord(json)?.features).flatMap((f) => {
    const p = asRecord(asRecord(f)?.properties);
    if (!p) return [];
    return [{
      label: asString(p.libelle),
      longLabel: asString(p.libelong),
      zoneType: asString(p.typezone),
      partition: asString(p.partition),
      approvedOn: asString(p.datappro),
      documentId: asString(p.idurba),
    }];
  });
}

/** The urban planning provider. */
export const urbanismeProvider: Provider = {
  name: "urbanisme",
  priority: "P2",
  sources: ["gpu"],

  async fetch(ctx, http) {
    if (!ctx.position) return { skipped: "Position inconnue", responses: [] };
    const url = withQuery(ENDPOINTS.apiCartoUrbanZones, { geom: JSON.stringify({ type: "Point", coordinates: ctx.position }) });
    return { responses: [await fetchEntry(http, "urbanisme", "zones", url)] };
  },

  parse(raw): ParsedResult {
    if (raw.skipped) return skipped(raw.skipped);
    const zones = parseUrbanZones(entry(raw, "zones")?.json);
    if (zones.length === 0) return { status: "not_found", data: { zones: 0 }, proposals: [], publicData: {} };
    return { status: "ok", data: { zones: zones.length }, proposals: [], publicData: { urbanZones: zones } };
  },
};
