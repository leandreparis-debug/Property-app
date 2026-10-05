/**
 * The export SERIALIZER (step 11), PURE: turns plain records into tables of
 * typed cells, shared by the nightly export and the on-demand exports.
 *
 * - Sites: one row per site; one column per field of the registry (French
 *   label, technical key `Entity.key`), archiving columns, then COMPUTED
 *   columns (compliance status with its label, reasons, completeness,
 *   reference area, per-m² values of the last complete year).
 * - Financial data (registry fields marked `financial`, financial metrics)
 *   is left out entirely when the reader lacks `finance:read`.
 * - Yearly metrics (long format), equipment, documents (metadata), and the
 *   dictionary of every column.
 */
import { evaluateSite } from "../compliance/evaluate";
import type { ComplianceSite } from "../compliance/types";
import { toDateOnly } from "../dates";
import { perSqm, referenceArea, toNumber, type NumericLike } from "../derived";
import { DataSource, DocumentCategory } from "../enums";
import { categoryOf, equipmentTypeLabel } from "../equipment/catalog";
import { FIELD_REGISTRY, fieldId, sectionTitle, type FieldDefinition, type FieldEntity } from "../fields";
import { isFinancialMetric, METRICS } from "../metrics";
import { getStatusLabel } from "@/lib/status";
import type { CellValue } from "./csv";

/** Value kind of a column (XLSX cell type and number format). */
export type ColumnKind = "text" | "number" | "integer" | "percent" | "date" | "datetime" | "boolean";

/** A column of an export table. */
export interface ExportColumn {
  /** Technical key (CSV header), e.g. `Lease.endDate` or `computed.status`. */
  key: string;
  /** French header (XLSX). */
  header: string;
  kind: ColumnKind;
  /** Unit, if any (m², €, €/m², kWh…). */
  unit?: string;
  /** Computed on export, never stored. */
  computed: boolean;
}

/** A table: columns and rows of typed cells (same order). */
export interface ExportTable {
  /** Sheet name (XLSX). */
  sheet: string;
  columns: ExportColumn[];
  rows: CellValue[][];
}

/** Options of the serializer. */
export interface SerializeOptions {
  /** The reader holds `finance:read`: financial data is included. */
  finance: boolean;
  /** Business date of the export (status evaluation, last complete year). */
  today: Date;
}

type Plain = Record<string, unknown>;

/** One site and its 1-1 records, as read from the database. */
export interface ExportSiteRecord {
  site: Plain & { id: string; code: string; archivedAt?: Date | null };
  lease: Plain | null;
  serviceContract: Plain | null;
  technical: Plain | null;
  icpe: Plain | null;
  energyProfile: Plain | null;
  icpeHeadingsCount: number;
}

/** A yearly metric value. */
export interface ExportMetricRecord {
  siteCode: string;
  year: number;
  metric: string;
  value: NumericLike;
  source: string;
  note: string | null;
}

/** A piece of equipment. */
export interface ExportEquipmentRecord {
  siteCode: string;
  id: string;
  type: string;
  label: string | null;
  reference: string | null;
  level: string | null;
  installedAt: Date | null;
  latitude: NumericLike;
  longitude: NumericLike;
  planX: NumericLike;
  planY: NumericLike;
  notes: string | null;
  archivedAt: Date | null;
}

/** Document metadata. */
export interface ExportDocumentRecord {
  siteCode: string;
  id: string;
  category: string;
  title: string | null;
  mimeType: string | null;
  sizeBytes: bigint | number | null;
  sha256: string | null;
  storagePath: string;
  uploadedBy: string | null;
  createdAt: Date;
}

const ENTITY_RECORD: Readonly<Record<FieldEntity, keyof Omit<ExportSiteRecord, "icpeHeadingsCount">>> = {
  Site: "site",
  Lease: "lease",
  ServiceContract: "serviceContract",
  SiteTechnical: "technical",
  SiteIcpe: "icpe",
  SiteEnergyProfile: "energyProfile",
};

/** Unit of a registry field. */
function unitOf(def: FieldDefinition): string | undefined {
  switch (def.type) {
    case "area":
      return "m²";
    case "money":
      return "€";
    case "moneyPerSqm":
      return "€/m²";
    case "months":
      return "mois";
    default:
      return def.unit;
  }
}

/** Column kind of a registry field. */
function kindOf(def: FieldDefinition): ColumnKind {
  switch (def.type) {
    case "date":
    case "dateWithPrecision":
      return "date";
    case "area":
    case "money":
    case "moneyPerSqm":
    case "number":
    case "months":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
      return "boolean";
    default:
      return "text";
  }
}

const withUnit = (label: string, unit?: string) => (unit ? `${label} (${unit})` : label);

/** Cell of a registry field. */
function fieldCell(def: FieldDefinition, value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  switch (kindOf(def)) {
    case "date": {
      const date = toDateOnly(value as Date);
      return date ? { dateOnly: date } : null;
    }
    case "number":
    case "integer":
      return toNumber(value as NumericLike);
    case "boolean":
      return typeof value === "boolean" ? value : null;
    default:
      if (def.type === "enum" && typeof value === "string") return def.options?.[value] ?? value;
      return typeof value === "string" ? value : String(value);
  }
}

/** Registry fields included for a reader. */
export function exportedFields(finance: boolean): FieldDefinition[] {
  return FIELD_REGISTRY.filter((def) => finance || !def.financial);
}

/** Facts of a site for the compliance engine. */
export function complianceSiteOf(record: ExportSiteRecord): ComplianceSite {
  const s = record.site;
  const l = record.lease;
  const t = record.technical;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    code: record.site.code,
    name: str(s.name) ?? "",
    isActive: typeof s.isActive === "boolean" ? s.isActive : null,
    addressLine: str(s.addressLine),
    postalCode: str(s.postalCode),
    city: str(s.city),
    departmentCode: str(s.departmentCode),
    region: str(s.region),
    portfolio: str(s.portfolio),
    typology: str(s.typology),
    operatingMode: str(s.operatingMode),
    logisticsOperator: str(s.logisticsOperator),
    hasCoordinates: s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined,
    lease: l
      ? {
          code: str(l.code),
          holdingEntity: str(l.holdingEntity),
          endDate: toDateOnly(l.endDate as Date | null),
          nextExitDate: toDateOnly(l.nextExitDate as Date | null),
          noticeDate: toDateOnly(l.noticeDate as Date | null),
          noticePeriodMonths: typeof l.noticePeriodMonths === "number" ? l.noticePeriodMonths : null,
          renewalConditionsSigned: typeof l.renewalConditionsSigned === "boolean" ? l.renewalConditionsSigned : null,
        }
      : null,
    technical: t
      ? {
          surveyedTotalArea: t.surveyedTotalArea as NumericLike,
          totalWarehouseArea: t.totalWarehouseArea as NumericLike,
          socialOfficeArea: t.socialOfficeArea as NumericLike,
          landArea: t.landArea as NumericLike,
          dockCount: typeof t.dockCount === "number" ? t.dockCount : null,
        }
      : null,
    icpe: { holder: str(record.icpe?.holder), headingsCount: record.icpeHeadingsCount },
  };
}

/** Metrics with a meaningful per-m² value, readable by the reader. */
function perSqmMetrics(finance: boolean) {
  return METRICS.filter((m) => m.perSqmRelevant && (finance || !isFinancialMetric(m.code)));
}

/** Columns of the Sites table (registry, archiving, computed). */
export function siteColumns(options: SerializeOptions): ExportColumn[] {
  const fields = exportedFields(options.finance);
  const labels = new Map<string, number>();
  for (const def of fields) labels.set(def.labelFr, (labels.get(def.labelFr) ?? 0) + 1);
  const year = options.today.getUTCFullYear() - 1;
  return [
    ...fields.map((def) => {
      // An ambiguous label (same label in two sections) is prefixed with its section.
      const label = (labels.get(def.labelFr) ?? 0) > 1 ? `${sectionTitle(def.section)} — ${def.labelFr}` : def.labelFr;
      const unit = unitOf(def);
      return { key: fieldId(def), header: withUnit(label, unit), kind: kindOf(def), ...(unit ? { unit } : {}), computed: false };
    }),
    { key: "Site.archived", header: "Archivé", kind: "boolean", computed: false },
    { key: "Site.archivedAt", header: "Archivé le", kind: "datetime", computed: false },
    { key: "Site.id", header: "Identifiant interne", kind: "text", computed: false },
    { key: "computed.status", header: "Statut de conformité (calculé)", kind: "text", computed: true },
    { key: "computed.statusCode", header: "Code du statut de conformité (calculé)", kind: "text", computed: true },
    { key: "computed.reasons", header: "Raisons du statut (calculé)", kind: "text", computed: true },
    { key: "computed.completeness", header: "Complétude (%) (calculé)", kind: "integer", unit: "%", computed: true },
    { key: "computed.referenceArea", header: "Surface de référence (m²) (calculé)", kind: "number", unit: "m²", computed: true },
    ...perSqmMetrics(options.finance).map(
      (m): ExportColumn => ({
        key: `computed.perSqm.${m.code}.${year}`,
        header: `${m.labelFr} ${year} au m² (${m.unit}/m²) (calculé)`,
        kind: "number",
        unit: `${m.unit}/m²`,
        computed: true,
      }),
    ),
  ];
}

/**
 * The Sites table.
 * @param sites - Sites (archived included) with their 1-1 records.
 * @param metrics - Yearly values (for the per-m² columns).
 * @param options - Reader's financial permission, business date.
 */
export function buildSitesTable(sites: readonly ExportSiteRecord[], metrics: readonly ExportMetricRecord[], options: SerializeOptions): ExportTable {
  const columns = siteColumns(options);
  const fields = exportedFields(options.finance);
  const year = options.today.getUTCFullYear() - 1;
  const perSqmCodes = perSqmMetrics(options.finance).map((m) => m.code);
  const valuesOfYear = new Map<string, NumericLike>();
  for (const m of metrics) if (m.year === year) valuesOfYear.set(`${m.siteCode}|${m.metric}`, m.value);

  const rows = [...sites]
    .sort((a, b) => a.site.code.localeCompare(b.site.code, "fr"))
    .map((record): CellValue[] => {
      const evaluation = evaluateSite(complianceSiteOf(record), options.today);
      const area = referenceArea(record.technical as Parameters<typeof referenceArea>[0]);
      const archivedAt = record.site.archivedAt ?? null;
      return [
        ...fields.map((def) => fieldCell(def, record[ENTITY_RECORD[def.entity]]?.[def.key])),
        archivedAt !== null,
        archivedAt,
        record.site.id,
        getStatusLabel(evaluation.status),
        evaluation.status,
        evaluation.reasons.map((r) => (r.detailFr ? `${r.labelFr} (${r.detailFr})` : r.labelFr)).join(" ; ") || null,
        evaluation.completeness,
        area,
        ...perSqmCodes.map((code) => perSqm(valuesOfYear.get(`${record.site.code}|${code}`), area)),
      ];
    });
  return { sheet: "Sites", columns, rows };
}

/** Columns of the yearly metrics table (long format). */
export const METRIC_COLUMNS: readonly ExportColumn[] = [
  { key: "site.code", header: "Code entrepôt", kind: "text", computed: false },
  { key: "year", header: "Année", kind: "integer", computed: false },
  { key: "metric", header: "Code de l'indicateur", kind: "text", computed: false },
  { key: "metric.label", header: "Indicateur", kind: "text", computed: false },
  { key: "unit", header: "Unité", kind: "text", computed: false },
  { key: "value", header: "Valeur", kind: "number", computed: false },
  { key: "computed.perSqm", header: "Valeur au m² (calculé)", kind: "number", computed: true },
  { key: "source", header: "Origine", kind: "text", computed: false },
  { key: "note", header: "Note", kind: "text", computed: false },
];

/**
 * The yearly metrics table (one row per site, year and metric). Financial
 * metrics are left out without `finance:read`.
 */
export function buildMetricsTable(metrics: readonly ExportMetricRecord[], sites: readonly ExportSiteRecord[], options: SerializeOptions): ExportTable {
  const areas = new Map(sites.map((s) => [s.site.code, referenceArea(s.technical as Parameters<typeof referenceArea>[0])]));
  const byCode = new Map(METRICS.map((m) => [m.code as string, m]));
  const rows = metrics
    .filter((m) => options.finance || !isFinancialMetric(m.metric))
    .slice()
    .sort((a, b) => a.siteCode.localeCompare(b.siteCode, "fr") || a.metric.localeCompare(b.metric) || a.year - b.year)
    .map((m): CellValue[] => {
      const def = byCode.get(m.metric);
      return [
        m.siteCode,
        m.year,
        m.metric,
        def?.labelFr ?? m.metric,
        def?.unit ?? null,
        toNumber(m.value),
        def?.perSqmRelevant ? perSqm(m.value, areas.get(m.siteCode) ?? null) : null,
        DataSource.is(m.source) ? DataSource.label(m.source) : m.source,
        m.note,
      ];
    });
  return { sheet: "Indicateurs annuels", columns: [...METRIC_COLUMNS], rows };
}

/** Columns of the equipment table. */
export const EQUIPMENT_COLUMNS: readonly ExportColumn[] = [
  { key: "site.code", header: "Code entrepôt", kind: "text", computed: false },
  { key: "id", header: "Identifiant", kind: "text", computed: false },
  { key: "type", header: "Code du type", kind: "text", computed: false },
  { key: "type.label", header: "Type", kind: "text", computed: false },
  { key: "category.label", header: "Famille", kind: "text", computed: false },
  { key: "label", header: "Libellé", kind: "text", computed: false },
  { key: "reference", header: "Référence", kind: "text", computed: false },
  { key: "level", header: "Niveau", kind: "text", computed: false },
  { key: "installedAt", header: "Date d'installation", kind: "date", computed: false },
  { key: "latitude", header: "Latitude", kind: "number", computed: false },
  { key: "longitude", header: "Longitude", kind: "number", computed: false },
  { key: "planX", header: "Position X sur le plan", kind: "number", computed: false },
  { key: "planY", header: "Position Y sur le plan", kind: "number", computed: false },
  { key: "archivedAt", header: "Archivé le", kind: "datetime", computed: false },
  { key: "notes", header: "Notes", kind: "text", computed: false },
];

/** The equipment table. */
export function buildEquipmentTable(items: readonly ExportEquipmentRecord[]): ExportTable {
  const rows = [...items]
    .sort((a, b) => a.siteCode.localeCompare(b.siteCode, "fr") || a.type.localeCompare(b.type) || (a.label ?? "").localeCompare(b.label ?? "", "fr"))
    .map((e): CellValue[] => [
      e.siteCode,
      e.id,
      e.type,
      equipmentTypeLabel(e.type),
      categoryOf(e.type)?.labelFr ?? null,
      e.label,
      e.reference,
      e.level,
      e.installedAt ? { dateOnly: e.installedAt } : null,
      toNumber(e.latitude),
      toNumber(e.longitude),
      toNumber(e.planX),
      toNumber(e.planY),
      e.archivedAt,
      e.notes,
    ]);
  return { sheet: "Équipements", columns: [...EQUIPMENT_COLUMNS], rows };
}

/** Columns of the documents table. */
export const DOCUMENT_COLUMNS: readonly ExportColumn[] = [
  { key: "site.code", header: "Code entrepôt", kind: "text", computed: false },
  { key: "id", header: "Identifiant", kind: "text", computed: false },
  { key: "category", header: "Code de la catégorie", kind: "text", computed: false },
  { key: "category.label", header: "Catégorie", kind: "text", computed: false },
  { key: "title", header: "Titre", kind: "text", computed: false },
  { key: "mimeType", header: "Type de fichier", kind: "text", computed: false },
  { key: "sizeBytes", header: "Taille (octets)", kind: "integer", unit: "octets", computed: false },
  { key: "sha256", header: "Empreinte SHA-256", kind: "text", computed: false },
  { key: "storagePath", header: "Chemin de stockage", kind: "text", computed: false },
  { key: "uploadedBy", header: "Déposé par", kind: "text", computed: false },
  { key: "createdAt", header: "Déposé le", kind: "datetime", computed: false },
];

/** The documents table (metadata only, never the files). */
export function buildDocumentsTable(documents: readonly ExportDocumentRecord[]): ExportTable {
  const rows = [...documents]
    .sort((a, b) => a.siteCode.localeCompare(b.siteCode, "fr") || a.createdAt.getTime() - b.createdAt.getTime())
    .map((d): CellValue[] => [
      d.siteCode,
      d.id,
      d.category,
      DocumentCategory.is(d.category) ? DocumentCategory.label(d.category) : d.category,
      d.title,
      d.mimeType,
      d.sizeBytes === null ? null : Number(d.sizeBytes),
      d.sha256,
      d.storagePath,
      d.uploadedBy,
      d.createdAt,
    ]);
  return { sheet: "Documents", columns: [...DOCUMENT_COLUMNS], rows };
}

/** Columns of the dictionary. */
export const DICTIONARY_COLUMNS: readonly ExportColumn[] = [
  { key: "sheet", header: "Feuille", kind: "text", computed: false },
  { key: "header", header: "Libellé", kind: "text", computed: false },
  { key: "key", header: "Clé technique", kind: "text", computed: false },
  { key: "unit", header: "Unité", kind: "text", computed: false },
  { key: "nature", header: "Nature", kind: "text", computed: false },
];

/** The dictionary: every column of the given tables (label, key, unit, computed or stored). */
export function buildDictionary(tables: readonly ExportTable[]): ExportTable {
  const rows = tables.flatMap((t) => t.columns.map((c): CellValue[] => [t.sheet, c.header, c.key, c.unit ?? null, c.computed ? "Calculé" : "Stocké"]));
  return { sheet: "Dictionnaire", columns: [...DICTIONARY_COLUMNS], rows };
}
