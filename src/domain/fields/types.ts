/**
 * Vocabulary of the field registry: which entity a field belongs to, in
 * which section of the site sheet it is shown, and how its value is rendered.
 */

/** Models whose scalar fields are displayed on the site sheet (Site and its 1-1 extensions). */
export const FIELD_ENTITIES = ["Site", "Lease", "ServiceContract", "SiteTechnical", "SiteIcpe", "SiteEnergyProfile"] as const;

/** A model covered by the registry. */
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

/** Sections of the site sheet, in display order, with their French title. */
export const FIELD_SECTIONS = {
  identity: "Identité",
  organization: "Organisation et exploitation",
  location: "Localisation",
  lease: "Bail",
  lease_financial: "Conditions financières du bail",
  service_contract: "Contrat de prestation",
  technical_surfaces: "Surfaces",
  technical_capacities: "Capacités",
  technical_misc: "Caractéristiques techniques",
  icpe: "ICPE",
  energy: "Énergie",
} as const;

/** A section of the site sheet. */
export type FieldSection = keyof typeof FIELD_SECTIONS;

/**
 * How a value is rendered:
 * - `text` / `longtext`: string (longtext keeps line breaks);
 * - `date`: business date; `dateWithPrecision`: date shown as year, month or day;
 * - `area`: m²; `money`: €; `moneyPerSqm`: €/m²;
 * - `number`: decimal with optional unit (kWh switches to MWh); `integer`;
 * - `boolean`: Oui / Non; `months`: « 36 mois »;
 * - `url`: external link (http/https only); `reference`: free reference
 *   (link, network path, yes/no or text, detected on display);
 * - `enum`: closed list with French labels (`options`).
 */
export type FieldType =
  | "text"
  | "longtext"
  | "date"
  | "dateWithPrecision"
  | "area"
  | "money"
  | "moneyPerSqm"
  | "number"
  | "integer"
  | "boolean"
  | "url"
  | "reference"
  | "enum"
  | "months";

/** Particular input of an editable field (defaults follow the type). */
export type FieldInput = "department" | "region" | "select" | "coordinates";

/** Validation constraints of an editable field (checked on the client AND the server). */
export interface FieldConstraints {
  /** Smallest accepted number. */
  readonly min?: number;
  /** Largest accepted number. */
  readonly max?: number;
  /** Decimals kept (rounded to the column scale). */
  readonly scale?: number;
  /** Whole numbers only. */
  readonly integer?: boolean;
  /** Maximum length in characters (from the Prisma column: `null` = MAX). */
  readonly maxLength?: number | null;
  /** Allowed values (enumerations, selects). */
  readonly values?: readonly string[];
}

/** Definition of one displayable field. */
export interface FieldDefinition {
  /** Prisma model. */
  readonly entity: FieldEntity;
  /** Prisma field name (camelCase). */
  readonly key: string;
  /** French label. */
  readonly labelFr: string;
  /** Short help shown under the label (optional). */
  readonly helpFr?: string;
  readonly section: FieldSection;
  readonly type: FieldType;
  /** Unit appended to `number` values (e.g. « m », « kWh »). */
  readonly unit?: string;
  /** For `number`: fixed number of decimals (default: up to 2). */
  readonly decimals?: number;
  /** Display order within the section (ascending). */
  readonly order: number;
  /** Financial data: hidden without the `finance:read` permission. */
  readonly financial: boolean;
  /**
   * Editable from the site sheet (white list: a field that is not editable is
   * REFUSED by the server). False for the import key `Site.code`, fields set
   * by the system and original spreadsheet texts kept for traceability.
   */
  readonly editable: boolean;
  /** Validation constraints (bounds, scale, length, values). */
  readonly constraints?: FieldConstraints;
  /** Particular input (department list, region list, select, coordinates). */
  readonly input?: FieldInput;
  /** Column of the source spreadsheet (docs/source-mapping.md). */
  readonly sourceColumn?: string;
  /** For `dateWithPrecision`: the field holding the precision (day | month | year). */
  readonly precisionKey?: string;
  /** For `enum`: French label of each stored value. */
  readonly options?: Readonly<Record<string, string>>;
}

/** Stable identifier of a registry field: `Entity.key` (e.g. « Lease.endDate »). */
export type FieldId = `${FieldEntity}.${string}`;

/** Identifier of a field definition. */
export function fieldId(def: Pick<FieldDefinition, "entity" | "key">): FieldId {
  return `${def.entity}.${def.key}`;
}
