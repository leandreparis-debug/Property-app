/**
 * Completeness score of a site: weighted share of ~20 key fields that are
 * filled (identity, lease, surfaces, ICPE). The list is declared here and
 * documented in docs/compliance-rules.md.
 */
import { referenceArea, toNumber } from "../derived";
import type { ComplianceSite } from "./types";

const filled = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
const positive = (v: Parameters<typeof toNumber>[0]) => (toNumber(v) ?? 0) > 0;

/** A key field of the completeness score. */
export interface CompletenessField {
  id: string;
  labelFr: string;
  group: "identité" | "bail" | "surfaces" | "ICPE";
  weight: number;
  isFilled(site: ComplianceSite): boolean;
}

/** Weighted key fields (total weight: 30). */
export const COMPLETENESS_FIELDS: readonly CompletenessField[] = [
  // Identity (11)
  { id: "name", labelFr: "Nom", group: "identité", weight: 1, isFilled: (s) => filled(s.name) && s.name !== s.code },
  { id: "addressLine", labelFr: "Adresse", group: "identité", weight: 2, isFilled: (s) => filled(s.addressLine) },
  { id: "postalCode", labelFr: "Code postal", group: "identité", weight: 1, isFilled: (s) => filled(s.postalCode) },
  { id: "city", labelFr: "Ville", group: "identité", weight: 1, isFilled: (s) => filled(s.city) },
  { id: "departmentCode", labelFr: "Département", group: "identité", weight: 1, isFilled: (s) => filled(s.departmentCode) },
  { id: "region", labelFr: "Région", group: "identité", weight: 1, isFilled: (s) => filled(s.region) },
  { id: "coordinates", labelFr: "Coordonnées", group: "identité", weight: 2, isFilled: (s) => s.hasCoordinates },
  { id: "portfolio", labelFr: "Portefeuille", group: "identité", weight: 1, isFilled: (s) => filled(s.portfolio) },
  { id: "typology", labelFr: "Typologie", group: "identité", weight: 1, isFilled: (s) => filled(s.typology) },
  // Lease (9)
  { id: "leaseCode", labelFr: "Code bail", group: "bail", weight: 1, isFilled: (s) => filled(s.lease?.code) },
  { id: "holdingEntity", labelFr: "Entité porteuse du bail", group: "bail", weight: 1, isFilled: (s) => filled(s.lease?.holdingEntity) },
  { id: "endDate", labelFr: "Date de fin de bail", group: "bail", weight: 2, isFilled: (s) => filled(s.lease?.endDate) },
  { id: "nextExitDate", labelFr: "Prochaine sortie", group: "bail", weight: 2, isFilled: (s) => filled(s.lease?.nextExitDate) },
  { id: "notice", labelFr: "Date ou durée de préavis", group: "bail", weight: 2, isFilled: (s) => filled(s.lease?.noticeDate) || filled(s.lease?.noticePeriodMonths) },
  { id: "renewalConditionsSigned", labelFr: "Conditions de renouvellement", group: "bail", weight: 1, isFilled: (s) => filled(s.lease?.renewalConditionsSigned) },
  // Surfaces (6)
  { id: "referenceArea", labelFr: "Surface de référence", group: "surfaces", weight: 3, isFilled: (s) => referenceArea(s.technical) !== null },
  { id: "landArea", labelFr: "Surface du terrain", group: "surfaces", weight: 1, isFilled: (s) => positive(s.technical?.landArea) },
  { id: "socialOfficeArea", labelFr: "Surface bureaux et locaux sociaux", group: "surfaces", weight: 1, isFilled: (s) => positive(s.technical?.socialOfficeArea) },
  { id: "dockCount", labelFr: "Nombre de quais", group: "surfaces", weight: 1, isFilled: (s) => filled(s.technical?.dockCount) },
  // ICPE (4)
  { id: "icpeHolder", labelFr: "Détenteur ICPE", group: "ICPE", weight: 2, isFilled: (s) => filled(s.icpe?.holder) },
  { id: "icpeHeadings", labelFr: "Rubriques ICPE", group: "ICPE", weight: 2, isFilled: (s) => (s.icpe?.headingsCount ?? 0) > 0 },
];

/**
 * Completeness score.
 * @param site - Facts of the site.
 * @returns An integer between 0 and 100.
 */
export function completenessScore(site: ComplianceSite): number {
  let total = 0;
  let got = 0;
  for (const field of COMPLETENESS_FIELDS) {
    total += field.weight;
    if (field.isFilled(site)) got += field.weight;
  }
  return total === 0 ? 0 : Math.round((got / total) * 100);
}

/** Labels of the missing key fields (most weighted first). */
export function missingFields(site: ComplianceSite): string[] {
  return COMPLETENESS_FIELDS.filter((f) => !f.isFilled(site))
    .sort((a, b) => b.weight - a.weight)
    .map((f) => f.labelFr);
}
