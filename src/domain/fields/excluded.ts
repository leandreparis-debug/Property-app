/**
 * Scalar fields of the registry models that are deliberately NOT displayed as
 * a field of the site sheet, each with a one-line justification. A unit test
 * checks that every scalar field is either in the registry or here.
 */
import type { FieldEntity } from "./types";

/** An excluded field and why. */
export interface ExcludedField {
  readonly entity: FieldEntity;
  readonly key: string;
  readonly reason: string;
}

const technical = (entity: FieldEntity): ExcludedField[] => [
  { entity, key: "id", reason: "Identifiant technique, sans signification métier." },
  { entity, key: "createdAt", reason: "Horodatage technique ; l'historique des modifications est porté par le journal d'audit." },
  { entity, key: "updatedAt", reason: "Horodatage technique ; la provenance de chaque valeur est affichée à partir du journal d'audit." },
];

const child = (entity: FieldEntity): ExcludedField[] => [
  ...technical(entity),
  { entity, key: "siteId", reason: "Clé étrangère vers le site : la fiche est déjà celle du site." },
];

/** Fields not displayed, with their justification. */
export const EXCLUDED_FIELDS: readonly ExcludedField[] = [
  ...technical("Site"),
  { entity: "Site", key: "version", reason: "Jeton de concurrence optimiste (étape 9), sans intérêt pour la lecture." },
  { entity: "Site", key: "archivedAt", reason: "Archivage logique : affiché sous forme de bandeau « Site archivé », pas comme un champ." },
  { entity: "Site", key: "activityStartDatePrecision", reason: "Précision de la date d'entrée en activité : utilisée pour l'afficher, pas affichée seule." },
  ...child("Lease"),
  ...child("ServiceContract"),
  ...child("SiteTechnical"),
  ...child("SiteIcpe"),
  ...child("SiteEnergyProfile"),
];
