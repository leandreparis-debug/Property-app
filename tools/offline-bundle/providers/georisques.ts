/**
 * Géorisques provider — API v1 (no token).
 *
 * - `installations_classees?latlon=<lon>,<lat>&rayon=1000`: classified
 *   installations (ICPE) within 1 km. An installation MATCHES the site when its
 *   name is close to the site name (similarity ≥ 0.6) or when it lies less than
 *   200 m from the site (footprint when known, else point). The matched
 *   installation gives a `SiteIcpe.georisquesUrl` proposal and its headings
 *   (rubriques), compared on the application side with `IcpeHeading`.
 * - With the commune INSEE code: `gaspar/risques` (natural and technological
 *   risks of the commune), `zonage_sismique`, `radon` → `site_public_data`.
 *
 * Field names differ between API versions (camelCase / snake_case): both are
 * accepted. Formats to confirm with `pnpm bundle:probe`.
 */
import { ENDPOINTS, ICPE_RULES } from "../config";
import { distanceToFootprintM, haversineMeters, nameSimilarity, type LonLat } from "../geo";
import { withQuery } from "../http";
import { asArray, asNumber, asRecord, asString, entry, fetchEntry, pick, skipped, type ParsedResult, type Provider, type RawEntry, type SiteContext } from "./types";

/** An ICPE heading of an installation. */
export interface InstallationHeading {
  code: string;
  regime: string | null;
  label: string | null;
}

/** A classified installation near the site. */
export interface Installation {
  id: string;
  name: string | null;
  lonLat: LonLat | null;
  regime: string | null;
  seveso: string | null;
  headings: InstallationHeading[];
  distanceM: number | null;
}

/** Installations of a Géorisques response. */
export function parseInstallations(json: unknown): Omit<Installation, "distanceM">[] {
  const out: Omit<Installation, "distanceM">[] = [];
  for (const item of asArray(asRecord(json)?.data)) {
    const r = asRecord(item);
    if (!r) continue;
    const id = asString(pick(r, "codeAIOT", "code_aiot", "numeroInspection", "num_dossier", "id"));
    if (!id) continue;
    const lon = asNumber(pick(r, "longitude", "x"));
    const lat = asNumber(pick(r, "latitude", "y"));
    const headings: InstallationHeading[] = [];
    for (const h of asArray(pick(r, "rubriques", "rubriques_icpe"))) {
      const rh = asRecord(h);
      const code = rh ? asString(pick(rh, "numeroRubrique", "numero_rubrique", "rubrique", "code")) : null;
      if (!rh || !code) continue;
      headings.push({
        code,
        regime: asString(pick(rh, "regimeAutoriseAlinea", "regime_autorise_alinea", "regime")),
        label: asString(pick(rh, "nature", "libelle")),
      });
    }
    out.push({
      id,
      name: asString(pick(r, "raisonSociale", "raison_sociale", "nom")),
      lonLat: lon !== null && lat !== null ? [lon, lat] : null,
      regime: asString(pick(r, "regime", "regime_vigueur")),
      seveso: asString(pick(r, "statutSeveso", "statut_seveso")),
      headings,
    });
  }
  return out;
}

/** Result of the ICPE matching. */
export interface IcpeMatch {
  installation: Installation;
  byName: boolean;
  byDistance: boolean;
  similarity: number;
  confidence: number;
}

/**
 * Matches the installations to the site.
 * @param installations - Parsed installations.
 * @param ctx - Site name, position and footprint.
 * @returns Installations with distance, and the best match (or null).
 */
export function matchInstallation(
  installations: readonly Omit<Installation, "distanceM">[],
  ctx: Pick<SiteContext, "site" | "position" | "footprint">,
): { nearby: Installation[]; match: IcpeMatch | null } {
  const nearby: Installation[] = installations.map((i) => ({
    ...i,
    distanceM:
      i.lonLat === null
        ? null
        : Math.round(ctx.footprint ? distanceToFootprintM(i.lonLat, ctx.footprint) : ctx.position ? haversineMeters(ctx.position, i.lonLat) : Infinity),
  }));
  nearby.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));

  let best: IcpeMatch | null = null;
  for (const installation of nearby) {
    const similarity = installation.name ? nameSimilarity(ctx.site.name, installation.name) : 0;
    const byName = similarity >= ICPE_RULES.minNameSimilarity;
    const byDistance = installation.distanceM !== null && installation.distanceM < ICPE_RULES.matchDistanceM;
    if (!byName && !byDistance) continue;
    const confidence = byName && byDistance ? 0.9 : byDistance ? 0.8 : 0.7;
    if (!best || confidence > best.confidence) best = { installation, byName, byDistance, similarity, confidence };
  }
  return { nearby, match: best };
}

/** Géorisques page of an installation. */
export function installationUrl(id: string): string {
  return `${ENDPOINTS.georisquesInstallationPage}${encodeURIComponent(id)}`;
}

/** Labels of the commune risks (GASPAR). */
export function parseCommuneRisks(json: unknown): string[] {
  const labels = new Set<string>();
  for (const commune of asArray(asRecord(json)?.data)) {
    for (const risk of asArray(pick(asRecord(commune) ?? {}, "risques_detail", "risquesDetail"))) {
      const label = asString(pick(asRecord(risk) ?? {}, "libelle_risque_long", "libelleRisqueLong", "libelle"));
      if (label) labels.add(label);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Seismic zone of the commune (1 very low … 5 strong). */
export function parseSeismicZone(json: unknown): { code: string; label: string | null } | null {
  const first = asRecord(asArray(asRecord(json)?.data)[0]);
  const code = first ? asString(pick(first, "code_zone", "codeZone")) : null;
  return first && code ? { code, label: asString(pick(first, "zone_sismicite", "zoneSismicite")) } : null;
}

/** Radon potential class of the commune (1 low … 3 significant). */
export function parseRadon(json: unknown): string | null {
  const first = asRecord(asArray(asRecord(json)?.data)[0]);
  return first ? asString(pick(first, "classe_potentiel", "classePotentiel")) : null;
}

/** The Géorisques provider. */
export const georisquesProvider: Provider = {
  name: "georisques",
  priority: "P1",
  sources: ["georisques"],

  async fetch(ctx, http) {
    if (!ctx.position && !ctx.inseeCode) return { skipped: "Ni position ni code INSEE", responses: [] };
    const responses: RawEntry[] = [];
    if (ctx.position) {
      const url = withQuery(ENDPOINTS.georisquesInstallations, {
        latlon: `${ctx.position[0].toFixed(6)},${ctx.position[1].toFixed(6)}`,
        rayon: ICPE_RULES.radiusM,
        page: 1,
        page_size: 100,
      });
      responses.push(await fetchEntry(http, "georisques", "installations", url));
    }
    if (ctx.inseeCode) {
      const q = { code_insee: ctx.inseeCode };
      responses.push(await fetchEntry(http, "georisques", "risks", withQuery(ENDPOINTS.georisquesCommuneRisks, q)));
      responses.push(await fetchEntry(http, "georisques", "seismic", withQuery(ENDPOINTS.georisquesSeismicZone, q)));
      responses.push(await fetchEntry(http, "georisques", "radon", withQuery(ENDPOINTS.georisquesRadon, q)));
    }
    return { responses };
  },

  parse(raw, ctx): ParsedResult {
    if (raw.skipped) return skipped(raw.skipped);
    const publicData: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};
    const proposals: ParsedResult["proposals"] = [];

    const installations = entry(raw, "installations");
    if (installations) {
      const { nearby, match } = matchInstallation(parseInstallations(installations.json), ctx);
      data.nearbyCount = nearby.length;
      publicData.icpeNearby = nearby.slice(0, 20).map((i) => ({ id: i.id, name: i.name, distanceM: i.distanceM, regime: i.regime, seveso: i.seveso }));
      if (match) {
        const i = match.installation;
        const reasons = [match.byDistance ? `à ${i.distanceM} m` : null, match.byName ? `nom proche (${match.similarity.toFixed(2)})` : null].filter(Boolean).join(", ");
        data.match = { id: i.id, name: i.name, distanceM: i.distanceM, regime: i.regime, seveso: i.seveso, headings: i.headings, byName: match.byName, byDistance: match.byDistance };
        proposals.push({ target: "SiteIcpe.georisquesUrl", value: installationUrl(i.id), confidence: match.confidence, evidence: `Installation classée ${i.id} « ${i.name ?? "?"} » — ${reasons}` });
      } else {
        data.match = null;
      }
    }
    const risks = entry(raw, "risks");
    if (risks?.json) publicData.communeRisks = parseCommuneRisks(risks.json);
    const seismic = entry(raw, "seismic");
    if (seismic?.json) publicData.seismicZone = parseSeismicZone(seismic.json);
    const radon = entry(raw, "radon");
    if (radon?.json) publicData.radonClass = parseRadon(radon.json);
    if (ctx.inseeCode) data.inseeCode = ctx.inseeCode;

    const empty = proposals.length === 0 && Object.values(publicData).every((v) => v === null || (Array.isArray(v) && v.length === 0));
    return { status: empty ? "not_found" : "ok", data, proposals, publicData };
  },
};
