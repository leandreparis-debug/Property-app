/**
 * Companies provider (P2) — API Recherche d'entreprises, `GET /near_point`
 * (establishments around a point, radius in km).
 *
 * The export deliberately carries NO operator or lease entity name (minimal
 * data rule), so candidates are found by PROXIMITY: establishments within
 * 250 m of the site, with their SIREN, name and activity (NAF). They are only
 * LISTED in `site_public_data` (`companyCandidates`); the application compares
 * them locally with `logisticsOperator` and the lease entity. No proposal.
 */
import { ENDPOINTS } from "../config";
import { haversineMeters, nameSimilarity } from "../geo";
import { withQuery } from "../http";
import { asArray, asNumber, asRecord, asString, entry, fetchEntry, skipped, type ParsedResult, type Provider, type SiteContext } from "./types";

/** Search radius (km) of the near_point query. */
export const COMPANIES_RADIUS_KM = 0.25;

/** A company candidate. */
export interface CompanyCandidate {
  siren: string;
  siret: string | null;
  name: string | null;
  activity: string | null;
  distanceM: number | null;
}

/** Candidates of a near_point response (one per SIREN, nearest establishment). */
export function parseCompanies(json: unknown, ctx: Pick<SiteContext, "position">): CompanyCandidate[] {
  const bySiren = new Map<string, CompanyCandidate>();
  for (const r of asArray(asRecord(json)?.results)) {
    const company = asRecord(r);
    const siren = company ? asString(company.siren) : null;
    if (!company || !siren) continue;
    for (const e of asArray(company.matching_etablissements).concat(asArray(company.matching_etablissements).length === 0 ? [company.siege] : [])) {
      const est = asRecord(e);
      const lat = est ? asNumber(est.latitude) : null;
      const lon = est ? asNumber(est.longitude) : null;
      const distanceM = ctx.position && lat !== null && lon !== null ? Math.round(haversineMeters(ctx.position, [lon, lat])) : null;
      const candidate: CompanyCandidate = {
        siren,
        siret: est ? asString(est.siret) : null,
        name: asString(company.nom_complet) ?? asString(company.nom_raison_sociale),
        activity: (est ? asString(est.activite_principale) : null) ?? asString(company.activite_principale),
        distanceM,
      };
      const previous = bySiren.get(siren);
      if (!previous || (candidate.distanceM ?? Infinity) < (previous.distanceM ?? Infinity)) bySiren.set(siren, candidate);
    }
  }
  return [...bySiren.values()].sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
}

/**
 * Candidates whose name is close to a given name (used by the application
 * against `logisticsOperator`).
 */
export function candidatesNamed(candidates: readonly CompanyCandidate[], name: string, minSimilarity = 0.6): CompanyCandidate[] {
  return candidates.filter((c) => c.name !== null && nameSimilarity(c.name, name) >= minSimilarity);
}

/** The companies provider. */
export const companiesProvider: Provider = {
  name: "companies",
  priority: "P2",
  sources: ["recherche-entreprises"],

  async fetch(ctx, http) {
    if (!ctx.position) return { skipped: "Position inconnue", responses: [] };
    const url = withQuery(ENDPOINTS.companiesNearPoint, { lat: ctx.position[1].toFixed(6), long: ctx.position[0].toFixed(6), radius: COMPANIES_RADIUS_KM, per_page: 25 });
    return { responses: [await fetchEntry(http, "companies", "nearPoint", url)] };
  },

  parse(raw, ctx): ParsedResult {
    if (raw.skipped) return skipped(raw.skipped);
    const candidates = parseCompanies(entry(raw, "nearPoint")?.json, ctx);
    if (candidates.length === 0) return { status: "not_found", data: { candidates: 0 }, proposals: [], publicData: {} };
    return { status: "ok", data: { candidates: candidates.length }, proposals: [], publicData: { companyCandidates: candidates.slice(0, 25) } };
  },
};
