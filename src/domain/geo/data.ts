/**
 * Offline geographic reference of metropolitan France: the 13 regions and the
 * 96 departments (including 2A and 2B), as of the 2016 regional reform.
 * Static data, no network access.
 */

/** The 13 metropolitan regions (official names). */
export const REGIONS = [
  "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté",
  "Bretagne",
  "Centre-Val de Loire",
  "Corse",
  "Grand Est",
  "Hauts-de-France",
  "Île-de-France",
  "Normandie",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur",
] as const;

/** Official name of a metropolitan region. */
export type RegionName = (typeof REGIONS)[number];

/** A metropolitan department. */
export interface Department {
  /** INSEE code: "01"…"95", "2A", "2B". */
  code: string;
  name: string;
  region: RegionName;
}

const ARA = "Auvergne-Rhône-Alpes";
const BFC = "Bourgogne-Franche-Comté";
const BRE = "Bretagne";
const CVL = "Centre-Val de Loire";
const COR = "Corse";
const GES = "Grand Est";
const HDF = "Hauts-de-France";
const IDF = "Île-de-France";
const NOR = "Normandie";
const NAQ = "Nouvelle-Aquitaine";
const OCC = "Occitanie";
const PDL = "Pays de la Loire";
const PAC = "Provence-Alpes-Côte d'Azur";

/** The 96 metropolitan departments, ordered by code. */
export const DEPARTMENTS: readonly Department[] = (
  [
    ["01", "Ain", ARA],
    ["02", "Aisne", HDF],
    ["03", "Allier", ARA],
    ["04", "Alpes-de-Haute-Provence", PAC],
    ["05", "Hautes-Alpes", PAC],
    ["06", "Alpes-Maritimes", PAC],
    ["07", "Ardèche", ARA],
    ["08", "Ardennes", GES],
    ["09", "Ariège", OCC],
    ["10", "Aube", GES],
    ["11", "Aude", OCC],
    ["12", "Aveyron", OCC],
    ["13", "Bouches-du-Rhône", PAC],
    ["14", "Calvados", NOR],
    ["15", "Cantal", ARA],
    ["16", "Charente", NAQ],
    ["17", "Charente-Maritime", NAQ],
    ["18", "Cher", CVL],
    ["19", "Corrèze", NAQ],
    ["2A", "Corse-du-Sud", COR],
    ["2B", "Haute-Corse", COR],
    ["21", "Côte-d'Or", BFC],
    ["22", "Côtes-d'Armor", BRE],
    ["23", "Creuse", NAQ],
    ["24", "Dordogne", NAQ],
    ["25", "Doubs", BFC],
    ["26", "Drôme", ARA],
    ["27", "Eure", NOR],
    ["28", "Eure-et-Loir", CVL],
    ["29", "Finistère", BRE],
    ["30", "Gard", OCC],
    ["31", "Haute-Garonne", OCC],
    ["32", "Gers", OCC],
    ["33", "Gironde", NAQ],
    ["34", "Hérault", OCC],
    ["35", "Ille-et-Vilaine", BRE],
    ["36", "Indre", CVL],
    ["37", "Indre-et-Loire", CVL],
    ["38", "Isère", ARA],
    ["39", "Jura", BFC],
    ["40", "Landes", NAQ],
    ["41", "Loir-et-Cher", CVL],
    ["42", "Loire", ARA],
    ["43", "Haute-Loire", ARA],
    ["44", "Loire-Atlantique", PDL],
    ["45", "Loiret", CVL],
    ["46", "Lot", OCC],
    ["47", "Lot-et-Garonne", NAQ],
    ["48", "Lozère", OCC],
    ["49", "Maine-et-Loire", PDL],
    ["50", "Manche", NOR],
    ["51", "Marne", GES],
    ["52", "Haute-Marne", GES],
    ["53", "Mayenne", PDL],
    ["54", "Meurthe-et-Moselle", GES],
    ["55", "Meuse", GES],
    ["56", "Morbihan", BRE],
    ["57", "Moselle", GES],
    ["58", "Nièvre", BFC],
    ["59", "Nord", HDF],
    ["60", "Oise", HDF],
    ["61", "Orne", NOR],
    ["62", "Pas-de-Calais", HDF],
    ["63", "Puy-de-Dôme", ARA],
    ["64", "Pyrénées-Atlantiques", NAQ],
    ["65", "Hautes-Pyrénées", OCC],
    ["66", "Pyrénées-Orientales", OCC],
    ["67", "Bas-Rhin", GES],
    ["68", "Haut-Rhin", GES],
    ["69", "Rhône", ARA],
    ["70", "Haute-Saône", BFC],
    ["71", "Saône-et-Loire", BFC],
    ["72", "Sarthe", PDL],
    ["73", "Savoie", ARA],
    ["74", "Haute-Savoie", ARA],
    ["75", "Paris", IDF],
    ["76", "Seine-Maritime", NOR],
    ["77", "Seine-et-Marne", IDF],
    ["78", "Yvelines", IDF],
    ["79", "Deux-Sèvres", NAQ],
    ["80", "Somme", HDF],
    ["81", "Tarn", OCC],
    ["82", "Tarn-et-Garonne", OCC],
    ["83", "Var", PAC],
    ["84", "Vaucluse", PAC],
    ["85", "Vendée", PDL],
    ["86", "Vienne", NAQ],
    ["87", "Haute-Vienne", NAQ],
    ["88", "Vosges", GES],
    ["89", "Yonne", BFC],
    ["90", "Territoire de Belfort", BFC],
    ["91", "Essonne", IDF],
    ["92", "Hauts-de-Seine", IDF],
    ["93", "Seine-Saint-Denis", IDF],
    ["94", "Val-de-Marne", IDF],
    ["95", "Val-d'Oise", IDF],
  ] as const
).map(([code, name, region]) => ({ code, name, region }));

/**
 * Former region names (before 2016) and common abbreviations → current region.
 * Keys are compared after {@link geoKey} normalisation.
 */
export const REGION_ALIASES: Readonly<Record<string, RegionName>> = {
  // Former regions (2016 reform)
  alsace: GES,
  lorraine: GES,
  "champagne ardenne": GES,
  aquitaine: NAQ,
  limousin: NAQ,
  "poitou charentes": NAQ,
  auvergne: ARA,
  "rhone alpes": ARA,
  bourgogne: BFC,
  "franche comte": BFC,
  "languedoc roussillon": OCC,
  "midi pyrenees": OCC,
  "nord pas de calais": HDF,
  picardie: HDF,
  "basse normandie": NOR,
  "haute normandie": NOR,
  centre: CVL,
  "region centre": CVL,
  "provence alpes cote d azur": PAC,
  // Common abbreviations
  ara: ARA,
  aura: ARA,
  bfc: BFC,
  cvl: CVL,
  ge: GES,
  hdf: HDF,
  idf: IDF,
  "ile de france": IDF,
  naq: NAQ,
  pdl: PDL,
  paca: PAC,
  "region parisienne": IDF,
};

/** Aliases that are abbreviations or spelling variants (no warning), not former regions. */
export const REGION_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "ara",
  "aura",
  "bfc",
  "cvl",
  "ge",
  "hdf",
  "idf",
  "ile de france",
  "naq",
  "pdl",
  "paca",
  "provence alpes cote d azur",
]);

/**
 * Normalisation used for name matching: lower case, no accents, every
 * non-alphanumeric sequence replaced by one space ("Val-d'Oise" → "val d oise").
 * @param input - Free text.
 */
export function geoKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
