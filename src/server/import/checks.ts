/**
 * Consistency checks of the import. Pure functions; every finding is a
 * warning (never blocking), except duplicated codes (error: later rows are
 * rejected). Some checks CORRECT the draft (swapped coordinates).
 */
import { arbitrationDate, perSqm, referenceArea, toNumber } from "@/domain/derived";
import { resolveDepartment, resolveRegion, isInMetropolitanFrance } from "@/domain/geo";
import { describeValue } from "./normalize";
import type { ImportIssue, SiteDraft } from "./types";

const issue = (draft: SiteDraft, column: string | null, kind: string, message: string, extra: Partial<ImportIssue> = {}): ImportIssue => ({
  row: draft.row,
  code: draft.code,
  column,
  severity: "warning",
  kind,
  original: null,
  retained: null,
  message,
  ...extra,
});

const siteValue = (draft: SiteDraft, field: string): unknown => draft.entities.site.get(field);
const technical = (draft: SiteDraft) => ({
  surveyedTotalArea: toNumber(draft.entities.technical.get("surveyedTotalArea") as number | null | undefined),
  totalWarehouseArea: toNumber(draft.entities.technical.get("totalWarehouseArea") as number | null | undefined),
  leaseWarehouseArea: toNumber(draft.entities.technical.get("leaseWarehouseArea") as number | null | undefined),
});

/**
 * Coordinates outside metropolitan France: swapped latitude/longitude are
 * detected and corrected; otherwise the coordinates are set to null. Sets
 * `coordinatesSource = "import"` when coordinates are kept.
 * Mutates the draft.
 */
export function checkCoordinates(draft: SiteDraft): ImportIssue[] {
  const site = draft.entities.site;
  if (!site.has("latitude") && !site.has("longitude")) return [];
  const lat = site.get("latitude") as number | null | undefined;
  const lon = site.get("longitude") as number | null | undefined;
  const issues: ImportIssue[] = [];
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    if ((lat ?? null) !== null || (lon ?? null) !== null) {
      issues.push(issue(draft, "LAT", "incomplete_coordinates", "Coordonnées incomplètes (latitude ou longitude manquante) : ignorées."));
    }
    site.set("latitude", null);
    site.set("longitude", null);
    site.set("coordinatesSource", null);
    return issues;
  }
  if (isInMetropolitanFrance(lat, lon)) {
    site.set("coordinatesSource", "import");
    return issues;
  }
  if (isInMetropolitanFrance(lon, lat)) {
    site.set("latitude", lon);
    site.set("longitude", lat);
    site.set("coordinatesSource", "import");
    issues.push(issue(draft, "LAT", "swapped_coordinates", "Latitude et longitude inversées : corrigées.", {
      original: `${lat}, ${lon}`,
      retained: `${lon}, ${lat}`,
    }));
    return issues;
  }
  site.set("latitude", null);
  site.set("longitude", null);
  site.set("coordinatesSource", null);
  issues.push(issue(draft, "LAT", "coordinates_outside_france", "Coordonnées hors de la France métropolitaine : ignorées.", { original: `${lat}, ${lon}` }));
  return issues;
}

/** Department inconsistent with the region. */
export function checkDepartmentRegion(draft: SiteDraft): ImportIssue[] {
  const code = siteValue(draft, "departmentCode") as string | null | undefined;
  const regionName = siteValue(draft, "region") as string | null | undefined;
  if (!code || !regionName) return [];
  const department = resolveDepartment(code);
  const region = resolveRegion(regionName);
  if (!department || !region || department.region === region.name) return [];
  return [
    issue(draft, "REGION", "department_region_mismatch", `Le département ${department.code} (${department.name}) appartient à « ${department.region} », pas à « ${region.name} ».`),
  ];
}

const CLOSED = /(ferm|cess|vend|inacti|vacant|libere|restitu|desaffect)/;
const OPEN = /(exploit|en activit|actif|ouvert|occup)/;

/** STATUT inconsistent with EN ACTIVITE (e.g. « fermé » and « Oui »). */
export function checkStatusActivity(draft: SiteDraft): ImportIssue[] {
  const status = siteValue(draft, "status");
  const active = siteValue(draft, "isActive");
  if (typeof status !== "string" || typeof active !== "boolean") return [];
  const key = status.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const closed = CLOSED.test(key);
  const open = !closed && OPEN.test(key);
  if ((closed && active) || (open && !active)) {
    return [issue(draft, "STATUT", "status_activity_mismatch", `STATUT « ${status} » incohérent avec EN ACTIVITE « ${active ? "Oui" : "Non"} ».`)];
  }
  return [];
}

/** Arbitration date of the sheet different from the computed one. */
export function checkArbitrationDate(draft: SiteDraft): ImportIssue[] {
  const sheet = draft.sheet.arbitrationDate;
  if (!sheet) return [];
  const lease = draft.entities.lease;
  const computed = arbitrationDate({
    noticeDate: lease.get("noticeDate") as Date | null | undefined,
    nextExitDate: lease.get("nextExitDate") as Date | null | undefined,
    noticePeriodMonths: lease.get("noticePeriodMonths") as number | null | undefined,
  });
  if (computed && computed.getTime() === sheet.getTime()) return [];
  return [
    issue(
      draft,
      "DATE D'ARBITRAGE POUR ECHEANCE CONTRACTUELLE (6 MOIS AVANT)",
      "arbitration_date_mismatch",
      computed
        ? `Date d'arbitrage du tableur (${describeValue(sheet)}) différente de la date calculée (${describeValue(computed)}).`
        : `Date d'arbitrage du tableur (${describeValue(sheet)}) non recalculable : date de préavis ou préavis/prochaine sortie manquants.`,
      { original: describeValue(sheet), retained: describeValue(computed) },
    ),
  ];
}

/** Areas a per-m² value of the sheet may have been computed with. */
export type AreaBasis = "reference" | "total" | "lease";

/** Human labels of {@link AreaBasis}. */
export const AREA_BASIS_LABELS: Readonly<Record<AreaBasis, string>> = {
  reference: "surface de référence (géomètre, sinon totale)",
  total: "SURFACE ENTREPOT TOTAL",
  lease: "ENTREPOTS (TOTAL BAIL)",
};

/** Result of {@link checkPerSqm}. */
export interface PerSqmCheck {
  issues: ImportIssue[];
  /** For each compared value, the bases that match within 1 %. */
  matches: AreaBasis[][];
}

/**
 * Recomputes each per-m² value of the sheet with `perSqm` on the reference
 * area, the total area and the lease area. A value off by more than 1 % on
 * every basis is reported.
 */
export function checkPerSqm(draft: SiteDraft, tolerance = 0.01): PerSqmCheck {
  const t = technical(draft);
  const bases: Record<AreaBasis, number | null> = {
    reference: referenceArea(t),
    total: t.totalWarehouseArea && t.totalWarehouseArea > 0 ? t.totalWarehouseArea : null,
    lease: t.leaseWarehouseArea && t.leaseWarehouseArea > 0 ? t.leaseWarehouseArea : null,
  };
  const issues: ImportIssue[] = [];
  const matches: AreaBasis[][] = [];
  for (const entry of draft.sheet.perSqm) {
    const metric = draft.metrics.get(`${entry.metric}|${entry.year}`);
    if (!metric || metric.value === null) continue;
    const matching: AreaBasis[] = [];
    let comparable = false;
    for (const basis of Object.keys(bases) as AreaBasis[]) {
      const computed = perSqm(metric.value, bases[basis]);
      if (computed === null) continue;
      comparable = true;
      const reference = Math.max(Math.abs(computed), Math.abs(entry.value), 1e-9);
      if (Math.abs(computed - entry.value) / reference <= tolerance) matching.push(basis);
    }
    if (!comparable) continue;
    matches.push(matching);
    if (matching.length === 0) {
      const computed = perSqm(metric.value, bases.reference);
      issues.push(
        issue(draft, entry.column, "per_sqm_mismatch", `Valeur au m² du tableur (${entry.value}) incohérente avec ${metric.column} ÷ surface (${computed?.toFixed(2) ?? "?"} sur la surface de référence) : écart supérieur à 1 % sur toutes les surfaces.`, {
          original: String(entry.value),
          retained: computed?.toFixed(2) ?? null,
        }),
      );
    }
  }
  return { issues, matches };
}

/** Water per m² above which the values look like litres rather than m³. */
export const WATER_MAX_M3_PER_SQM = 5;
/** Water per m² below which the values look suspicious (e.g. thousands of m³). */
export const WATER_MIN_M3_PER_SQM = 0.0005;

/** Result of {@link checkWater}. */
export interface WaterCheck {
  issues: ImportIssue[];
  /** m³/m² values computed for the site. */
  ratios: number[];
}

/** Water per m² with an order of magnitude inconsistent with m³. */
export function checkWater(draft: SiteDraft): WaterCheck {
  const area = referenceArea(technical(draft));
  const issues: ImportIssue[] = [];
  const ratios: number[] = [];
  if (!area) return { issues, ratios };
  for (const metric of draft.metrics.values()) {
    if (metric.metric !== "WATER" || metric.value === null) continue;
    const ratio = metric.value / area;
    ratios.push(ratio);
    if (ratio > WATER_MAX_M3_PER_SQM || ratio < WATER_MIN_M3_PER_SQM) {
      issues.push(
        issue(draft, metric.column, "water_magnitude", `Consommation d'eau de ${ratio.toFixed(4)} m³/m² : ordre de grandeur incohérent avec des m³ (unité à vérifier).`, {
          original: String(metric.value),
        }),
      );
    }
  }
  return { issues, ratios };
}

/**
 * Same warehouse code on several rows: error, only the first row is kept.
 * @returns The kept drafts and one error per rejected row.
 */
export function rejectDuplicateCodes(drafts: readonly SiteDraft[]): { kept: SiteDraft[]; issues: ImportIssue[]; rejected: SiteDraft[] } {
  const firstRow = new Map<string, number>();
  const kept: SiteDraft[] = [];
  const rejected: SiteDraft[] = [];
  const issues: ImportIssue[] = [];
  for (const draft of drafts) {
    const key = draft.code.toUpperCase();
    const first = firstRow.get(key);
    if (first !== undefined) {
      rejected.push(draft);
      issues.push({ ...issue(draft, "ENTREPOT", "duplicate_code", `Code entrepôt « ${draft.code} » déjà présent ligne ${first} : ligne rejetée (seule la première est importée).`), severity: "error" });
      continue;
    }
    firstRow.set(key, draft.row);
    kept.push(draft);
  }
  return { kept, issues, rejected };
}

/** All per-row checks, in order (coordinates first: they may correct the draft). */
export function runRowChecks(draft: SiteDraft): { issues: ImportIssue[]; perSqm: PerSqmCheck; water: WaterCheck } {
  const issues = [...checkCoordinates(draft), ...checkDepartmentRegion(draft), ...checkStatusActivity(draft), ...checkArbitrationDate(draft)];
  const perSqmCheck = checkPerSqm(draft);
  const water = checkWater(draft);
  return { issues: [...issues, ...perSqmCheck.issues, ...water.issues], perSqm: perSqmCheck, water };
}
