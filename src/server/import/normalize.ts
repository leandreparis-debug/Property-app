/**
 * Row normalisation: one spreadsheet row → one {@link SiteDraft}, plus its
 * anomalies. Pure function (no database access).
 */
import { APP_NAME } from "@/config/app";
import type { BuildingWorkKind, ExternalSystem } from "@/domain/enums";
import { departmentFromPostalCode, resolveDepartment, resolveRegion } from "@/domain/geo";
import { metricValueSchema } from "@/domain/metrics";
import type { FileColumn } from "./headers";
import type { ColumnSpec, EntityKey, FieldParser } from "./mapping";
import {
  classifyReference,
  isPlaceholder,
  parseArea,
  parseBoolean,
  parseDate,
  parseDates,
  parseDurationMonths,
  parseEnergy,
  parseExternalIds,
  parseHeight,
  parseIcpeHeadings,
  parseInteger,
  parseMoney,
  parseNumber,
  parseText,
  type CellValue,
  type ParseIssue,
  type ParseResult,
} from "./parsers";
import { metricKey, type ImportIssue, type RawCell, type RawRow, type SiteDraft } from "./types";

/** Options of {@link normalizeRow}. */
export interface NormalizeOptions {
  /** Year given to the activity columns without year (ETP, CA, colis). */
  activityYear: number;
  /** Reference date (two-digit years). */
  now?: Date;
}

/** Result of {@link normalizeRow}. */
export interface NormalizedRow {
  /** `null` when the row is empty or rejected. */
  draft: SiteDraft | null;
  issues: ImportIssue[];
  /** True when every cell of the row is empty (skipped silently). */
  empty: boolean;
}

/** Printable form of a raw cell, for the report. */
export function describeCell(cell: RawCell | undefined): string | null {
  if (!cell || cell.value === null || cell.value === undefined) return cell?.hyperlink ?? null;
  const v = cell.value;
  const text = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return cell.hyperlink && cell.hyperlink !== text ? `${text} → ${cell.hyperlink}` : text;
}

/** Printable form of a retained value, for the report. */
export function describeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map((v) => describeValue(v)).join(", ");
  if (typeof value === "object" && "date" in (value as object)) return describeValue((value as { date: Date }).date);
  return String(value);
}

const COUNTRIES: Readonly<Record<string, string>> = {
  france: "FR",
  fr: "FR",
  fra: "FR",
  belgique: "BE",
  espagne: "ES",
  italie: "IT",
  allemagne: "DE",
  luxembourg: "LU",
  suisse: "CH",
};

function parseCountry(value: CellValue): ParseResult<string> {
  const t = parseText(value);
  if (t.value === null) return t;
  const key = t.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const code = COUNTRIES[key] ?? (/^[a-z]{2}$/.test(key) ? key.toUpperCase() : undefined);
  if (!code) return { value: null, issue: { severity: "warning", kind: "invalid_country", message: `Pays non reconnu : « ${t.value} ».` } };
  if (code !== "FR") {
    return { value: code, issue: { severity: "warning", kind: "foreign_country", message: `Pays « ${code} » : ${APP_NAME} ne couvre que la France métropolitaine.` } };
  }
  return { value: code };
}

function parseField(parser: FieldParser, value: CellValue, now: Date): ParseResult<unknown> {
  switch (parser.type) {
    case "text":
      return parseText(value, parser.maxLength);
    case "money":
      return parseMoney(value);
    case "area":
      return parseArea(value);
    case "height":
      return parseHeight(value);
    case "energy":
      return parseEnergy(value);
    case "number":
      return parseNumber(value, parser.scale);
    case "integer":
      return parseInteger(value);
    case "boolean":
      return parseBoolean(value);
    case "country":
      return parseCountry(value);
    case "date": {
      const result = parseDate(value, now);
      if (result.value && result.value.precision !== "day") {
        return {
          value: result.value.date,
          issue: {
            severity: "info",
            kind: "date_precision_lost",
            message: `Date incomplète (${result.value.precision === "year" ? "année" : "mois"} seul) : enregistrée au premier jour de la période.`,
          },
        };
      }
      return { value: result.value?.date ?? null, issue: result.issue };
    }
  }
}

/** Splits « 12 rue X, 69800 Saint-Priest » into line, postal code and city. */
export function parseAddress(value: CellValue): {
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  issue?: ParseIssue;
} {
  const t = parseText(value, 300);
  if (t.value === null) return { addressLine: null, postalCode: null, city: null, issue: t.issue };
  const oneLine = t.value.replace(/\n/g, ", ");
  const m = /(?:^|[\s,])(\d{5})\s+([^,\d][^,]*?)\s*(?:,\s*(?:france))?\s*$/i.exec(oneLine);
  if (!m) {
    return {
      addressLine: oneLine,
      postalCode: null,
      city: null,
      issue: { severity: "warning", kind: "address_unparsed", message: "Code postal et ville non trouvés : adresse conservée telle quelle." },
    };
  }
  const addressLine = oneLine.slice(0, m.index).replace(/[\s,]+$/, "").trim() || null;
  return { addressLine, postalCode: m[1]!, city: m[2]!.trim().slice(0, 150) };
}

/**
 * Normalises one data row.
 *
 * Only columns present in the file produce fields; a present-but-empty cell
 * yields `null` (the value is erased on import, unless preserved).
 *
 * @param row - Raw row.
 * @param columns - Columns of the file (from header detection).
 * @param options - Activity year, reference date.
 */
export function normalizeRow(row: RawRow, columns: readonly FileColumn[], options: NormalizeOptions): NormalizedRow {
  const now = options.now ?? new Date();
  const issues: ImportIssue[] = [];
  const hasData = [...row.cells.values()].some((c) => !isEmptyCell(c));
  if (!hasData) return { draft: null, issues, empty: true };

  const codeColumn = columns.find((c) => c.spec?.kind === "code");
  const codeCell = codeColumn ? row.cells.get(codeColumn.index) : undefined;
  const codeText = codeCell && !isPlaceholder(codeCell.value) ? String(codeCell.value).replace(/\s+/g, " ").trim() : "";
  const code = codeText.slice(0, 50);

  const push = (column: FileColumn | null, issue: ParseIssue, cell?: RawCell, retained?: unknown) =>
    issues.push({
      row: row.rowNumber,
      code: code || null,
      column: column?.header ?? null,
      severity: issue.severity,
      kind: issue.kind,
      original: describeCell(cell),
      retained: describeValue(retained),
      message: issue.message,
    });

  if (!code) {
    push(codeColumn ?? null, { severity: "error", kind: "missing_code", message: "Code entrepôt (ENTREPOT) manquant : ligne rejetée." }, codeCell);
    return { draft: null, issues, empty: false };
  }
  if (codeText.length > 50) {
    push(codeColumn ?? null, { severity: "error", kind: "code_too_long", message: "Code entrepôt de plus de 50 caractères : ligne rejetée." }, codeCell);
    return { draft: null, issues, empty: false };
  }

  const draft: SiteDraft = {
    row: row.rowNumber,
    code,
    entities: { site: new Map(), lease: new Map(), serviceContract: new Map(), technical: new Map(), icpe: new Map(), energy: new Map() },
    externalIds: new Map(),
    buildingWorks: new Map(),
    icpeHeadings: undefined,
    metrics: new Map(),
    sheetModifiedAt: null,
    sheet: { perSqm: [], arbitrationDate: null },
    references: [],
  };
  const set = (entity: EntityKey, field: string, value: unknown) => draft.entities[entity].set(field, value);

  let nameCell: { column: FileColumn; cell: RawCell | undefined } | null = null;
  let department: { column: FileColumn; cell: RawCell | undefined } | null = null;
  let region: { column: FileColumn; cell: RawCell | undefined } | null = null;
  let postalCode: string | null = null;
  const georisques: { url?: string | null; link?: string | null; urlColumn?: FileColumn; cells: RawCell[] } = { cells: [] };
  const officeTax = new Map<number, { idf?: number | null; plain?: number | null; column: FileColumn }>();

  for (const column of columns) {
    const spec: ColumnSpec | null = column.spec;
    if (!spec) continue;
    const cell = row.cells.get(column.index);
    const value = cell?.value ?? null;

    switch (spec.kind) {
      case "code":
        break;
      case "name":
        nameCell = { column, cell };
        break;
      case "field": {
        const result = parseField(spec.parser, value, now);
        if (result.issue) push(column, result.issue, cell, result.value);
        set(spec.entity, spec.field, result.value);
        break;
      }
      case "reference": {
        const ref = classifyReference(value, cell?.hyperlink);
        draft.references.push({ column: column.header, kind: ref.kind });
        let stored = ref.value;
        if (stored && stored.length > spec.maxLength) {
          push(column, { severity: "warning", kind: "text_truncated", message: `Référence tronquée à ${spec.maxLength} caractères.` }, cell);
          stored = stored.slice(0, spec.maxLength);
        }
        if (ref.kind === "empty" && isPlaceholder(value) && typeof value === "string" && value.trim() !== "") {
          push(column, { severity: "info", kind: "placeholder", message: `Valeur « ${value.trim()} » considérée comme vide.` }, cell);
        }
        set(spec.entity, spec.field, stored);
        break;
      }
      case "externalId": {
        const ids = parseExternalIds(value, spec.normalize).value ?? [];
        draft.externalIds.set(spec.system as ExternalSystem, ids);
        break;
      }
      case "address": {
        const address = parseAddress(value);
        if (address.issue) push(column, address.issue, cell);
        set("site", "addressLine", address.addressLine);
        set("site", "postalCode", address.postalCode);
        set("site", "city", address.city);
        postalCode = address.postalCode;
        break;
      }
      case "department":
        department = { column, cell };
        break;
      case "region":
        region = { column, cell };
        break;
      case "latitude":
      case "longitude": {
        const result = parseNumber(value, 6);
        if (result.issue) push(column, result.issue, cell);
        set("site", spec.kind, result.value);
        break;
      }
      case "activityStart": {
        const result = parseDate(value, now);
        if (result.issue) push(column, result.issue, cell);
        set("site", "activityStartDate", result.value?.date ?? null);
        set("site", "activityStartDatePrecision", result.value?.precision ?? null);
        break;
      }
      case "noticePeriod": {
        const raw = parseText(value, 200);
        const months = parseDurationMonths(value);
        if (raw.issue) push(column, raw.issue, cell);
        else if (months.issue) push(column, months.issue, cell, raw.value);
        set("lease", "noticePeriodRaw", raw.value);
        set("lease", "noticePeriodMonths", months.value);
        break;
      }
      case "buildingWork": {
        const result = parseDates(value, now);
        for (const issue of result.issues) push(column, issue, cell);
        draft.buildingWorks.set(spec.workKind as BuildingWorkKind, result.value);
        break;
      }
      case "icpeHeadings": {
        const raw = parseText(value);
        const result = parseIcpeHeadings(value);
        if (raw.issue) push(column, raw.issue, cell);
        for (const issue of result.issues) push(column, issue, cell);
        set("icpe", "headingsRaw", raw.value);
        draft.icpeHeadings = result.value;
        break;
      }
      case "georisques": {
        const ref = classifyReference(value, cell?.hyperlink);
        georisques[spec.variant] = ref.value;
        if (spec.variant === "url") georisques.urlColumn = column;
        if (cell) georisques.cells.push(cell);
        break;
      }
      case "metric":
      case "activityMetric": {
        const year = spec.kind === "metric" ? spec.year : options.activityYear;
        const result = spec.metric === "ELECTRICITY" || spec.metric === "GAS" ? parseEnergy(value) : parseNumber(value, 4);
        let metricValue = result.value;
        if (result.issue) push(column, result.issue, cell, metricValue);
        if (metricValue !== null && result.value !== null && !metricValueSchema.safeParse(metricValue).success) {
          push(column, { severity: "warning", kind: "metric_out_of_range", message: "Valeur hors de la plage enregistrable (100 milliards maximum) : ignorée." }, cell);
          metricValue = null;
        }
        if (spec.kind === "metric" && spec.metric === "OFFICE_TAX") {
          const slot = officeTax.get(year) ?? { column };
          if (spec.variant === "idf") {
            slot.idf = metricValue;
            slot.column = column;
          } else slot.plain = metricValue;
          officeTax.set(year, slot);
          break;
        }
        draft.metrics.set(metricKey(spec.metric, year), { metric: spec.metric, year, value: metricValue, column: column.header });
        break;
      }
      case "sheetModified": {
        const result = parseDate(value, now);
        draft.sheetModifiedAt = result.value ? result.value.date.toISOString().slice(0, 10) : null;
        break;
      }
      case "derived": {
        if (spec.check.type === "perSqm") {
          const result = parseNumber(value);
          if (result.value !== null && !result.issue) {
            draft.sheet.perSqm.push({ column: column.header, metric: spec.check.metric, year: spec.check.year, value: result.value });
          }
        } else if (spec.check.type === "arbitrationDate") {
          draft.sheet.arbitrationDate = parseDate(value, now).value?.date ?? null;
        }
        break;
      }
    }
  }

  // Name: « Entrepôt {code} » when empty.
  if (nameCell) {
    const name = parseText(nameCell.cell?.value ?? null, 200);
    if (name.value === null) {
      const fallback = `Entrepôt ${code}`;
      push(nameCell.column, { severity: "warning", kind: "missing_name", message: `Nom d'entrepôt vide : « ${fallback} » utilisé.` }, nameCell.cell, fallback);
      set("site", "name", fallback);
    } else {
      if (name.issue) push(nameCell.column, name.issue, nameCell.cell);
      set("site", "name", name.value);
    }
  } else {
    set("site", "name", `Entrepôt ${code}`);
  }

  // PAYS present but empty: Vigie covers metropolitan France (default FR).
  if (draft.entities.site.has("country") && draft.entities.site.get("country") === null) set("site", "country", "FR");

  // Géorisques: the « URL » column wins over « Lien ».
  if ("url" in georisques || "link" in georisques) {
    const url = georisques.url ?? null;
    const link = georisques.link ?? null;
    if (url && link && url !== link) {
      push(georisques.urlColumn ?? null, {
        severity: "warning",
        kind: "georisques_conflict",
        message: `« URL Géorisques » et « Lien Géorisques » diffèrent : l'URL est retenue (lien ignoré : ${link}).`,
      }, undefined, url);
    }
    set("icpe", "georisquesUrl", (url ?? link)?.slice(0, 1000) ?? null);
  }

  // Office tax: TAXE BUREAU IDF wins over TAXE BUREAU for the same year.
  for (const [year, slot] of officeTax) {
    const hasIdf = slot.idf !== undefined && slot.idf !== null;
    const hasPlain = slot.plain !== undefined && slot.plain !== null;
    if (hasIdf && hasPlain && slot.idf !== slot.plain) {
      push(slot.column, {
        severity: "warning",
        kind: "office_tax_conflict",
        message: `TAXE BUREAU et TAXE BUREAU IDF ${year} diffèrent (${slot.plain} / ${slot.idf}) : la valeur IDF est retenue.`,
      }, undefined, slot.idf);
    }
    const value = hasIdf ? slot.idf! : hasPlain ? slot.plain! : null;
    draft.metrics.set(metricKey("OFFICE_TAX", year), { metric: "OFFICE_TAX", year, value, column: slot.column.header });
  }

  // Department: code, name, « 95 - Val-d'Oise »; otherwise from the postal code.
  let departmentRegion: string | null = null;
  if (department) {
    const raw = department.cell?.value ?? null;
    const empty = isPlaceholder(raw);
    const resolved = empty ? null : resolveDepartment(raw instanceof Date ? null : (raw as string | number | null));
    if (resolved) {
      if (String(raw).trim().toUpperCase() !== resolved.code) {
        push(department.column, { severity: "info", kind: "department_normalized", message: `Département « ${String(raw).trim()} » normalisé en « ${resolved.code} » (${resolved.name}).` }, department.cell, resolved.code);
      }
      set("site", "departmentCode", resolved.code);
      departmentRegion = resolved.region;
    } else {
      const fromPostal = departmentFromPostalCode(postalCode);
      if (!empty) {
        push(department.column, { severity: "warning", kind: "invalid_department", message: `Département non reconnu : « ${String(raw).trim()} »${fromPostal ? ` ; déduit du code postal (${fromPostal.code})` : ""}.` }, department.cell, fromPostal?.code);
      } else if (fromPostal) {
        push(department.column, { severity: "info", kind: "department_from_postal_code", message: `Département déduit du code postal : ${fromPostal.code}.` }, department.cell, fromPostal.code);
      }
      set("site", "departmentCode", fromPostal?.code ?? null);
      departmentRegion = fromPostal?.region ?? null;
    }
  }

  // Region: current name, former name (warning) or deduced from the department.
  if (region) {
    const raw = parseText(region.cell?.value ?? null, 100);
    const resolved = resolveRegion(raw.value);
    if (resolved) {
      if (resolved.warning) push(region.column, { severity: "warning", kind: "former_region_name", message: resolved.warning }, region.cell, resolved.name);
      set("site", "region", resolved.name);
    } else if (raw.value) {
      push(region.column, { severity: "warning", kind: "invalid_region", message: `Région non reconnue : « ${raw.value} » (conservée telle quelle).` }, region.cell);
      set("site", "region", raw.value);
    } else {
      if (departmentRegion) {
        push(region.column, { severity: "info", kind: "region_from_department", message: `Région déduite du département : ${departmentRegion}.` }, region.cell, departmentRegion);
      }
      set("site", "region", departmentRegion);
    }
  }

  return { draft, issues, empty: false };
}

function isEmptyCell(cell: RawCell): boolean {
  if (cell.hyperlink) return false;
  const v = cell.value;
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
