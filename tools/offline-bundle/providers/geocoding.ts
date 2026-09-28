/**
 * Geocoding provider — Géoplateforme geocoding service (Base Adresse
 * Nationale; same response format as the former api-adresse.data.gouv.fr).
 *
 * Response (GeoJSON FeatureCollection): `features[].geometry.coordinates`
 * = [lon, lat]; `properties.score` (0–1), `type` (housenumber | street |
 * locality | municipality), `citycode` (INSEE), `postcode`, `label`, `city`.
 *
 * Rules:
 * - coordinates are proposed when score ≥ 0.8 AND type is housenumber or
 *   street — only if the site has no coordinates, or if the existing ones are
 *   more than 500 m away (then the apply step reports a DIVERGENCE);
 * - the INSEE code is proposed when score ≥ 0.8 (any type), the postal code
 *   when the type is at least a locality;
 * - a site without address but with coordinates is reverse-geocoded (INSEE code).
 */
import { ENDPOINTS, GEOCODING_RULES } from "../config";
import { haversineMeters, type LonLat } from "../geo";
import { withQuery } from "../http";
import type { Proposal } from "../../../src/domain/enrichment-format";
import { asArray, asNumber, asRecord, asString, entry, fetchEntry, round, skipped, type ParsedResult, type Provider } from "./types";

/** A geocoding candidate. */
export interface GeocodeCandidate {
  label: string | null;
  score: number;
  type: string | null;
  lonLat: LonLat;
  citycode: string | null;
  postcode: string | null;
  city: string | null;
}

/** Free-text query of a site (address, postal code, city). */
export function geocodeQuery(site: { addressLine: string | null; postalCode: string | null; city: string | null }): string | null {
  const parts = [site.addressLine, site.postalCode, site.city].map((p) => p?.trim()).filter((p): p is string => !!p);
  // The address line often already ends with « 69800 Saint-Priest »: drop repeated tokens.
  const text = parts.join(" ");
  const seen = new Set<string>();
  const tokens = text.split(/\s+/).filter((t) => {
    const k = t.toLowerCase();
    if (/^\d{5}$/.test(k) || k.length > 3) {
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  });
  const q = tokens.join(" ").trim();
  return q.length >= 3 ? q.slice(0, 200) : null;
}

/** Candidates of a geocoding response, best score first. */
export function parseCandidates(json: unknown): GeocodeCandidate[] {
  const out: GeocodeCandidate[] = [];
  for (const f of asArray(asRecord(json)?.features)) {
    const feature = asRecord(f);
    const props = asRecord(feature?.properties) ?? {};
    const coords = asArray(asRecord(feature?.geometry)?.coordinates);
    const lon = asNumber(coords[0]);
    const lat = asNumber(coords[1]);
    const score = asNumber(props.score);
    if (lon === null || lat === null || score === null) continue;
    out.push({
      label: asString(props.label),
      score,
      type: asString(props.type),
      lonLat: [lon, lat],
      citycode: asString(props.citycode),
      postcode: asString(props.postcode),
      city: asString(props.city),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const INSEE = /^(\d{5}|2[AB]\d{3})$/;

/**
 * Proposals of the best candidate.
 * @param best - Best candidate.
 * @param current - Current site coordinates, if any.
 * @param evidencePrefix - « géocodage » or « géocodage inverse ».
 */
export function geocodeProposals(best: GeocodeCandidate, current: LonLat | null, evidencePrefix = "Géocodage"): { proposals: Proposal[]; distanceM: number | null } {
  const proposals: Proposal[] = [];
  const confidence = round(best.score, 3);
  const evidence = `${evidencePrefix} : « ${best.label ?? "?"} » (type ${best.type ?? "?"}, score ${best.score.toFixed(2)})`;
  const distanceM = current ? Math.round(haversineMeters(current, best.lonLat)) : null;
  if (best.score < GEOCODING_RULES.minScore) return { proposals, distanceM };

  const precise = best.type !== null && GEOCODING_RULES.acceptedTypes.includes(best.type);
  if (precise && (distanceM === null || distanceM > GEOCODING_RULES.divergenceMeters)) {
    const suffix = distanceM === null ? "" : ` — à ${distanceM} m des coordonnées actuelles`;
    proposals.push(
      { target: "Site.latitude", value: round(best.lonLat[1], 6), confidence, evidence: evidence + suffix },
      { target: "Site.longitude", value: round(best.lonLat[0], 6), confidence, evidence: evidence + suffix },
    );
  }
  if (best.citycode && INSEE.test(best.citycode)) {
    proposals.push({ target: "Site.communeInseeCode", value: best.citycode, confidence, evidence });
  }
  if ((precise || best.type === "locality") && best.postcode && /^\d{5}$/.test(best.postcode)) {
    proposals.push({ target: "Site.postalCode", value: best.postcode, confidence, evidence });
  }
  return { proposals, distanceM };
}

const currentPosition = (site: { latitude: number | null; longitude: number | null }): LonLat | null =>
  site.latitude !== null && site.longitude !== null ? [site.longitude, site.latitude] : null;

/** The geocoding provider. */
export const geocodingProvider: Provider = {
  name: "geocoding",
  priority: "P1",
  sources: ["ign-geocoding"],

  async fetch(ctx, http) {
    const q = geocodeQuery(ctx.site);
    if (q) {
      const url = withQuery(ENDPOINTS.geocodeSearch, { q, index: "address", limit: 5 });
      return { responses: [await fetchEntry(http, "geocoding", "search", url)] };
    }
    const position = currentPosition(ctx.site);
    if (position) {
      const url = withQuery(ENDPOINTS.geocodeReverse, { lon: position[0], lat: position[1], index: "address", limit: 1 });
      return { responses: [await fetchEntry(http, "geocoding", "reverse", url)] };
    }
    return { skipped: "Ni adresse ni coordonnées", responses: [] };
  },

  parse(raw, ctx): ParsedResult {
    if (raw.skipped) return skipped(raw.skipped);
    const search = entry(raw, "search");
    const reverse = entry(raw, "reverse");
    const response = search ?? reverse;
    const candidates = parseCandidates(response?.json);
    const best = candidates[0];
    if (!best) return { status: "not_found", data: { query: response?.url ?? null, candidates: 0 }, proposals: [], publicData: {} };

    const current = currentPosition(ctx.site);
    // Reverse geocoding starts from the site's own coordinates: only the commune is useful.
    const { proposals, distanceM } = reverse
      ? { proposals: geocodeProposals({ ...best, type: null }, current, "Géocodage inverse").proposals, distanceM: null }
      : geocodeProposals(best, current);
    const divergent = distanceM !== null && distanceM > GEOCODING_RULES.divergenceMeters;
    return {
      status: "ok",
      data: {
        mode: reverse ? "reverse" : "search",
        candidates: candidates.length,
        best: { label: best.label, score: best.score, type: best.type, lon: best.lonLat[0], lat: best.lonLat[1], citycode: best.citycode, postcode: best.postcode, city: best.city },
        accepted: best.score >= GEOCODING_RULES.minScore,
        distanceFromCurrentM: distanceM,
        divergent,
      },
      proposals,
      publicData: {},
    };
  },

  contribute(parsed, ctx) {
    const best = asRecord(parsed.data?.best);
    const accepted = parsed.data?.accepted === true;
    const lat = parsed.proposals.find((p) => p.target === "Site.latitude");
    const lon = parsed.proposals.find((p) => p.target === "Site.longitude");
    const insee = parsed.proposals.find((p) => p.target === "Site.communeInseeCode");
    return {
      // The database stays the source of truth: existing coordinates win.
      position: ctx.position ?? (lat && lon ? [lon.value as number, lat.value as number] : null),
      inseeCode: accepted && insee ? (insee.value as string) : (ctx.inseeCode ?? (accepted ? asString(best?.citycode) : null)),
    };
  },
};
