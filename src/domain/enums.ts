/**
 * Closed lists of values stored as `NVARCHAR` columns (SQL Server has no
 * enums). Each list provides its values, a zod schema and French labels.
 *
 * Only four lists are also enforced by database CHECK constraints (see the
 * `init_domain_model` migration): UserRole, AuditAction, AuditSource and
 * DataSource (annual_metrics.source). Keep them in sync.
 */
import { z } from "zod";

/** A closed list of values with its zod schema and French labels. */
export interface EnumDefinition<T extends string> {
  /** Allowed values, in display order. */
  readonly values: readonly [T, ...T[]];
  /** zod schema accepting exactly these values. */
  readonly schema: z.ZodEnum<{ [K in T]: K }>;
  /** French label of each value. */
  readonly labels: Readonly<Record<T, string>>;
  /** Type guard for untrusted input. */
  is(value: unknown): value is T;
  /** French label of a value. */
  label(value: T): string;
}

/**
 * Builds an {@link EnumDefinition} from French labels (key order = display order).
 * @param labels - Map of value → French label.
 */
export function defineEnum<T extends string>(labels: Record<T, string>): EnumDefinition<T> {
  const values = Object.keys(labels) as [T, ...T[]];
  const schema = z.enum(values as unknown as { [K in T]: K } & readonly [T, ...T[]]) as unknown as z.ZodEnum<{
    [K in T]: K;
  }>;
  return {
    values,
    schema,
    labels,
    is: (value: unknown): value is T => schema.safeParse(value).success,
    label: (value: T) => labels[value],
  };
}

/** Origin of a value: spreadsheet import, manual entry or public-data enrichment. */
export const DataSource = defineEnum({
  import: "Import du tableur",
  manual: "Saisie manuelle",
  enrichment: "Enrichissement",
});
export type DataSource = (typeof DataSource.values)[number];

/** Other information systems that reference a site. */
export const ExternalSystem = defineEnum({
  QLIK_SENSE: "Clé Qlik Sense",
  AL_CODE: "Code AL",
  RAMSES: "RAMSES",
});
export type ExternalSystem = (typeof ExternalSystem.values)[number];

/** Kind of building works. */
export const BuildingWorkKind = defineEnum({
  CONSTRUCTION: "Construction",
  REHABILITATION: "Réhabilitation",
  EXTENSION: "Extension",
});
export type BuildingWorkKind = (typeof BuildingWorkKind.values)[number];

/** ICPE regime of a heading. */
export const IcpeRegime = defineEnum({
  A: "Autorisation",
  E: "Enregistrement",
  D: "Déclaration",
  DC: "Déclaration avec contrôle périodique",
  NC: "Non classé",
  UNKNOWN: "Non précisé",
});
export type IcpeRegime = (typeof IcpeRegime.values)[number];

/** Category of a stored document. */
export const DocumentCategory = defineEnum({
  LEASE: "Bail",
  PLAN: "Plan",
  ADMIN: "Dossier administratif",
  ICPE: "ICPE",
  ENERGY: "Énergie",
  PHOTO: "Photo",
  CONTROL_REPORT: "Rapport de contrôle",
  AUDIT: "Audit 360°",
  N100: "N100",
  VISIT_REPORT: "Rapport de visite",
  DAMAGE_INSURANCE: "Dommage Ouvrage",
  OTHER: "Autre",
});
export type DocumentCategory = (typeof DocumentCategory.values)[number];

/* Equipment types: see src/domain/equipment/catalog.ts (step 10, no CHECK constraint). */

/** Application role (CHECK constraint `users_role_check`). */
export const UserRole = defineEnum({
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
});
export type UserRole = (typeof UserRole.values)[number];

/** Audited action (CHECK constraint `audit_logs_action_check`). */
export const AuditAction = defineEnum({
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  IMPORT: "Import",
  ENRICH: "Enrichissement",
  LOGIN: "Connexion",
  LOGIN_FAILED: "Échec de connexion",
  LOGOUT: "Déconnexion",
});
export type AuditAction = (typeof AuditAction.values)[number];

/** Origin of an audited change (CHECK constraint `audit_logs_source_check`). */
export const AuditSource = defineEnum({
  ui: "Interface",
  import: "Import",
  enrichment: "Enrichissement",
  system: "Système",
});
export type AuditSource = (typeof AuditSource.values)[number];

/** Kind of import batch. */
export const ImportBatchKind = defineEnum({
  SPREADSHEET: "Import du tableur",
  ENRICHMENT: "Enrichissement",
});
export type ImportBatchKind = (typeof ImportBatchKind.values)[number];

/** Status of an import batch. */
export const ImportBatchStatus = defineEnum({
  RUNNING: "En cours",
  SUCCEEDED: "Réussi",
  FAILED: "Échec",
  PARTIAL: "Partiel",
});
export type ImportBatchStatus = (typeof ImportBatchStatus.values)[number];

/** Precision of a business date: a date known only by its year is stored on 1 January. */
export const DatePrecision = defineEnum({
  day: "Jour",
  month: "Mois",
  year: "Année",
});
export type DatePrecision = (typeof DatePrecision.values)[number];
