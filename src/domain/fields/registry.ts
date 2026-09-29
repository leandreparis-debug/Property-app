/**
 * Registry of the displayable fields of a site: one entry per scalar field of
 * `Site` and of its 1-1 extensions (Lease, ServiceContract, SiteTechnical,
 * SiteIcpe, SiteEnergyProfile). The site sheet, the missing-field list and the
 * completeness score read their labels, sections, formats and source columns
 * from here, never from literals scattered in the components.
 *
 * Every scalar field of these models is either here or in `excluded.ts` with a
 * justification — a unit test reads the Prisma metadata to enforce it.
 *
 * Adding a field: model (schema.prisma) → registry entry here → completeness
 * (optional, `src/domain/compliance/completeness.ts`). See docs/data-model.md.
 */
import { DataSource } from "../enums";
import { fieldId, FIELD_SECTIONS, type FieldDefinition, type FieldEntity, type FieldId, type FieldSection, type FieldType } from "./types";

type Entry = Omit<FieldDefinition, "entity" | "section" | "order" | "financial"> & { financial?: boolean };

/** Builds the entries of one section; `order` follows the declaration order. */
function section(entity: FieldEntity, name: FieldSection, entries: readonly Entry[], financial = false): FieldDefinition[] {
  return entries.map((e, i) => ({ ...e, entity, section: name, order: (i + 1) * 10, financial: e.financial ?? financial }));
}

const t = (key: string, labelFr: string, type: FieldType, sourceColumn?: string, extra: Partial<Entry> = {}): Entry => ({
  key,
  labelFr,
  type,
  ...(sourceColumn ? { sourceColumn } : {}),
  ...extra,
});

/** Every displayable field, grouped by section. */
export const FIELD_REGISTRY: readonly FieldDefinition[] = [
  // ── Site ────────────────────────────────────────────────────────────────
  ...section("Site", "identity", [
    t("code", "Code entrepôt", "text", "ENTREPOT"),
    t("name", "Nom", "text", "NOM ENTREPOT"),
    t("legacyNumber", "Numéro historique", "text", "N°"),
    t("status", "Statut (tableur)", "text", "STATUT", { helpFr: "Statut libre saisi dans le tableur, distinct du statut de conformité." }),
    t("isActive", "En activité", "boolean", "EN ACTIVITE"),
    t("occupancyStatus", "Statut d'occupation", "text", "STATUT D'OCCUPATION"),
    t("typology", "Typologie", "text", "TYPOLOGIE"),
    t("distributionSector", "Secteur de distribution", "text", "SECTEUR DE DISTRIBUTION"),
    t("targetActivity", "Activité cible", "text", "ACTIVITE CIBLE"),
    t("activityStartDate", "Entrée en activité", "dateWithPrecision", "ENTREE EN ACTIVITE", { precisionKey: "activityStartDatePrecision" }),
    t("storesServedCount", "Magasins desservis (nombre)", "integer", "NOMBRE MAGASIN DESSERVIS"),
    t("storesServedDescription", "Magasins desservis", "longtext", "MAGASINS DESSERVIS"),
    t("adminFileReference", "Dossier administratif", "reference", "DOSSIER ADMINISTRATIF"),
  ]),
  ...section("Site", "organization", [
    t("portfolio", "Portefeuille", "text", "PORTEFEUILLE PROPERTY"),
    t("occupyingBu", "BU occupante", "text", "BU OCCUPANTE"),
    t("buBasin", "Bassin BU", "text", "BASSIN BU"),
    t("regionalDirector", "Responsable de région (DLR)", "text", "RESPONSABLE DE REGION (DLR)"),
    t("regionalTechnicalManager", "Responsable technique régional (RTR)", "text", "RESPONSABLE TECHNIQUE REGIONAL (RTR)"),
    t("propertyManager", "Property manager", "text", "PROPERTY MANAGER"),
    t("wallsOwner", "Propriétaire des murs", "text", "PROPRIETAIRE DES MURS"),
    t("sciOnAsset", "SCI sur l'actif", "text", "SCI SUR ACTIF"),
    t("operatingMode", "Mode d'exploitation", "text", "MODE D'EXPLOITATION"),
    t("logisticsOperator", "Exploitant logistique", "text", "EXPLOITANT LOGISTIQUE"),
  ]),
  ...section("Site", "location", [
    t("addressLine", "Adresse", "text", "ADRESSE"),
    t("postalCode", "Code postal", "text", "ADRESSE"),
    t("city", "Ville", "text", "ADRESSE"),
    t("departmentCode", "Département", "text", "DEPARTEMENT"),
    t("region", "Région", "text", "REGION"),
    t("country", "Pays", "text", "PAYS"),
    t("communeInseeCode", "Code INSEE de la commune", "text", undefined, { helpFr: "Issu de l'enrichissement par données publiques." }),
    t("latitude", "Latitude", "number", "LAT", { decimals: 6 }),
    t("longitude", "Longitude", "number", "LONG", { decimals: 6 }),
    t("coordinatesSource", "Origine des coordonnées", "enum", undefined, { options: DataSource.labels }),
  ]),

  // ── Lease ───────────────────────────────────────────────────────────────
  ...section("Lease", "lease", [
    t("code", "Code bail", "text", "CODE BAIL"),
    t("holdingEntity", "Entité portant le bail", "text", "ENTITE PORTANT LE BAIL"),
    t("initialEffectiveDate", "Date d'effet du bail initial", "date", "DATE D'EFFET BAIL INITIAL"),
    t("lastAmendmentDate", "Date d'effet du dernier avenant", "date", "DATE D'EFFET DERNIER AVENANT"),
    t("endDate", "Date de fin de bail", "date", "DATE DE FIN DE BAIL"),
    t("nextExitDate", "Prochaine date de sortie", "date", "PROCHAINE DATE DE SORTIE"),
    t("noticePeriodMonths", "Durée de préavis", "months", "DUREE DE PREAVIS"),
    t("noticePeriodRaw", "Durée de préavis (texte d'origine)", "text", "DUREE DE PREAVIS"),
    t("noticeDate", "Date de préavis", "date", "DATE DE PREAVIS"),
    t("renewalConditionsSigned", "Conditions de renouvellement signées", "boolean", "CONDITIONS RENOUVELLEMENT SIGNEES"),
    t("additionalDuration", "Durée supplémentaire", "text", "DUREE SUPPLEMENTAIRE"),
    t("currentTerms", "Modalités du bail en cours", "longtext", "MODALITES DU BAIL EN COURS"),
    t("negotiationProgress", "Avancement de la négociation", "longtext", "AVANCEMENT NEGOCIATION"),
    t("news", "Actualités", "longtext", "ACTUALITES"),
    t("documentReference", "Bail (référence)", "reference", "BAIL"),
  ]),
  ...section(
    "Lease",
    "lease_financial",
    [
      t("initialRentFree", "Franchise de loyer initiale", "text", "FRANCHISE DE LOYER INITIAL"),
      t("rentFreeAmount", "Montant de la franchise", "money", "MONTANT FRANCHISE"),
      t("rentFreeMonths", "Franchise (mois)", "months", "FRANCHISE MOIS"),
      t("economicRentPerSqm", "Loyer économique", "moneyPerSqm", "LOYER ECONOMIQUE / M²"),
      t("marketRentValue", "Valeur locative de marché (VLM)", "money", "VLM"),
      t("officePricePerSqm", "Prix des bureaux", "moneyPerSqm", "PRIX BUREAUX / M2"),
      t("indexation", "Indexation", "text", "INDEXATION"),
      t("rentReview", "Révision de loyer", "text", "REVISION DE LOYER"),
      t("rentComments", "Commentaires sur le loyer", "longtext", "COMMENTAIRES LOYER"),
    ],
    true,
  ),

  // ── Service contract ───────────────────────────────────────────────────
  ...section("ServiceContract", "service_contract", [
    t("effectiveDate", "Prise d'effet", "date", "PRISE D'EFFET DU CONTRAT DE PRESTATION"),
    t("hasRealEstateClause", "Clause immobilière", "boolean", "CLAUSE IMMOBILIERE => CONTRAT DE PRESTATION (Oui/Non)"),
    t("durationRaw", "Durée", "text", "DUREE DU CONTRAT DE PRESTATION"),
    t("endDate", "Date de fin", "date", "DATE DE FIN DE CONTRAT DE PRESTATION"),
    t("renewal", "Reconduction", "text", "RECONDUCTION DU CONTRAT DE PRESTATION"),
    t("notice", "Préavis", "text", "PREAVIS DU CONTRAT DE PRESTATION"),
    t("seniority", "Antériorité", "text", "ANTERIORIETE"),
    t("firstTerminationDate", "Date de première résiliation", "date", "DATE DE 1ERE RESILIATION"),
  ]),

  // ── Technical ──────────────────────────────────────────────────────────
  ...section("SiteTechnical", "technical_surfaces", [
    t("surveyedTotalArea", "Surface totale (relevé de géomètre)", "area", "ENTREPOTS TOTAL (RELEVE DE GEOMETRE)"),
    t("totalWarehouseArea", "Surface d'entrepôt totale", "area", "SURFACE ENTREPOT TOTAL"),
    t("leaseWarehouseArea", "Surface d'entrepôt au bail", "area", "ENTREPOTS (TOTAL BAIL)"),
    t("landArea", "Terrain", "area", "TERRAIN"),
    t("dryArea", "Entrepôt sec", "area", "ENTREPOT SEC"),
    t("temperatureControlledArea", "Entrepôt à température contrôlée", "area", "ENTREPOT A TEMPERATURE CONTROLE"),
    t("packagingArea", "Emballage", "area", "EMBALLAGE"),
    t("chargingRoomArea", "Locaux de charge", "area", "LOCAL DE CHARGES"),
    t("technicalRoomsArea", "Locaux techniques", "area", "LOCAUX TECHNIQUES"),
    t("socialOfficeArea", "Bureaux et locaux sociaux (BLS)", "area", "BLS"),
    t("guardHouseArea", "Poste de garde", "area", "POSTE DE GARDE"),
  ]),
  ...section("SiteTechnical", "technical_capacities", [
    t("heightM", "Hauteur", "number", "HAUTEUR (M)", { unit: "m" }),
    t("dockCount", "Quais", "integer", "NOMBRE DE QUAIS"),
    t("cellCount", "Cellules", "integer", "NOMBRE CELLULES"),
    t("carSpaces", "Places véhicules légers", "integer", "NOMBRE DE PLACE VL"),
    t("truckSpaces", "Places poids lourds", "integer", "NOMBRE DE PLACE PL"),
    t("retentionBasin", "Bassin de rétention", "text", "BASSIN DE RETENTION"),
    t("extensionCapacity", "Capacité d'extension", "text", "CAPACITE D'EXTENTION"),
  ]),
  ...section("SiteTechnical", "technical_misc", [
    t("buildingQuality", "Qualité du bâtiment", "text", "QUALITE BATIMENT"),
    t("certification", "Certification", "text", "CERTIFICATION"),
    t("evCharging", "Bornes de recharge", "text", "BORNES"),
    t("photovoltaic", "Photovoltaïque", "text", "PHOTOVOLTAIQUE"),
    t("technicalSpecifics", "Spécificités techniques", "longtext", "SPECIFICITES TECHNIQUES"),
    t("plansReference", "Plans (référence)", "reference", "PLANS"),
  ]),

  // ── ICPE ───────────────────────────────────────────────────────────────
  ...section("SiteIcpe", "icpe", [
    t("holder", "Détenteur ICPE", "text", "PORTEUR DE L'ICPE"),
    t("headingsRaw", "Rubriques (texte d'origine)", "longtext", "PRINCIPALES RUBRIQUES ICPE"),
    t("georisquesUrl", "Fiche Géorisques", "url", "Lien Géorisques"),
    t("documentsReference", "Documents administratifs ICPE", "reference", "DOCUMENTS ADMINISTRATIFS ICPE"),
  ]),

  // ── Energy ─────────────────────────────────────────────────────────────
  ...section("SiteEnergyProfile", "energy", [
    t("referenceYear", "Année de référence", "integer", "ANNEE DE REFERENCE"),
    t("referenceElectricityKwh", "Électricité de l'année de référence", "number", "ANNEE DE REFERENCE CONSO ELEC EN KWH", { unit: "kWh" }),
    t("referenceGasKwh", "Gaz de l'année de référence", "number", "ANNEE DE REFERENCE CONSO GAZ EN KWH", { unit: "kWh" }),
    t("operatCertificates", "Certificats OPERAT", "reference", "CERTIFICATS OPERAT"),
    t("technicalManagementRebilled", "Gestion technique refacturée", "boolean", "Refacturation Gestion Technique Oui/Non"),
    t("technicalManagementRebillDetail", "Détail de la refacturation", "longtext", "Détail si refacturation gestion technique"),
  ]),
];

const BY_ID: ReadonlyMap<string, FieldDefinition> = new Map(FIELD_REGISTRY.map((d) => [fieldId(d), d]));

/**
 * Definition of a field.
 * @param id - `Entity.key`.
 * @throws {Error} On an unknown id (programming error).
 */
export function getField(id: FieldId): FieldDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Champ inconnu du registre : ${id}`);
  return def;
}

/** Whether an id is in the registry. */
export function hasField(id: string): id is FieldId {
  return BY_ID.has(id);
}

/**
 * Fields of a section, in display order.
 * @param name - Section.
 */
export function fieldsOfSection(name: FieldSection): FieldDefinition[] {
  return FIELD_REGISTRY.filter((d) => d.section === name).sort((a, b) => a.order - b.order);
}

/** French title of a section. */
export function sectionTitle(name: FieldSection): string {
  return FIELD_SECTIONS[name];
}
