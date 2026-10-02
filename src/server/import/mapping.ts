/**
 * Declarative mapping « spreadsheet column → database ».
 *
 * SINGLE SOURCE OF TRUTH of the import, kept identical to
 * docs/source-mapping.md (a unit test checks that every column of the
 * document is recognised here, mapped or ignored).
 *
 * - Fixed columns are declared with their label as written in the
 *   spreadsheet; they are compared after `normalizeHeader`.
 * - Yearly columns are recognised by PATTERNS, so a new year (2027…) is
 *   imported without code change.
 * - Derived columns (/M², PAR M², EVOLUTION, ratio, arbitration date) are
 *   never written: they are only read for the consistency checks.
 */
import type { BuildingWorkKind, ExternalSystem } from "@/domain/enums";
import type { MetricCode } from "@/domain/metrics";
import { normalizeHeader } from "./header-name";

/** One-to-one entities written from the spreadsheet. */
export type EntityKey = "site" | "lease" | "serviceContract" | "technical" | "icpe" | "energy";

/** How a plain field column is parsed. */
export type FieldParser =
  | { type: "text"; maxLength?: number }
  | { type: "money" }
  | { type: "area" }
  | { type: "height" }
  | { type: "energy" }
  | { type: "number"; scale: number }
  | { type: "integer" }
  | { type: "boolean" }
  | { type: "date" }
  | { type: "country" };

/** Target of a recognised column. */
export type ColumnSpec =
  | { kind: "code" }
  | { kind: "name" }
  | { kind: "field"; entity: EntityKey; field: string; parser: FieldParser }
  | { kind: "reference"; entity: EntityKey; field: string; maxLength: number }
  | { kind: "externalId"; system: ExternalSystem; normalize: boolean }
  | { kind: "address" }
  | { kind: "department" }
  | { kind: "region" }
  | { kind: "latitude" }
  | { kind: "longitude" }
  | { kind: "activityStart" }
  | { kind: "noticePeriod" }
  | { kind: "buildingWork"; workKind: BuildingWorkKind }
  | { kind: "icpeHeadings" }
  | { kind: "georisques"; variant: "url" | "link" }
  | { kind: "metric"; metric: MetricCode; year: number; variant?: "idf" }
  | { kind: "activityMetric"; metric: MetricCode }
  | { kind: "sheetModified" }
  | { kind: "derived"; check: DerivedCheck };

/** What a derived (ignored) column is used for. */
export type DerivedCheck =
  | { type: "perSqm"; metric: MetricCode; year: number }
  | { type: "evolution" }
  | { type: "officeRatio" }
  | { type: "arbitrationDate" };

const text = (maxLength?: number): FieldParser => ({ type: "text", maxLength });
const f = (entity: EntityKey, field: string, parser: FieldParser): ColumnSpec => ({ kind: "field", entity, field, parser });
const area = (field: string) => f("technical", field, { type: "area" });
const date = (entity: EntityKey, field: string) => f(entity, field, { type: "date" });
const bool = (entity: EntityKey, field: string) => f(entity, field, { type: "boolean" });
const money = (entity: EntityKey, field: string) => f(entity, field, { type: "money" });

/** Fixed columns, labelled as in the spreadsheet (docs/source-mapping.md order). */
export const FIXED_COLUMNS: ReadonlyArray<readonly [label: string, spec: ColumnSpec]> = [
  ["ENTREPOT", { kind: "code" }],
  ["CODE BAIL", f("lease", "code", text(50))],
  ["CLES QLICKSENS", { kind: "externalId", system: "QLIK_SENSE", normalize: false }],
  ["CODE AL", { kind: "externalId", system: "AL_CODE", normalize: true }],
  ["N°", f("site", "legacyNumber", text(50))],
  ["NOM ENTREPOT", { kind: "name" }],
  ["PORTEFEUILLE PROPERTY", f("site", "portfolio", text(100))],
  ["BU OCCUPANTE", f("site", "occupyingBu", text(100))],
  ["BASSIN BU", f("site", "buBasin", text(100))],
  ["PAYS", f("site", "country", { type: "country" })],
  ["RESPONSABLE DE REGION (DLR)", f("site", "regionalDirector", text(150))],
  ["RESPONSABLE TECHNIQUE REGIONAL (RTR)", f("site", "regionalTechnicalManager", text(150))],
  ["RAMSES", { kind: "externalId", system: "RAMSES", normalize: true }],
  ["ENTITE PORTANT LE BAIL", f("lease", "holdingEntity", text(200))],
  ["STATUT D'OCCUPATION", f("site", "occupancyStatus", text(100))],
  ["PROPRIETAIRE DES MURS", f("site", "wallsOwner", text(200))],
  ["SCI SUR ACTIF", f("site", "sciOnAsset", text(200))],
  ["PROPERTY MANAGER", f("site", "propertyManager", text(150))],
  ["STATUT", f("site", "status", text(100))],
  ["EN ACTIVITE", bool("site", "isActive")],
  ["MODE D'EXPLOITATION", f("site", "operatingMode", text(100))],
  ["EXPLOITANT LOGISTIQUE", f("site", "logisticsOperator", text(200))],
  ["ADRESSE", { kind: "address" }],
  ["DEPARTEMENT", { kind: "department" }],
  ["REGION", { kind: "region" }],
  ["LAT", { kind: "latitude" }],
  ["LONG", { kind: "longitude" }],
  ["SECTEUR DE DISTRIBUTION", f("site", "distributionSector", text(150))],
  ["TYPOLOGIE", f("site", "typology", text(150))],
  ["ACTIVITE CIBLE", f("site", "targetActivity", text(150))],
  ["MAGASINS DESSERVIS", f("site", "storesServedDescription", text())],
  ["NOMBRE MAGASIN DESSERVIS", f("site", "storesServedCount", { type: "integer" })],
  ["BAIL", { kind: "reference", entity: "lease", field: "documentReference", maxLength: 500 }],
  ["PLANS", { kind: "reference", entity: "technical", field: "plansReference", maxLength: 500 }],
  ["DOSSIER ADMINISTRATIF", { kind: "reference", entity: "site", field: "adminFileReference", maxLength: 500 }],
  ["ENTREE EN ACTIVITE", { kind: "activityStart" }],
  ["DATE D'EFFET BAIL INITIAL", date("lease", "initialEffectiveDate")],
  ["DATE D'EFFET DERNIER AVENANT", date("lease", "lastAmendmentDate")],
  ["MODALITES DU BAIL EN COURS", f("lease", "currentTerms", text())],
  ["FRANCHISE DE LOYER INITIAL", f("lease", "initialRentFree", text(500))],
  ["DATE DE FIN DE BAIL", date("lease", "endDate")],
  ["PROCHAINE DATE DE SORTIE", date("lease", "nextExitDate")],
  ["DUREE DE PREAVIS", { kind: "noticePeriod" }],
  ["DATE DE PREAVIS", date("lease", "noticeDate")],
  ["DATE D'ARBITRAGE POUR ECHEANCE CONTRACTUELLE (6 MOIS AVANT)", { kind: "derived", check: { type: "arbitrationDate" } }],
  ["AVANCEMENT NEGOCIATION", f("lease", "negotiationProgress", text())],
  ["ACTUALITES", f("lease", "news", text())],
  ["CONDITIONS RENOUVELLEMENT SIGNEES", bool("lease", "renewalConditionsSigned")],
  ["MONTANT FRANCHISE", money("lease", "rentFreeAmount")],
  ["FRANCHISE MOIS", f("lease", "rentFreeMonths", { type: "number", scale: 2 })],
  ["DUREE SUPPLEMENTAIRE", f("lease", "additionalDuration", text(200))],
  // Contractual prices per m²: stored (not derived) — exception to the /M² rule.
  ["LOYER ECONOMIQUE / M²", money("lease", "economicRentPerSqm")],
  ["VLM", money("lease", "marketRentValue")],
  ["INDEXATION", f("lease", "indexation", text(500))],
  ["REVISION DE LOYER", f("lease", "rentReview", text(500))],
  ["M² BUREAUX/M²TOTAL", { kind: "derived", check: { type: "officeRatio" } }],
  ["PRIX BUREAUX / M2", money("lease", "officePricePerSqm")],
  ["COMMENTAIRES LOYER", f("lease", "rentComments", text())],
  ["PORTEUR DE L'ICPE", f("icpe", "holder", text(200))],
  ["PRINCIPALES RUBRIQUES ICPE", { kind: "icpeHeadings" }],
  ["Lien Géorisques", { kind: "georisques", variant: "link" }],
  ["URL Géorisques", { kind: "georisques", variant: "url" }],
  ["DOCUMENTS ADMINISTRATIFS ICPE", { kind: "reference", entity: "icpe", field: "documentsReference", maxLength: 1000 }],
  ["ANNEE DE REFERENCE", f("energy", "referenceYear", { type: "integer" })],
  ["ANNEE DE REFERENCE CONSO ELEC EN KWH", f("energy", "referenceElectricityKwh", { type: "energy" })],
  ["ANNEE DE REFERENCE CONSO GAZ EN KWH", f("energy", "referenceGasKwh", { type: "energy" })],
  ["Refacturation Gestion Technique Oui/Non", bool("energy", "technicalManagementRebilled")],
  ["Détail si refacturation gestion technique", f("energy", "technicalManagementRebillDetail", text())],
  ["CERTIFICATS OPERAT", f("energy", "operatCertificates", text(1000))],
  ["PRISE D'EFFET DU CONTRAT DE PRESTATION", date("serviceContract", "effectiveDate")],
  ["CLAUSE IMMOBILIERE => CONTRAT DE PRESTATION (Oui/Non)", bool("serviceContract", "hasRealEstateClause")],
  ["DUREE DU CONTRAT DE PRESTATION", f("serviceContract", "durationRaw", text(200))],
  ["DATE DE FIN DE CONTRAT DE PRESTATION", date("serviceContract", "endDate")],
  ["RECONDUCTION DU CONTRAT DE PRESTATION", f("serviceContract", "renewal", text(500))],
  ["PREAVIS DU CONTRAT DE PRESTATION", f("serviceContract", "notice", text(500))],
  ["ANTERIORIETE", f("serviceContract", "seniority", text(200))],
  ["DATE DE 1ERE RESILIATION", date("serviceContract", "firstTerminationDate")],
  ["ETP MOYEN", { kind: "activityMetric", metric: "HEADCOUNT_FTE" }],
  ["CA MARCHANDISE", { kind: "activityMetric", metric: "MERCHANDISE_REVENUE" }],
  ["NOMBRE DE COLIS ANNUEL", { kind: "activityMetric", metric: "PARCELS" }],
  ["QUALITE BATIMENT", f("technical", "buildingQuality", text(100))],
  ["DATE DE CONSTRUCTION", { kind: "buildingWork", workKind: "CONSTRUCTION" }],
  ["DATE DE REHABILITATION", { kind: "buildingWork", workKind: "REHABILITATION" }],
  ["DATE D'EXTENSION", { kind: "buildingWork", workKind: "EXTENSION" }],
  ["ENTREPOTS (TOTAL BAIL)", area("leaseWarehouseArea")],
  ["TERRAIN", area("landArea")],
  ["SURFACE ENTREPOT TOTAL", area("totalWarehouseArea")],
  ["ENTREPOT A TEMPERATURE CONTROLE", area("temperatureControlledArea")],
  ["ENTREPOT SEC", area("dryArea")],
  ["EMBALLAGE", area("packagingArea")],
  ["LOCAL DE CHARGES", area("chargingRoomArea")],
  ["LOCAUX TECHNIQUES", area("technicalRoomsArea")],
  ["BLS", area("socialOfficeArea")],
  ["POSTE DE GARDE", area("guardHouseArea")],
  ["HAUTEUR (M)", f("technical", "heightM", { type: "height" })],
  ["NOMBRE DE PLACE VL", f("technical", "carSpaces", { type: "integer" })],
  ["NOMBRE DE PLACE PL", f("technical", "truckSpaces", { type: "integer" })],
  ["NOMBRE DE QUAIS", f("technical", "dockCount", { type: "integer" })],
  ["ENTREPOTS TOTAL (RELEVE DE GEOMETRE)", area("surveyedTotalArea")],
  ["BASSIN DE RETENTION", f("technical", "retentionBasin", text(500))],
  ["CAPACITE D'EXTENTION", f("technical", "extensionCapacity", text(500))],
  ["NOMBRE CELLULES", f("technical", "cellCount", { type: "integer" })],
  ["SPECIFICITES TECHNIQUES", f("technical", "technicalSpecifics", text())],
  ["CERTIFICATION", f("technical", "certification", text(200))],
  ["BORNES", f("technical", "evCharging", text(200))],
  ["PHOTOVOLTAIQUE", f("technical", "photovoltaic", text(200))],
  ["Date modif", { kind: "sheetModified" }],
];

const FIXED = new Map<string, ColumnSpec>(FIXED_COLUMNS.map(([label, spec]) => [normalizeHeader(label), spec]));

/** Normalised headers of the fixed columns (expected in a complete file). */
export const FIXED_HEADERS: readonly string[] = [...FIXED.keys()];

type YearPattern = { pattern: RegExp; build: (m: RegExpExecArray) => ColumnSpec };
const year = (m: RegExpExecArray, i: number) => Number(m[i]);

/**
 * Yearly metric columns (normalised headers). A new year is picked up
 * automatically (e.g. « LOYER 2027 »).
 */
export const METRIC_PATTERNS: readonly YearPattern[] = [
  { pattern: /^LOYER (\d{4})$/, build: (m) => ({ kind: "metric", metric: "RENT", year: year(m, 1) }) },
  { pattern: /^LOYER PERCU (\d{4})$/, build: (m) => ({ kind: "metric", metric: "RENT_COLLECTED", year: year(m, 1) }) },
  { pattern: /^CHARGES (\d{4})$/, build: (m) => ({ kind: "metric", metric: "CHARGES", year: year(m, 1) }) },
  { pattern: /^PROVISIONS CHARGES (\d{4})$/, build: (m) => ({ kind: "metric", metric: "CHARGES_PROVISION", year: year(m, 1) }) },
  { pattern: /^ASSURANCES (\d{4})$/, build: (m) => ({ kind: "metric", metric: "INSURANCE", year: year(m, 1) }) },
  { pattern: /^TF (\d{4})$/, build: (m) => ({ kind: "metric", metric: "PROPERTY_TAX", year: year(m, 1) }) },
  { pattern: /^TAXES (\d{4})$/, build: (m) => ({ kind: "metric", metric: "TAXES_TOTAL", year: year(m, 1) }) },
  {
    pattern: /^TAXE BUREAU( IDF)? (\d{4})$/,
    build: (m) => ({ kind: "metric", metric: "OFFICE_TAX", year: year(m, 2), ...(m[1] ? { variant: "idf" as const } : {}) }),
  },
  { pattern: /^TAXE PARKING (\d{4})$/, build: (m) => ({ kind: "metric", metric: "PARKING_TAX", year: year(m, 1) }) },
  { pattern: /^(\d{4}) CONSO ELEC EN KWH$/, build: (m) => ({ kind: "metric", metric: "ELECTRICITY", year: year(m, 1) }) },
  { pattern: /^(\d{4}) CONSO GAZ EN KWH$/, build: (m) => ({ kind: "metric", metric: "GAS", year: year(m, 1) }) },
  { pattern: /^(\d{4}) EAU$/, build: (m) => ({ kind: "metric", metric: "WATER", year: year(m, 1) }) },
];

const perSqm = (metric: MetricCode, i: number) => (m: RegExpExecArray): ColumnSpec => ({
  kind: "derived",
  check: { type: "perSqm", metric, year: year(m, i) },
});

/** Per-m² columns: ignored, but read to check the spreadsheet's arithmetic. */
export const PER_SQM_PATTERNS: readonly YearPattern[] = [
  { pattern: /^LOYER (\d{4})\/M²$/, build: perSqm("RENT", 1) },
  { pattern: /^CHARGES\/M² (\d{4})$/, build: perSqm("CHARGES", 1) },
  { pattern: /^CHARGES (\d{4})\/M²$/, build: perSqm("CHARGES", 1) },
  { pattern: /^ASSURANCES\/M² (\d{4})$/, build: perSqm("INSURANCE", 1) },
  { pattern: /^TF\/M² (\d{4})$/, build: perSqm("PROPERTY_TAX", 1) },
  { pattern: /^TAXE BUREAU(?: IDF)?\/M² (\d{4})$/, build: perSqm("OFFICE_TAX", 1) },
  { pattern: /^(\d{4}) CONSO ELEC PAR M²$/, build: perSqm("ELECTRICITY", 1) },
  { pattern: /^(\d{4}) CONSO GAZ PAR M²$/, build: perSqm("GAS", 1) },
  { pattern: /^(\d{4}) EAU\/M²$/, build: perSqm("WATER", 1) },
];

/** Other derived columns, ignored whatever their year or wording. */
export const IGNORED_PATTERNS: readonly { pattern: RegExp; spec: ColumnSpec }[] = [
  { pattern: /^EVOLUTION\b/, spec: { kind: "derived", check: { type: "evolution" } } },
  { pattern: /^M² BUREAUX\/M²TOTAL$/, spec: { kind: "derived", check: { type: "officeRatio" } } },
  { pattern: /^DATE D'ARBITRAGE\b/, spec: { kind: "derived", check: { type: "arbitrationDate" } } },
  { pattern: /\/M²|PAR M²/, spec: { kind: "derived", check: { type: "evolution" } } },
];

/**
 * Mapping of a normalised header: fixed columns first (so the contractual
 * « LOYER ECONOMIQUE / M² » is not caught by the /M² rule), then yearly
 * metric patterns, per-m² patterns and other ignored patterns.
 *
 * @param normalized - Header after `normalizeHeader`.
 * @returns The column spec, or `null` for an unknown column.
 */
export function resolveColumn(normalized: string): ColumnSpec | null {
  const fixed = FIXED.get(normalized);
  if (fixed) return fixed;
  for (const { pattern, build } of [...METRIC_PATTERNS, ...PER_SQM_PATTERNS]) {
    const m = pattern.exec(normalized);
    if (m) return build(m);
  }
  for (const { pattern, spec } of IGNORED_PATTERNS) {
    if (pattern.test(normalized)) return spec;
  }
  return null;
}

/** Reference columns (for the classifyReference statistics). */
export const REFERENCE_COLUMNS: readonly string[] = ["BAIL", "PLANS", "DOSSIER ADMINISTRATIF", "DOCUMENTS ADMINISTRATIFS ICPE"];
