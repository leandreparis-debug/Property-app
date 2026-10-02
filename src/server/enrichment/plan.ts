/**
 * PURE planning of an enrichment application: `enrichment.json` + current
 * state of the sites → what to write, what diverges, what is preserved.
 * No database access here (see state.ts and writer.ts).
 *
 * Rule: THE ENRICHMENT ONLY FILLS EMPTY FIELDS.
 * - empty field, confidence ≥ 0.8, not preserved → applied;
 * - empty field, confidence < 0.8 → not applied (« confiance insuffisante »);
 * - empty field whose last write came from the interface or a previous
 *   enrichment (someone emptied it on purpose) → PRESERVED, counted;
 * - same value → nothing;
 * - different value → DIVERGENCE: listed in divergences.csv, NEVER applied.
 *
 * Latitude and longitude go together: both must be empty, both proposed and
 * both applicable; `coordinatesSource` then becomes « enrichment ».
 */
import { APP_NAME } from "@/config/app";
import type { EnrichmentFile, EnrichmentTarget, Footprint, Proposal, ProviderResult } from "@/domain/enrichment-format";
import type { PreservationIndex } from "../import/plan";
import { sameValue } from "../import/plan";

/** Minimum confidence of an applied proposal. */
export const MIN_APPLY_CONFIDENCE = 0.8;

/** Relative gap above which an area comparison is reported. */
export const AREA_GAP_RATIO = 0.3;

/** Current state of one site (what the planner compares with). */
export interface EnrichmentSiteState {
  id: string;
  code: string;
  archived: boolean;
  site: {
    latitude: number | null;
    longitude: number | null;
    communeInseeCode: string | null;
    postalCode: string | null;
  };
  geometry: { id: string; footprintGeoJson: string | null; heightM: number | null } | null;
  icpe: { id: string; georisquesUrl: string | null } | null;
  icpeHeadingCodes: string[];
  technical: { totalWarehouseArea: number | null; landArea: number | null } | null;
  /** Existing public data, keyed « provider|key ». */
  publicData: Map<string, { id: string; valueJson: string }>;
}

/** Outcome of one proposal. */
export type ProposalOutcome = "applied" | "unchanged" | "divergence" | "preserved" | "low_confidence" | "incomplete_pair";

/** One line of the plan report (changes.csv / divergences.csv). */
export interface ProposalLine {
  code: string;
  target: EnrichmentTarget;
  current: string | null;
  proposed: string;
  provider: string;
  confidence: number;
  evidence: string;
  outcome: ProposalOutcome;
}

/** An informative check (areas, ICPE headings). */
export interface CheckLine {
  code: string;
  check: string;
  vigie: string | null;
  publicValue: string | null;
  message: string;
  provider: string;
}

/** Writes of one site. */
export interface SiteEnrichmentWrites {
  siteId: string;
  code: string;
  site: Record<string, unknown>;
  geometry: { id: string | null; data: Record<string, unknown> } | null;
  icpe: { id: string | null; data: Record<string, unknown> } | null;
  publicData: { id: string | null; provider: string; key: string; valueJson: string; fetchedAt: Date }[];
  /** Business fields applied (count for the ENRICH audit line). */
  appliedFields: string[];
}

/** Whole plan. */
export interface EnrichmentPlan {
  writes: SiteEnrichmentWrites[];
  lines: ProposalLine[];
  checks: CheckLine[];
  /** Codes of the file unknown in the database, or archived. */
  unknownCodes: string[];
  archivedCodes: string[];
  counts: Record<ProposalOutcome, number> & { publicDataWritten: number; publicDataUnchanged: number; providerErrors: number };
}

/** Model / field of a target. */
export const TARGET_FIELDS: Readonly<Record<EnrichmentTarget, { model: "Site" | "SiteGeometry" | "SiteIcpe"; field: string }>> = {
  "Site.latitude": { model: "Site", field: "latitude" },
  "Site.longitude": { model: "Site", field: "longitude" },
  "Site.communeInseeCode": { model: "Site", field: "communeInseeCode" },
  "Site.postalCode": { model: "Site", field: "postalCode" },
  "SiteGeometry.footprintGeoJson": { model: "SiteGeometry", field: "footprintGeoJson" },
  "SiteGeometry.heightM": { model: "SiteGeometry", field: "heightM" },
  "SiteIcpe.georisquesUrl": { model: "SiteIcpe", field: "georisquesUrl" },
};

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Current value of a target. */
function currentValue(state: EnrichmentSiteState, target: EnrichmentTarget): unknown {
  switch (target) {
    case "Site.latitude":
      return state.site.latitude;
    case "Site.longitude":
      return state.site.longitude;
    case "Site.communeInseeCode":
      return state.site.communeInseeCode;
    case "Site.postalCode":
      return state.site.postalCode;
    case "SiteGeometry.footprintGeoJson":
      return state.geometry?.footprintGeoJson ?? null;
    case "SiteGeometry.heightM":
      return state.geometry?.heightM ?? null;
    case "SiteIcpe.georisquesUrl":
      return state.icpe?.georisquesUrl ?? null;
  }
}

/** Record id holding a target (null when the record does not exist yet). */
function recordId(state: EnrichmentSiteState, target: EnrichmentTarget): string | null {
  const { model } = TARGET_FIELDS[target];
  return model === "Site" ? state.id : model === "SiteGeometry" ? (state.geometry?.id ?? null) : (state.icpe?.id ?? null);
}

/** Canonical text of a value (reports, comparisons). */
export function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/** Canonical JSON of a footprint (stable key order: type, coordinates). */
export function footprintJson(footprint: Footprint): string {
  return JSON.stringify({ type: footprint.type, coordinates: footprint.coordinates });
}

/** Equality of a stored value and a proposed one, per target. */
export function sameProposedValue(target: EnrichmentTarget, current: unknown, proposed: unknown): boolean {
  if (target === "SiteGeometry.footprintGeoJson") {
    if (typeof current !== "string") return false;
    try {
      const parsed = JSON.parse(current) as Footprint;
      return footprintJson(parsed) === footprintJson(proposed as Footprint);
    } catch {
      return false;
    }
  }
  if (target === "Site.latitude" || target === "Site.longitude") {
    // DECIMAL(9,6): compare at the stored precision.
    return typeof current === "number" && Math.round(current * 1e6) === Math.round((proposed as number) * 1e6);
  }
  if (target === "SiteGeometry.heightM") {
    return typeof current === "number" && Math.round(current * 100) === Math.round((proposed as number) * 100);
  }
  return sameValue(current, proposed);
}

/** Value to store for a target. */
function storedValue(target: EnrichmentTarget, value: unknown): unknown {
  if (target === "SiteGeometry.footprintGeoJson") return footprintJson(value as Footprint);
  if (target === "Site.latitude" || target === "Site.longitude") return Math.round((value as number) * 1e6) / 1e6;
  if (target === "SiteGeometry.heightM") return Math.round((value as number) * 100) / 100;
  return value;
}

/** Best proposal of each target across the providers of a site. */
function bestProposals(providers: Record<string, ProviderResult>): Map<EnrichmentTarget, { proposal: Proposal; provider: string; result: ProviderResult }> {
  const best = new Map<EnrichmentTarget, { proposal: Proposal; provider: string; result: ProviderResult }>();
  for (const [provider, result] of Object.entries(providers)) {
    if (result.status !== "ok") continue;
    for (const proposal of result.proposals) {
      const previous = best.get(proposal.target);
      if (!previous || proposal.confidence > previous.proposal.confidence) best.set(proposal.target, { proposal, provider, result });
    }
  }
  return best;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Informative checks of a site (area gaps, ICPE headings). */
export function siteChecks(state: EnrichmentSiteState, providers: Record<string, ProviderResult>): CheckLine[] {
  const checks: CheckLine[] = [];
  const compareArea = (check: string, provider: string, vigie: number | null, pub: number | null, label: string) => {
    if (vigie === null || pub === null || vigie <= 0) return;
    const gap = Math.abs(pub - vigie) / vigie;
    if (gap > AREA_GAP_RATIO) {
      checks.push({
        code: state.code,
        check,
        vigie: String(vigie),
        publicValue: String(Math.round(pub)),
        message: `${label} : écart de ${Math.round(gap * 100)} % (seuil ${AREA_GAP_RATIO * 100} %)`,
        provider,
      });
    }
  };
  const buildings = providers.buildings;
  if (buildings?.status === "ok") {
    compareArea("surface bâtie", "buildings", state.technical?.totalWarehouseArea ?? null, num(buildings.data?.areaM2), "Emprise BD TOPO / surface totale entrepôt");
  }
  const cadastre = providers.cadastre;
  if (cadastre?.status === "ok") {
    compareArea("surface parcellaire", "cadastre", state.technical?.landArea ?? null, num(cadastre.publicData.parcelsTotalAreaM2), "Parcelles cadastrales / surface du terrain");
  }
  const match = providers.georisques?.status === "ok" ? (providers.georisques.data?.match as { id?: string; headings?: { code: string }[] } | null | undefined) : null;
  if (match?.headings) {
    const publicCodes = new Set(match.headings.map((h) => h.code));
    const vigieCodes = new Set(state.icpeHeadingCodes);
    const missingInVigie = [...publicCodes].filter((c) => !vigieCodes.has(c)).sort();
    const missingInPublic = [...vigieCodes].filter((c) => !publicCodes.has(c)).sort();
    if (missingInVigie.length > 0 || missingInPublic.length > 0) {
      checks.push({
        code: state.code,
        check: "rubriques ICPE",
        vigie: [...vigieCodes].sort().join(", ") || null,
        publicValue: [...publicCodes].sort().join(", ") || null,
        message: [
          missingInVigie.length ? `absentes de ${APP_NAME} : ${missingInVigie.join(", ")}` : null,
          missingInPublic.length ? `absentes de Géorisques : ${missingInPublic.join(", ")}` : null,
        ].filter(Boolean).join(" ; ") + ` (installation ${match.id ?? "?"})`,
        provider: "georisques",
      });
    }
  }
  return checks;
}

/**
 * Plans the application of an enrichment file.
 * @param file - Validated `enrichment.json`.
 * @param states - Current state of the sites, by code (case-insensitive keys, upper case).
 * @param preservation - Last writer of every field (audit log).
 */
export function planEnrichment(file: EnrichmentFile, states: ReadonlyMap<string, EnrichmentSiteState>, preservation: PreservationIndex): EnrichmentPlan {
  const plan: EnrichmentPlan = {
    writes: [],
    lines: [],
    checks: [],
    unknownCodes: [],
    archivedCodes: [],
    counts: { applied: 0, unchanged: 0, divergence: 0, preserved: 0, low_confidence: 0, incomplete_pair: 0, publicDataWritten: 0, publicDataUnchanged: 0, providerErrors: 0 },
  };

  for (const entry of file.sites) {
    const state = states.get(entry.code.toUpperCase());
    if (!state) {
      plan.unknownCodes.push(entry.code);
      continue;
    }
    if (state.archived) {
      plan.archivedCodes.push(state.code);
      continue;
    }
    plan.counts.providerErrors += Object.values(entry.providers).filter((r) => r.status === "error").length;

    const writes: SiteEnrichmentWrites = { siteId: state.id, code: state.code, site: {}, geometry: null, icpe: null, publicData: [], appliedFields: [] };
    const best = bestProposals(entry.providers);
    const outcomes = new Map<EnrichmentTarget, ProposalOutcome>();

    for (const [target, { proposal }] of best) {
      const current = currentValue(state, target);
      const id = recordId(state, target);
      let outcome: ProposalOutcome;
      if (!isEmpty(current)) outcome = sameProposedValue(target, current, proposal.value) ? "unchanged" : "divergence";
      else if (id && preservation.isFieldPreserved(TARGET_FIELDS[target].model, id, TARGET_FIELDS[target].field)) outcome = "preserved";
      else if (proposal.confidence < MIN_APPLY_CONFIDENCE) outcome = "low_confidence";
      else outcome = "applied";
      outcomes.set(target, outcome);
    }

    // Latitude and longitude only go together.
    const lat = outcomes.get("Site.latitude");
    const lon = outcomes.get("Site.longitude");
    if ((lat === "applied") !== (lon === "applied")) {
      if (lat === "applied") outcomes.set("Site.latitude", "incomplete_pair");
      if (lon === "applied") outcomes.set("Site.longitude", "incomplete_pair");
    }

    for (const [target, { proposal, provider, result }] of best) {
      const outcome = outcomes.get(target)!;
      const current = currentValue(state, target);
      plan.counts[outcome]++;
      plan.lines.push({
        code: state.code,
        target,
        current: displayValue(current),
        proposed: displayValue(storedValue(target, proposal.value)) ?? "",
        provider,
        confidence: proposal.confidence,
        evidence: proposal.evidence,
        outcome,
      });
      if (outcome !== "applied") continue;

      const { model, field } = TARGET_FIELDS[target];
      const value = storedValue(target, proposal.value);
      writes.appliedFields.push(target);
      if (model === "Site") {
        writes.site[field] = value;
      } else if (model === "SiteGeometry") {
        writes.geometry ??= { id: state.geometry?.id ?? null, data: {} };
        writes.geometry.data[field] = value;
        if (target === "SiteGeometry.footprintGeoJson") {
          writes.geometry.data.source = "enrichment";
          const sourceRef = result.data?.sourceRef;
          if (typeof sourceRef === "string") writes.geometry.data.sourceRef = sourceRef.slice(0, 100);
          if (result.fetchedAt) writes.geometry.data.fetchedAt = new Date(result.fetchedAt);
        }
      } else {
        writes.icpe ??= { id: state.icpe?.id ?? null, data: {} };
        writes.icpe.data[field] = value;
      }
    }
    if ("latitude" in writes.site) writes.site.coordinatesSource = "enrichment";

    // Public data: replaced for the (provider, key) pairs present in the file.
    for (const [provider, result] of Object.entries(entry.providers)) {
      for (const [key, value] of Object.entries(result.publicData)) {
        const valueJson = JSON.stringify(value ?? null);
        const existing = state.publicData.get(`${provider}|${key}`);
        if (existing && existing.valueJson === valueJson) {
          plan.counts.publicDataUnchanged++;
          continue;
        }
        writes.publicData.push({ id: existing?.id ?? null, provider, key, valueJson, fetchedAt: new Date(result.fetchedAt ?? file.generatedAt) });
        plan.counts.publicDataWritten++;
      }
    }

    plan.checks.push(...siteChecks(state, entry.providers));
    if (writes.appliedFields.length > 0 || writes.publicData.length > 0) plan.writes.push(writes);
  }
  return plan;
}
