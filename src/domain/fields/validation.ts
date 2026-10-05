/**
 * Validation of the edit forms, GENERATED from the field registry and shared
 * by the client (immediate feedback) and the server (which decides).
 *
 * - {@link buildSectionSchema}: zod schema of the editable fields of a
 *   section; it accepts the strings typed in the inputs and CONVERTS them
 *   (French numbers « 12 345,67 », dates with precision, booleans, lists).
 *   An empty string becomes `null`. Unknown or non-editable keys are refused.
 * - {@link crossFieldRules}: rules across fields — blocking errors and
 *   warnings (saving possible after confirmation).
 * - {@link computeChanges} / {@link detectConflicts}: pure diff and
 *   field-by-field conflict detection.
 */
import { z } from "zod";
import { parseDate, parseNumber, roundTo } from "@/server/import/parsers";
import { isInMetropolitanFrance, resolveDepartment, resolveRegion } from "../geo";
import { safeExternalUrl } from "./links";
import { fieldsOfSection } from "./registry";
import type { FieldDefinition, FieldSection } from "./types";
import { toWire, wireEquals, type DbValue, type FormValue, type WireValue } from "./wire";

const NBSP_RE = /[  ]/g;
const fmt = (n: number) => String(n).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function fail(ctx: z.RefinementCtx, message: string): never {
  ctx.addIssue({ code: "custom", message });
  return z.NEVER as never;
}

/** Numeric conversion and bounds of a field. */
function numberValue(def: FieldDefinition, raw: string, ctx: z.RefinementCtx): number | null {
  const text = raw.replace(NBSP_RE, " ").trim();
  if (text === "") return null;
  const c = def.constraints ?? {};
  const parsed = parseNumber(text);
  if (parsed.value === null) return fail(ctx, "Nombre invalide (exemple : 12 345,67).");
  let n = parsed.value;
  if (c.integer && !Number.isInteger(n)) return fail(ctx, "Nombre entier attendu.");
  if (c.scale !== undefined) n = roundTo(n, c.scale);
  if (c.min !== undefined && n < c.min) return fail(ctx, `La valeur doit être supérieure ou égale à ${fmt(c.min)}.`);
  if (c.max !== undefined && n > c.max) return fail(ctx, `La valeur doit être inférieure ou égale à ${fmt(c.max)}.`);
  return n;
}

function textValue(def: FieldDefinition, raw: string, ctx: z.RefinementCtx): string | null {
  const text = def.type === "longtext" ? raw.replace(/\r\n?/g, "\n").trim() : raw.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const max = def.constraints?.maxLength;
  if (typeof max === "number" && [...text].length > max) return fail(ctx, `${max} caractères au maximum (${[...text].length} saisis).`);
  return text;
}

/** Converter of one field: form value → typed database value. */
function fieldSchema(def: FieldDefinition): z.ZodType<DbValue> {
  switch (def.type) {
    case "dateWithPrecision":
      return z.object({ date: z.string(), precision: z.string() }).transform((v, ctx): DbValue => {
        if (v.date.trim() === "") return null;
        if (!["day", "month", "year"].includes(v.precision)) return fail(ctx, "Précision inconnue.");
        const parsed = parseDate(v.date.trim());
        if (!parsed.value) return fail(ctx, "Date invalide.");
        const d = parsed.value.date;
        const date = v.precision === "year" ? new Date(Date.UTC(d.getUTCFullYear(), 0, 1)) : v.precision === "month" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) : d;
        return { date, precision: v.precision as "day" | "month" | "year" };
      });
    case "date":
      return z.string().transform((raw, ctx): DbValue => {
        if (raw.trim() === "") return null;
        const parsed = parseDate(raw.trim());
        if (!parsed.value || parsed.value.precision !== "day") return fail(ctx, "Date invalide (jour, mois et année attendus).");
        return parsed.value.date;
      });
    case "boolean":
      return z.string().transform((raw, ctx): DbValue => {
        if (raw === "") return null;
        if (raw === "true") return true;
        if (raw === "false") return false;
        return fail(ctx, "Valeur attendue : Oui, Non ou Non renseigné.");
      });
    case "area":
    case "money":
    case "moneyPerSqm":
    case "number":
    case "integer":
    case "months":
      return z.string().transform((raw, ctx): DbValue => numberValue(def, raw, ctx));
    case "url":
      return z.string().transform((raw, ctx): DbValue => {
        const text = textValue(def, raw, ctx);
        if (text === null) return null;
        if (!safeExternalUrl(text)) return fail(ctx, "Adresse web invalide : un lien http ou https complet est attendu.");
        return text;
      });
    default:
      return z.string().transform((raw, ctx): DbValue => {
        // A department or region is typed by name: its length is checked once resolved (always short).
        const text = def.input === "department" || def.input === "region" ? raw.replace(/\s+/g, " ").trim() || null : textValue(def, raw, ctx);
        if (text === null) return null;
        if (def.input === "department") {
          const dep = resolveDepartment(text);
          return dep ? dep.code : fail(ctx, "Département inconnu (numéro ou nom attendu).");
        }
        if (def.input === "region") {
          const region = resolveRegion(text);
          return region ? region.name : fail(ctx, "Région inconnue.");
        }
        const values = def.constraints?.values;
        if (values && !values.includes(text)) return fail(ctx, "Valeur non autorisée.");
        return text;
      });
  }
}

/** Editable fields of a section, in display order. */
export function editableFields(section: FieldSection): FieldDefinition[] {
  return fieldsOfSection(section).filter((d) => d.editable);
}

/**
 * zod schema of the editable fields of a section. Every field is optional
 * (a save sends only the modified ones); any other key — unknown or not
 * editable — makes the parse fail with « Champ non modifiable ».
 * @param section - Registry section.
 * @returns A schema turning form values into typed database values.
 */
export function buildSectionSchema(section: FieldSection) {
  const shape: Record<string, z.ZodOptional<z.ZodType<DbValue>>> = {};
  for (const def of editableFields(section)) shape[def.key] = fieldSchema(def).optional();
  return z.strictObject(shape, {
    error: (issue) => (issue.code === "unrecognized_keys" ? `Champ non modifiable : ${issue.keys.join(", ")}.` : undefined),
  });
}

/**
 * Keys refused by the white list: unknown in the section or not editable.
 * @param section - Registry section.
 * @param keys - Keys received.
 */
export function refusedKeys(section: FieldSection, keys: readonly string[]): string[] {
  const allowed = new Set(editableFields(section).map((d) => d.key));
  return keys.filter((k) => !allowed.has(k));
}

/** First error message of each field of a failed parse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] === undefined ? "_form" : String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-field rules
// ─────────────────────────────────────────────────────────────────────────────

/** A cross-field finding. */
export interface CrossFieldFinding {
  /** Field the message is attached to. */
  field: string;
  message: string;
  /** Value proposed for another field (e.g. the region of the department). */
  suggestion?: { field: string; value: string };
}

/** Result of {@link crossFieldRules}. */
export interface CrossFieldResult {
  /** Blocking. */
  errors: CrossFieldFinding[];
  /** Saving possible after confirmation (« Enregistrer quand même »). */
  warnings: CrossFieldFinding[];
}

/** Bounds of the cross-field rules. */
export const CROSS_FIELD_LIMITS = {
  noticeMonthsMax: 60,
  heightWarnM: 40,
  rentPerSqmMin: 5,
  rentPerSqmMax: 300,
} as const;

const DETAILED_SURFACES = ["dryArea", "temperatureControlledArea", "packagingArea", "chargingRoomArea", "technicalRoomsArea", "socialOfficeArea", "guardHouseArea"] as const;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const time = (v: unknown): number | null => (v instanceof Date ? v.getTime() : null);

/**
 * Rules across the fields of a section, on the values AFTER the change (current
 * values merged with the modified ones).
 *
 * Errors: initial effective date after the lease end; notice outside 0–60
 * months; coordinates outside metropolitan France; latitude without longitude
 * (or the reverse). Warnings: department not in the region (the right region
 * is proposed); detailed surfaces above the total; height above 40 m; economic
 * rent per m² outside [5 €, 300 €].
 *
 * @param section - Registry section.
 * @param values - Typed values of the section (`key` → value).
 */
export function crossFieldRules(section: FieldSection, values: Readonly<Record<string, unknown>>): CrossFieldResult {
  const errors: CrossFieldFinding[] = [];
  const warnings: CrossFieldFinding[] = [];
  const L = CROSS_FIELD_LIMITS;

  if (section === "lease") {
    const start = time(values.initialEffectiveDate);
    const end = time(values.endDate);
    if (start !== null && end !== null && start > end) errors.push({ field: "initialEffectiveDate", message: "La date d'effet initiale est postérieure à la fin de bail." });
    const notice = num(values.noticePeriodMonths);
    if (notice !== null && (notice < 0 || notice > L.noticeMonthsMax)) errors.push({ field: "noticePeriodMonths", message: `Le préavis doit être compris entre 0 et ${L.noticeMonthsMax} mois.` });
  }

  if (section === "lease_financial") {
    const rent = num(values.economicRentPerSqm);
    if (rent !== null && (rent < L.rentPerSqmMin || rent > L.rentPerSqmMax)) {
      warnings.push({ field: "economicRentPerSqm", message: `Loyer au m² inhabituel (plage attendue : ${L.rentPerSqmMin} € à ${L.rentPerSqmMax} €).` });
    }
  }

  if (section === "location") {
    const lat = num(values.latitude);
    const lon = num(values.longitude);
    if ((lat === null) !== (lon === null)) {
      errors.push({ field: lat === null ? "latitude" : "longitude", message: "Renseigner la latitude et la longitude ensemble (ou aucune des deux)." });
    } else if (lat !== null && lon !== null && !isInMetropolitanFrance(lat, lon)) {
      errors.push({ field: "latitude", message: "Coordonnées hors de France métropolitaine." });
    }
    const dep = typeof values.departmentCode === "string" ? resolveDepartment(values.departmentCode) : null;
    const region = typeof values.region === "string" ? values.region : null;
    if (dep && region !== dep.region) {
      warnings.push({
        field: "region",
        message: region ? `Le département ${dep.name} (${dep.code}) n'est pas en ${region} mais en ${dep.region}.` : `Région du département ${dep.name} : ${dep.region}.`,
        suggestion: { field: "region", value: dep.region },
      });
    }
  }

  if (section === "technical_surfaces") {
    const total = num(values.surveyedTotalArea) ?? num(values.totalWarehouseArea);
    const detailed = DETAILED_SURFACES.reduce((s, k) => s + (num(values[k]) ?? 0), 0);
    if (total !== null && total > 0 && detailed > total) {
      warnings.push({ field: "dryArea", message: `La somme des surfaces détaillées (${fmt(roundTo(detailed, 2))} m²) dépasse la surface totale (${fmt(total)} m²).` });
    }
  }

  if (section === "technical_capacities") {
    const height = num(values.heightM);
    if (height !== null && height > L.heightWarnM) warnings.push({ field: "heightM", message: `Hauteur supérieure à ${L.heightWarnM} m : vérifier la valeur.` });
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Changes and conflicts
// ─────────────────────────────────────────────────────────────────────────────

/** One requested change: the value shown at opening and the value typed. */
export interface FieldChangeRequest {
  from: WireValue;
  to: FormValue;
}

/**
 * Changes of a form: only the fields whose parsed value differs from the
 * value shown at opening.
 * @param section - Registry section.
 * @param initial - Wire values shown at opening (`key` → value).
 * @param form - Current form values.
 * @param parsed - Typed values parsed from `form` (successful parse).
 */
export function computeChanges(
  section: FieldSection,
  initial: Readonly<Record<string, WireValue>>,
  form: Readonly<Record<string, FormValue>>,
  parsed: Readonly<Record<string, DbValue | undefined>>,
): Record<string, FieldChangeRequest> {
  const changes: Record<string, FieldChangeRequest> = {};
  for (const def of editableFields(section)) {
    if (!(def.key in parsed)) continue;
    const next = dbToWire(def, parsed[def.key] ?? null);
    const before = initial[def.key] ?? null;
    if (!wireEquals(next, before)) changes[def.key] = { from: before, to: form[def.key] ?? "" };
  }
  return changes;
}

/** Wire value of a typed database value. */
export function dbToWire(def: Pick<FieldDefinition, "type">, value: DbValue): WireValue {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) return toWire(def, value.date, value.precision);
  return toWire(def, value);
}

/** A field changed by someone else since the form was opened. */
export interface FieldConflict<K extends string = string> {
  field: K;
  /** Value the user wanted (form value). */
  yours: FormValue;
  /** Value shown when the form was opened. */
  base: WireValue;
  /** Current value in the database. */
  theirs: WireValue;
}

/**
 * Field-by-field conflicts: a requested field whose CURRENT value differs from
 * the value shown at opening (`from`). Fields changed by others but not
 * requested are not conflicts.
 * @param changes - Requested changes.
 * @param current - Current wire values (`key` → value).
 */
export function detectConflicts(changes: Readonly<Record<string, FieldChangeRequest>>, current: Readonly<Record<string, WireValue>>): FieldConflict[] {
  return Object.entries(changes)
    .filter(([key, change]) => !wireEquals(current[key] ?? null, change.from))
    .map(([key, change]) => ({ field: key, yours: change.to, base: change.from, theirs: current[key] ?? null }));
}
