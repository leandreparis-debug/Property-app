/**
 * Cell parsers of the spreadsheet import. Pure functions: they never throw
 * and always return `{ value, issue? }`, so a dirty cell can never break an
 * import — at worst the value is `null` with a warning in the report.
 */
import type { DatePrecision } from "@/domain/enums";
import { toDateOnly } from "@/domain/dates";

/** Severity of an anomaly (report column « sévérité »). */
export type Severity = "error" | "warning" | "info";

/** Anomaly raised while parsing a value. */
export interface ParseIssue {
  severity: Severity;
  /** Stable type key, used for the « warnings by type » statistics. */
  kind: string;
  /** French message. */
  message: string;
}

/** Result of every parser. */
export interface ParseResult<T> {
  value: T | null;
  issue?: ParseIssue;
}

/** A raw cell value as read from the workbook (formulas already resolved). */
export type CellValue = string | number | boolean | Date | null | undefined;

const ok = <T>(value: T | null): ParseResult<T> => ({ value });
const warn = <T>(kind: string, message: string, value: T | null = null): ParseResult<T> => ({
  value,
  issue: { severity: "warning", kind, message },
});
const info = <T>(kind: string, message: string, value: T | null = null): ParseResult<T> => ({
  value,
  issue: { severity: "info", kind, message },
});

// ─────────────────────────────────────────────────────────────────────────────
// Placeholders
// ─────────────────────────────────────────────────────────────────────────────

/** Texts meaning « no value » (compared case- and accent-insensitively). */
export const DEFAULT_PLACEHOLDERS: readonly string[] = [
  "",
  "-",
  "–",
  "—",
  "/",
  "nc",
  "n/c",
  "na",
  "n/a",
  "?",
  "neant",
  "nd",
  "n/d",
  "x",
  "a venir",
  "en cours",
];

let placeholders = new Set(DEFAULT_PLACEHOLDERS.map(placeholderKey));

function placeholderKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Replaces the placeholder list (configurable).
 * @param list - Texts meaning « no value »; `undefined` restores the default.
 */
export function configurePlaceholders(list?: readonly string[]): void {
  placeholders = new Set((list ?? DEFAULT_PLACEHOLDERS).map(placeholderKey));
}

/**
 * Whether a cell is a placeholder (« NC », « - », « à venir »…) or empty.
 * @param value - Raw cell.
 */
export function isPlaceholder(value: CellValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return placeholders.has(placeholderKey(value));
}

/**
 * Returns the `info` result for a placeholder, or `undefined` if the cell
 * carries a real value. Empty cells produce no issue at all.
 */
function placeholderResult<T>(value: CellValue): ParseResult<T> | undefined {
  if (value === null || value === undefined) return ok<T>(null);
  if (typeof value === "string" && value.trim() === "") return ok<T>(null);
  if (isPlaceholder(value)) return info<T>("placeholder", `Valeur « ${String(value).trim()} » considérée comme vide.`);
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Text: trimmed, runs of spaces reduced (line breaks kept), placeholders → null,
 * truncated to the column length with a warning.
 * @param value - Raw cell.
 * @param maxLength - Column length in base (`undefined` = NVARCHAR(MAX)).
 */
export function parseText(value: CellValue, maxLength?: number): ParseResult<string> {
  const empty = placeholderResult<string>(value);
  if (empty) return empty;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const text = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t  ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text === "") return ok<string>(null);
  if (maxLength !== undefined && [...text].length > maxLength) {
    return warn("text_truncated", `Texte tronqué à ${maxLength} caractères.`, [...text].slice(0, maxLength).join(""));
  }
  return ok(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers
// ─────────────────────────────────────────────────────────────────────────────

const UNIT_PATTERN = /(€|eur(os?)?|m²|m2|m³|m3|kwh|mwh|ht|ttc|ml|mois|etp|colis|%)/gi;

/**
 * Number in French or English format: « 12 345,67 », « 12345.67 »,
 * « 12 345 € », « 12 345 m² », « 1 234 kWh », « -3,5 », « (1 200) »;
 * regular, no-break and narrow no-break spaces; a numeric cell as is.
 * Non-numeric text → `null` with a warning.
 *
 * @param value - Raw cell.
 * @param scale - Decimals kept (rounding to the column scale), if given.
 */
export function parseNumber(value: CellValue, scale?: number): ParseResult<number> {
  const empty = placeholderResult<number>(value);
  if (empty) return empty;
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "boolean" || value instanceof Date) {
    return warn("not_a_number", `Valeur non numérique : « ${String(value)} ».`);
  } else {
    n = parseNumericText(String(value));
  }
  if (!Number.isFinite(n)) return warn("not_a_number", `Valeur non numérique : « ${String(value).trim()} ».`);
  return ok(scale === undefined ? n : roundTo(n, scale));
}

function parseNumericText(input: string): number {
  let text = input.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(UNIT_PATTERN, "").replace(/[\s  ']/g, "");
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return Number.NaN;

  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;
  if (commas > 0 && dots > 0) {
    // The last separator is the decimal one: « 1.234,5 » or « 1,234.5 ».
    const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (commas > 1) {
    text = text.replace(/,/g, "");
  } else if (dots > 1) {
    text = text.replace(/\./g, "");
  } else {
    text = text.replace(",", ".");
  }
  const n = Number(text);
  return negative ? -n : n;
}

/** Rounds to `scale` decimals (half away from zero). */
export function roundTo(n: number, scale: number): number {
  // Decimal shift through the exponent notation avoids binary artefacts
  // (1.005 × 100 = 100.49999… in floating point).
  if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return n;
  const shifted = Math.round(Number(`${Math.abs(n)}e${scale}`));
  return Math.sign(n) * Number(`${shifted}e-${scale}`) || 0;
}

function bounded(
  result: ParseResult<number>,
  min: number,
  max: number,
  label: string,
  unit: string,
): ParseResult<number> {
  if (result.value === null || result.issue) return result;
  if (result.value < min || result.value > max) {
    return warn(
      "out_of_bounds",
      `${label} hors des bornes plausibles (${min} à ${max.toLocaleString("fr-FR")} ${unit}) : valeur conservée.`,
      result.value,
    );
  }
  return result;
}

/** Amount in euros (≥ 0 expected; kept with a warning otherwise). Scale 2. */
export function parseMoney(value: CellValue): ParseResult<number> {
  return bounded(parseNumber(value, 2), 0, Number.MAX_SAFE_INTEGER, "Montant", "€");
}

/** Area in m² (0 to 500 000 plausible). Scale 2. */
export function parseArea(value: CellValue): ParseResult<number> {
  return bounded(parseNumber(value, 2), 0, 500_000, "Surface", "m²");
}

/** Height in metres (0 to 60 plausible). Scale 2. */
export function parseHeight(value: CellValue): ParseResult<number> {
  return bounded(parseNumber(value, 2), 0, 60, "Hauteur", "m");
}

/**
 * Energy in kWh (≥ 0). A value written « … MWh » is converted to kWh (info).
 * Scale 4.
 */
export function parseEnergy(value: CellValue): ParseResult<number> {
  if (typeof value === "string" && /mwh/i.test(value)) {
    const mwh = parseNumber(value, 4);
    if (mwh.value !== null && !mwh.issue) {
      return info("unit_converted", "Valeur en MWh convertie en kWh.", roundTo(mwh.value * 1000, 4));
    }
  }
  return bounded(parseNumber(value, 4), 0, Number.MAX_SAFE_INTEGER, "Consommation", "kWh");
}

/** Whole number (counts: parking spaces, docks…). Decimals → rounded with a warning. */
export function parseInteger(value: CellValue): ParseResult<number> {
  const result = parseNumber(value);
  if (result.value === null || result.issue) return result;
  if (!Number.isInteger(result.value)) {
    return warn("not_an_integer", `Nombre entier attendu : ${result.value} arrondi.`, Math.round(result.value));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Booleans
// ─────────────────────────────────────────────────────────────────────────────

const TRUE_WORDS = new Set(["oui", "o", "yes", "y", "x", "vrai", "true", "1"]);
const FALSE_WORDS = new Set(["non", "n", "no", "faux", "false", "0"]);

/**
 * Oui/Non, O/N, Yes/No, X, Vrai/Faux, 1/0 (case-insensitive). « X » means
 * « yes » here (a ticked box), unlike the generic placeholder list.
 * Anything else → `null` with a warning.
 */
export function parseBoolean(value: CellValue): ParseResult<boolean> {
  if (typeof value === "boolean") return ok(value);
  if (typeof value === "number") {
    if (value === 1) return ok(true);
    if (value === 0) return ok(false);
    return warn("not_a_boolean", `Oui/Non attendu : « ${value} ».`);
  }
  if (typeof value === "string") {
    const key = placeholderKey(value);
    if (TRUE_WORDS.has(key)) return ok(true);
    if (FALSE_WORDS.has(key)) return ok(false);
  }
  const empty = placeholderResult<boolean>(value);
  if (empty) return empty;
  return warn("not_a_boolean", `Oui/Non attendu : « ${String(value).trim()} ».`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────

/** A business date with its precision. */
export interface DateWithPrecision {
  /** 00:00 UTC of the day (1st of the month / 1 January for month / year precision). */
  date: Date;
  precision: DatePrecision;
}

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2, feb: 2,
  mars: 3, mar: 3,
  avril: 4, avr: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6,
  juillet: 7, juil: 7, jul: 7,
  aout: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};

/** Excel serial (1900 date system) → business date. */
function fromExcelSerial(serial: number): Date | null {
  return toDateOnly(new Date(Math.round((Math.floor(serial) - 25569) * 86_400_000)));
}

function utcDate(year: number, month: number, day: number): Date | null {
  return toDateOnly(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

function expandYear(yy: number, now: Date): number {
  const pivot = (now.getUTCFullYear() % 100) + 10;
  return yy <= pivot ? 2000 + yy : 1900 + yy;
}

function parseDateText(text: string, now: Date): DateWithPrecision | null {
  const t = text.trim();
  let m: RegExpExecArray | null;

  // aaaa-mm-jj (optionally with a time part)
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) {
    const date = utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, precision: "day" } : null;
  }
  // jj/mm/aaaa, jj.mm.aaaa, jj-mm-aaaa, jj/mm/aa
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    const year = m[3]!.length === 2 ? expandYear(Number(m[3]), now) : Number(m[3]);
    const date = utcDate(year, Number(m[2]), Number(m[1]));
    return date ? { date, precision: "day" } : null;
  }
  // mm/aaaa
  if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(t))) {
    const date = utcDate(Number(m[2]), Number(m[1]), 1);
    return date ? { date, precision: "month" } : null;
  }
  // aaaa
  if ((m = /^(\d{4})$/.exec(t))) {
    const year = Number(m[1]);
    if (year < 1800 || year > 2200) return null;
    const date = utcDate(year, 1, 1);
    return date ? { date, precision: "year" } : null;
  }
  // [jj] mois aaaa — « 12 mars 2021 », « mars 2021 », « janv. 2020 », « 1er juin 2019 »
  const key = placeholderKey(t).replace(/\./g, " ").replace(/\s+/g, " ");
  if ((m = /^(?:(\d{1,2})(?:er)? )?([a-z]+) (\d{4})$/.exec(key))) {
    const month = MONTHS[m[2]!];
    if (!month) return null;
    const date = utcDate(Number(m[3]), month, m[1] ? Number(m[1]) : 1);
    return date ? { date, precision: m[1] ? "day" : "month" } : null;
  }
  return null;
}

/**
 * Date in any usual format: Excel date cell (no time-zone shift), Excel serial
 * number, « jj/mm/aaaa », « jj/mm/aa », « jj.mm.aaaa », « aaaa-mm-jj »,
 * « mm/aaaa » (month precision), « aaaa » (year precision), month names
 * (« mars 2021 », « janv. 2020 »).
 *
 * @param value - Raw cell.
 * @param now - Reference date for two-digit years (injectable for tests).
 */
export function parseDate(value: CellValue, now: Date = new Date()): ParseResult<DateWithPrecision> {
  const empty = placeholderResult<DateWithPrecision>(value);
  if (empty) return empty;

  if (value instanceof Date) {
    // Excel date cells are read as UTC instants: keep their UTC calendar day.
    if (Number.isNaN(value.getTime())) return warn("invalid_date", "Date illisible.");
    const date = utcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return date ? ok({ date, precision: "day" }) : warn("invalid_date", "Date illisible.");
  }
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1800 && value <= 2200) {
      const date = utcDate(value, 1, 1);
      return date ? ok({ date, precision: "year" }) : warn("invalid_date", `Date illisible : « ${value} ».`);
    }
    if (value > 2200 && value < 2_958_466) {
      const date = fromExcelSerial(value);
      return date ? ok({ date, precision: "day" }) : warn("invalid_date", `Date illisible : « ${value} ».`);
    }
    return warn("invalid_date", `Date illisible : « ${value} ».`);
  }
  if (typeof value === "boolean") return warn("invalid_date", `Date illisible : « ${String(value)} ».`);

  const parsed = parseDateText(String(value), now);
  if (parsed) return ok(parsed);
  return warn("invalid_date", `Date illisible : « ${String(value).trim()} ».`);
}

/**
 * Several dates in one cell (« 2004 ; 2016 », « 12/03/2010 et 2018 »).
 * Unreadable parts are reported, readable ones kept. Duplicates removed.
 * @param value - Raw cell.
 * @param now - Reference date for two-digit years.
 */
export function parseDates(value: CellValue, now: Date = new Date()): { value: DateWithPrecision[]; issues: ParseIssue[] } {
  const empty = placeholderResult<DateWithPrecision>(value);
  if (empty) return { value: [], issues: empty.issue ? [empty.issue] : [] };
  if (typeof value !== "string") {
    const single = parseDate(value, now);
    return { value: single.value ? [single.value] : [], issues: single.issue ? [single.issue] : [] };
  }
  const parts = value
    .split(/\s*(?:;|,|\n|\+|\bet\b|&|\s-\s|\s–\s)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const dates: DateWithPrecision[] = [];
  const issues: ParseIssue[] = [];
  for (const part of parts) {
    const result = parseDate(part, now);
    if (result.issue) issues.push(result.issue);
    if (result.value && !dates.some((d) => d.date.getTime() === result.value!.date.getTime())) dates.push(result.value);
  }
  return { value: dates, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Durations
// ─────────────────────────────────────────────────────────────────────────────

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  dixhuit: 18, vingtquatre: 24, trente: 30, trentesix: 36,
};

/**
 * Duration in months: « 6 mois », « 6 », « 1 an », « 2 ans », « 18 mois »,
 * « 3 ans ferme », « six mois ». Otherwise `null` with a warning (the caller
 * keeps the original text).
 */
export function parseDurationMonths(value: CellValue): ParseResult<number> {
  const empty = placeholderResult<number>(value);
  if (empty) return empty;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? ok(Math.round(value)) : warn("invalid_duration", `Durée illisible : « ${value} ».`);
  }
  const key = placeholderKey(String(value)).replace(/-/g, "");
  const m = /^(\d+(?:[.,]\d+)?|[a-z]+)\s*(mois|m|ans?|annees?|a)?\b(.*)$/.exec(key);
  if (m) {
    const amount = /^\d/.test(m[1]!) ? Number(m[1]!.replace(",", ".")) : NUMBER_WORDS[m[1]!];
    const unit = m[2] ?? "mois";
    const rest = m[3]!.trim();
    const harmless = rest === "" || /^(ferme|fermes|minimum|min|environ|de preavis|preavis)$/.test(rest);
    if (amount !== undefined && Number.isFinite(amount) && harmless) {
      const months = /^(an|ans|annee|annees|a)$/.test(unit) ? amount * 12 : amount;
      if (Number.isInteger(months)) return ok(months);
    }
  }
  return warn("invalid_duration", `Durée non convertible en mois : « ${String(value).trim()} » (texte d'origine conservé).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ICPE headings, external ids, references
// ─────────────────────────────────────────────────────────────────────────────

/** A parsed ICPE heading. */
export interface IcpeHeadingValue {
  code: string;
  regime: "A" | "E" | "D" | "DC" | "NC" | "UNKNOWN";
}

/**
 * ICPE headings: « 1510-E, 2925-D ; 4331 (A) » → [{1510,E},{2925,D},{4331,A}].
 * A missing or unknown regime becomes `UNKNOWN`. Duplicated codes are merged.
 * The caller always keeps the original text in `headingsRaw`.
 */
export function parseIcpeHeadings(value: CellValue): { value: IcpeHeadingValue[]; issues: ParseIssue[] } {
  if (placeholderResult(value)) return { value: [], issues: [] };
  const text = String(value);
  const matches = [...text.matchAll(/(?<![\d.])(\d{4})(?![\d])/g)];
  const headings: IcpeHeadingValue[] = [];
  for (const [i, match] of matches.entries()) {
    const start = match.index! + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    const segment = text.slice(start, end).toUpperCase();
    const regime = /(?:^|[^A-Z])(DC|NC|A|E|D)(?![A-Z])/.exec(segment)?.[1] as IcpeHeadingValue["regime"] | undefined;
    const code = match[1]!;
    const existing = headings.find((h) => h.code === code);
    if (existing) {
      if (existing.regime === "UNKNOWN" && regime) existing.regime = regime;
      continue;
    }
    headings.push({ code, regime: regime ?? "UNKNOWN" });
  }
  const issues: ParseIssue[] = [];
  if (headings.length === 0) {
    issues.push({ severity: "warning", kind: "icpe_unparsed", message: "Aucune rubrique ICPE (code à 4 chiffres) reconnue : texte d'origine conservé." });
  } else if (headings.some((h) => h.regime === "UNKNOWN")) {
    issues.push({ severity: "info", kind: "icpe_regime_unknown", message: "Régime ICPE non précisé pour au moins une rubrique (UNKNOWN)." });
  }
  return { value: headings, issues };
}

/**
 * External identifiers: split on « ; , / | » and line breaks, trimmed,
 * duplicates removed.
 * @param value - Raw cell.
 * @param normalize - Upper-case and remove spaces (RAMSES and AL codes).
 */
export function parseExternalIds(value: CellValue, normalize = false): ParseResult<string[]> {
  if (placeholderResult(value)) return ok([]);
  const parts = String(value)
    .split(/[;,/|\n\r]+/)
    .map((p) => (normalize ? p.replace(/\s+/g, "").toUpperCase() : p.trim()))
    .filter((p) => p !== "" && !isPlaceholder(p));
  return ok([...new Set(parts)]);
}

/** Kind of a document reference cell (BAIL, PLANS, DOSSIER ADMINISTRATIF…). */
export type ReferenceKind = "url" | "unc_path" | "local_path" | "yes_no" | "empty" | "other";

/**
 * Classifies a reference cell. The stored value is the hyperlink target when
 * the cell has one, otherwise the text.
 * @param text - Displayed text.
 * @param hyperlink - Hyperlink target, if any.
 */
export function classifyReference(
  text: CellValue,
  hyperlink?: string | null,
): { kind: ReferenceKind; value: string | null } {
  const target = hyperlink?.trim() || (isPlaceholder(text) ? null : String(text ?? "").trim() || null);
  if (target === null) return { kind: "empty", value: null };
  if (/^(https?|ftp):\/\//i.test(target) || /^mailto:/i.test(target)) return { kind: "url", value: target };
  if (/^\\\\[^\\]+\\/.test(target)) return { kind: "unc_path", value: target };
  if (/^[a-z]:[\\/]/i.test(target) || /^file:/i.test(target) || /^\.{0,2}\//.test(target)) {
    return { kind: "local_path", value: target };
  }
  const yesNo = parseBoolean(target);
  if (yesNo.value !== null && !yesNo.issue) return { kind: "yes_no", value: target };
  return { kind: "other", value: target };
}
