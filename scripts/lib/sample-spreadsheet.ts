/**
 * Synthetic spreadsheet for the import tests — ENTIRELY FICTITIOUS data.
 *
 * - Every real column, in the original order, read from docs/source-mapping.md;
 * - 2 title rows above the headers, some headers on several lines;
 * - ~20 warehouses covering the dirty cases the import must survive;
 * - one extra « TAXE BUREAU 2022 » column (conflict with TAXE BUREAU IDF 2022)
 *   and one unknown column at the end.
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

type Cell = ExcelJS.CellValue;

/** Real spreadsheet columns, in order, from docs/source-mapping.md. */
export function realColumns(docPath = "docs/source-mapping.md"): string[] {
  return readFileSync(docPath, "utf8")
    .split("\n")
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line) => line.split("|")[2]!.trim());
}

/** Extra columns of the sample (not in the real spreadsheet). */
export const EXTRA_COLUMNS = ["TAXE BUREAU 2022", "COMMENTAIRE INTERNE"] as const;

/** Headers written on two lines in the sample (wrapped cells). */
const MULTILINE_HEADERS: Readonly<Record<string, string>> = {
  "NOM ENTREPOT": "NOM\nENTREPOT",
  "DATE DE FIN DE BAIL": "DATE DE FIN\nDE BAIL",
  "PROCHAINE DATE DE SORTIE": "PROCHAINE DATE\nDE SORTIE",
  "SURFACE ENTREPOT TOTAL": "SURFACE ENTREPOT\nTOTAL",
};

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

interface SiteSeed {
  n: number;
  code: string | null;
  name: string;
  city: string;
  postal: string;
  department: Cell;
  region: string;
  lat: Cell;
  lon: Cell;
  area: number;
  idf?: boolean;
}

const SEEDS: SiteSeed[] = [
  { n: 1, code: "SMP-001", name: "Entrepôt Fictif Lyon-Est", city: "Saint-Priest", postal: "69800", department: "69", region: "Auvergne-Rhône-Alpes", lat: 45.7106, lon: 4.9486, area: 48320 },
  { n: 2, code: "SMP-002", name: "Entrepôt Fictif Lille-Sud", city: "Lesquin", postal: "59810", department: "59", region: "Hauts-de-France", lat: 50.589, lon: 3.115, area: 32150 },
  { n: 3, code: "SMP-003", name: "Entrepôt Fictif Vitrolles", city: "Vitrolles", postal: "13127", department: "13", region: "Provence-Alpes-Côte d'Azur", lat: 43.445, lon: 5.248, area: 27480 },
  { n: 4, code: "SMP-004", name: "Entrepôt Fictif Cestas", city: "Cestas", postal: "33610", department: "33", region: "Nouvelle-Aquitaine", lat: 44.742, lon: -0.681, area: 22400 },
  { n: 5, code: "SMP-005", name: "Entrepôt Fictif Rennes-Nord", city: "La Mézière", postal: "35520", department: "35", region: "Bretagne", lat: 48.215, lon: -1.753, area: 18900 },
  { n: 6, code: "SMP-006", name: "Entrepôt Fictif Strasbourg", city: "Strasbourg", postal: "67100", department: "67", region: "Grand Est", lat: 7.7521, lon: 48.5734, area: 21340 },
  { n: 7, code: "SMP-007", name: "Entrepôt Fictif Toulouse-Sud", city: "Portet-sur-Garonne", postal: "31120", department: "31", region: "Occitanie", lat: 40.4168, lon: -3.7038, area: 39760 },
  { n: 8, code: "SMP-008", name: "Entrepôt Fictif Cergy", city: "Saint-Ouen-l'Aumône", postal: "95310", department: "Val-d'Oise", region: "Île-de-France", lat: 49.045, lon: 2.11, area: 15480, idf: true },
  { n: 9, code: "SMP-009", name: "Entrepôt Fictif Grenoble", city: "Moirans", postal: "38430", department: "38 - Isère", region: "Rhône-Alpes", lat: 45.325, lon: 5.565, area: 25600 },
  { n: 10, code: "SMP-010", name: "", city: "Dijon", postal: "21600", department: "21", region: "Bourgogne-Franche-Comté", lat: 47.288, lon: 5.064, area: 12750 },
  { n: 11, code: "SMP-011", name: "Entrepôt Fictif Nantes", city: "Carquefou", postal: "44470", department: "44", region: "Pays de la Loire", lat: 47.298, lon: -1.492, area: 26100 },
  { n: 12, code: "SMP-012", name: "Entrepôt Fictif Rungis", city: "Rungis", postal: "94150", department: "94", region: "IDF", lat: 48.747, lon: 2.349, area: 14200, idf: true },
  { n: 13, code: "SMP-013", name: "Entrepôt Fictif Orléans", city: "Saran", postal: "45770", department: "45", region: "Centre-Val de Loire", lat: 47.95, lon: 1.87, area: 30500 },
  { n: 14, code: "SMP-014", name: "Entrepôt Fictif Metz", city: "Ennery", postal: "57365", department: "57", region: "Grand Est", lat: 49.225, lon: 6.225, area: 19800 },
  { n: 15, code: "SMP-015", name: "Entrepôt Fictif Rouen", city: "Grand-Couronne", postal: "76530", department: "76", region: "Normandie", lat: 49.36, lon: 1.01, area: 17350 },
  { n: 16, code: "SMP-016", name: "Entrepôt Fictif Clermont", city: "Aulnat", postal: "63510", department: "63", region: "Auvergne-Rhône-Alpes", lat: null, lon: null, area: 11200 },
  { n: 17, code: "SMP-017", name: "Entrepôt Fictif Montpellier", city: "Vendargues", postal: "34740", department: "34", region: "Occitanie", lat: 43.656, lon: 3.97, area: 20700 },
  { n: 18, code: null, name: "Entrepôt Fictif Sans Code", city: "Reims", postal: "51100", department: "51", region: "Grand Est", lat: 49.25, lon: 4.03, area: 9000 },
  { n: 19, code: "SMP-019", name: "Entrepôt Fictif Ajaccio", city: "Ajaccio", postal: "20090", department: "2a", region: "Bretagne", lat: 41.93, lon: 8.74, area: 8400 },
  { n: 20, code: "SMP-020", name: "Entrepôt Fictif Tours", city: "Tours", postal: "37100", department: "Indre et Loire", region: "Centre-Val de Loire", lat: 47.43, lon: 0.68, area: 16800 },
  { n: 21, code: "SMP-021", name: "Entrepôt Fictif Amiens", city: "Amiens", postal: "80000", department: "80", region: "Picardie", lat: 49.894, lon: 2.295, area: 13900 },
];

const frNumber = (v: number, suffix = "") =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v).replace(/ /g, " ")}${suffix}`;

/** Values of one site, keyed by (unnormalised) column label. */
function siteRow(seed: SiteSeed, variant: { scale?: number } = {}): Record<string, Cell> {
  const n = seed.n + (variant.scale ?? 0) * 100;
  const code = seed.code ? (variant.scale ? `${seed.code}-${variant.scale}` : seed.code) : null;
  const area = seed.area;
  const surveyed = seed.n % 3 === 0 ? Math.round(area * 1.015) : area;
  const rent = (y: number) => Math.round(area * 52 * 1.03 ** (y - 2022));
  const charges = (y: number) => Math.round(area * 9 * 1.04 ** (y - 2021));
  const insurance = (y: number) => Math.round(area * 1.8 * 1.05 ** (y - 2021));
  const tf = (y: number) => Math.round(area * 6 * 1.04 ** (y - 2021));
  const elec = (y: number) => Math.round(area * 95 * 0.97 ** (y - 2020));
  const gas = (y: number) => Math.round(area * 40 * 0.95 ** (y - 2020));
  const water = (y: number) => Math.round(area * 0.12 * 1.01 ** (y - 2022));
  const per = (v: number) => Math.round((v / area) * 100) / 100;
  const nextExit = utc(2028 + (seed.n % 4), 6, 30);
  const noticeDate = utc(2027 + (seed.n % 4), 12, 31);
  const arbitration = utc(2027 + (seed.n % 4), 6, 30);

  const row: Record<string, Cell> = {
    ENTREPOT: code,
    "CODE BAIL": code ? `BL-${code}` : null,
    "CLES QLICKSENS": code ? `QS-${code}` : null,
    "CODE AL": `al ${String(100 + n).padStart(4, "0")}`,
    "N°": n,
    "NOM ENTREPOT": seed.name,
    "PORTEFEUILLE PROPERTY": n % 2 ? "Portefeuille Fictif Nord" : "Portefeuille Fictif Sud",
    "BU OCCUPANTE": "BU Fictive Supply",
    "BASSIN BU": `Bassin Fictif ${seed.region}`,
    PAYS: "France",
    "RESPONSABLE DE REGION (DLR)": "Camille Fictif",
    "RESPONSABLE TECHNIQUE REGIONAL (RTR)": "Dominique Fictif",
    RAMSES: `ram ${900 + n}`,
    "ENTITE PORTANT LE BAIL": "SCI Fictive Logistique",
    "STATUT D'OCCUPATION": "Locataire",
    "PROPRIETAIRE DES MURS": "Foncière Fictive",
    "SCI SUR ACTIF": "SCI Fictive Actif",
    "PROPERTY MANAGER": "Gestionnaire Fictif",
    STATUT: "En exploitation",
    "EN ACTIVITE": "Oui",
    "MODE D'EXPLOITATION": n % 3 ? "Prestataire" : "Intégré",
    "EXPLOITANT LOGISTIQUE": n % 3 ? "Logisticien Fictif" : null,
    ADRESSE: `${10 + seed.n} rue de l'Exemple, ${seed.postal} ${seed.city}`,
    DEPARTEMENT: seed.department,
    REGION: seed.region,
    LAT: seed.lat,
    LONG: seed.lon,
    "SECTEUR DE DISTRIBUTION": n % 2 ? "Hypermarchés" : "Proximité",
    TYPOLOGIE: n % 2 ? "Multi-température" : "Sec",
    "ACTIVITE CIBLE": "Préparation de commandes magasins",
    "MAGASINS DESSERVIS": "Magasins fictifs de la région",
    "NOMBRE MAGASIN DESSERVIS": 30 + seed.n,
    BAIL: "Oui",
    PLANS: `\\\\srv-fictif\\plans\\${code ?? "x"}\\`,
    "DOSSIER ADMINISTRATIF": `Dossier ${code ?? "x"}`,
    "ENTREE EN ACTIVITE": utc(2000 + (seed.n % 20), 3, 1),
    "DATE D'EFFET BAIL INITIAL": utc(2014, 1, 1),
    "DATE D'EFFET DERNIER AVENANT": utc(2021, 7, 1),
    "MODALITES DU BAIL EN COURS": "Bail commercial 3/6/9 (fictif)",
    "FRANCHISE DE LOYER INITIAL": "3 mois",
    "DATE DE FIN DE BAIL": utc(2031, 12, 31),
    "PROCHAINE DATE DE SORTIE": nextExit,
    "DUREE DE PREAVIS": "6 mois",
    "DATE DE PREAVIS": noticeDate,
    "DATE D'ARBITRAGE POUR ECHEANCE CONTRACTUELLE (6 MOIS AVANT)": arbitration,
    "AVANCEMENT NEGOCIATION": "Aucune négociation en cours",
    ACTUALITES: null,
    "CONDITIONS RENOUVELLEMENT SIGNEES": "Non",
    "MONTANT FRANCHISE": 120000,
    "FRANCHISE MOIS": 3,
    "DUREE SUPPLEMENTAIRE": null,
    "LOYER ECONOMIQUE / M²": 48.5,
    VLM: 52,
    INDEXATION: "ILAT annuel",
    "REVISION DE LOYER": "Triennale",
    "M² BUREAUX/M²TOTAL": 0.045,
    "PRIX BUREAUX / M2": 140,
    "COMMENTAIRES LOYER": null,
    "PORTEUR DE L'ICPE": "Exploitant Fictif",
    "PRINCIPALES RUBRIQUES ICPE": "1510-E, 2925-D ; 4331 (A)",
    "Lien Géorisques": null,
    "URL Géorisques": null,
    "DOCUMENTS ADMINISTRATIFS ICPE": null,
    "ANNEE DE REFERENCE": 2020,
    "ANNEE DE REFERENCE CONSO ELEC EN KWH": elec(2020),
    "ANNEE DE REFERENCE CONSO GAZ EN KWH": gas(2020),
    "Refacturation Gestion Technique Oui/Non": "Non",
    "Détail si refacturation gestion technique": null,
    "CERTIFICATS OPERAT": null,
    "PROVISIONS CHARGES 2024": Math.round(charges(2024) * 1.05),
    "TAXES 2026": Math.round(area * 7),
    "TAXE PARKING 2024": seed.idf ? Math.round(area * 0.25) : null,
    "PRISE D'EFFET DU CONTRAT DE PRESTATION": utc(2019, 1, 1),
    "CLAUSE IMMOBILIERE => CONTRAT DE PRESTATION (Oui/Non)": "Oui",
    "DUREE DU CONTRAT DE PRESTATION": "5 ans",
    "DATE DE FIN DE CONTRAT DE PRESTATION": utc(2028, 12, 31),
    "RECONDUCTION DU CONTRAT DE PRESTATION": "Tacite, 1 an",
    "PREAVIS DU CONTRAT DE PRESTATION": "6 mois",
    ANTERIORIETE: "Depuis 2019",
    "DATE DE 1ERE RESILIATION": utc(2027, 12, 31),
    "ETP MOYEN": Math.round(area / 180),
    "CA MARCHANDISE": area * 4200,
    "NOMBRE DE COLIS ANNUEL": area * 95,
    "QUALITE BATIMENT": n % 2 ? "A" : "B",
    "DATE DE CONSTRUCTION": 1995 + (seed.n % 20),
    "DATE DE REHABILITATION": null,
    "DATE D'EXTENSION": null,
    "ENTREPOTS (TOTAL BAIL)": Math.round(area * 1.04),
    TERRAIN: area * 2.6,
    "SURFACE ENTREPOT TOTAL": area,
    "ENTREPOT A TEMPERATURE CONTROLE": Math.round(area * 0.35),
    "ENTREPOT SEC": Math.round(area * 0.55),
    EMBALLAGE: Math.round(area * 0.03),
    "LOCAL DE CHARGES": Math.round(area * 0.01),
    "LOCAUX TECHNIQUES": Math.round(area * 0.008),
    BLS: Math.round(area * 0.045),
    "POSTE DE GARDE": 25,
    "HAUTEUR (M)": 12.5,
    "NOMBRE DE PLACE VL": Math.round(area / 250),
    "NOMBRE DE PLACE PL": Math.round(area / 900),
    "NOMBRE DE QUAIS": Math.round(area / 1100),
    "ENTREPOTS TOTAL (RELEVE DE GEOMETRE)": seed.n % 3 === 0 ? surveyed : null,
    "BASSIN DE RETENTION": "Oui, 800 m³",
    "CAPACITE D'EXTENTION": null,
    "NOMBRE CELLULES": Math.max(1, Math.round(area / 6000)),
    "SPECIFICITES TECHNIQUES": "Sprinklage ESFR",
    CERTIFICATION: null,
    BORNES: "4 bornes",
    PHOTOVOLTAIQUE: "Non",
    "Date modif": utc(2026, 5, 15),
    "TAXE BUREAU 2022": null,
    "COMMENTAIRE INTERNE": "Colonne inconnue de l'import",
  };

  for (const y of [2022, 2023, 2024, 2025, 2026]) row[`LOYER ${y}`] = rent(y);
  for (const y of [2023, 2024, 2025, 2026]) row[`LOYER ${y} /M²`] = per(rent(y));
  for (const y of [2024, 2025, 2026]) row[`EVOLUTION ${y} LOYER N-1`] = Math.round((rent(y) / rent(y - 1) - 1) * 1000) / 1000;
  row["LOYER PERCU 2026"] = rent(2026);
  for (const y of [2020, 2021, 2022, 2023]) {
    row[`${y} CONSO ELEC EN KWH`] = elec(y);
    row[`${y} CONSO ELEC PAR M²`] = per(elec(y));
    row[`${y} CONSO GAZ EN KWH`] = gas(y);
    row[`${y} CONSO GAZ PAR M²`] = per(gas(y));
  }
  for (const y of [2022, 2023]) {
    row[`${y} EAU`] = water(y);
    row[`${y} EAU/M²`] = Math.round((water(y) / area) * 10000) / 10000;
  }
  const chargeCols: Record<number, [string, string]> = {
    2021: ["CHARGES 2021", "CHARGES / M² 2021"],
    2022: ["CHARGES 2022", "CHARGES / M² 2022"],
    2023: ["CHARGES 2023", "CHARGES/M² 2023"],
    2024: ["CHARGES 2024", "CHARGES/M² 2024"],
    2026: ["CHARGES 2026", "CHARGES 2026 /M²"],
  };
  for (const [y, [value, perCol]] of Object.entries(chargeCols)) {
    row[value] = charges(Number(y));
    row[perCol] = per(charges(Number(y)));
  }
  row["ASSURANCES 2026"] = insurance(2026);
  row["EVOLUTION PROVISIONS N-1"] = null;
  const insuranceCols: Record<number, string> = { 2021: "ASSURANCES / M² 2021", 2022: "ASSURANCES / M² 2022", 2023: "ASSURANCES/M² 2023", 2024: "ASSURANCES/m² 2024" };
  for (const [y, perCol] of Object.entries(insuranceCols)) {
    row[`ASSURANCES ${y}`] = insurance(Number(y));
    row[perCol] = per(insurance(Number(y)));
  }
  row["EVOLUTION ASSURANCES N-1"] = 0.05;
  const tfCols: Record<number, string> = { 2021: "TF / M² 2021", 2022: "TF / M² 2022", 2023: "TF/M² 2023", 2024: "TF/M² 2024" };
  for (const [y, perCol] of Object.entries(tfCols)) {
    row[`TF ${y}`] = tf(Number(y));
    row[perCol] = per(tf(Number(y)));
  }
  row["EVOLUTION TF N-1"] = 0.04;
  row["EVOLUTION TF 24 N-1"] = 0.04;
  if (seed.idf) {
    const office = (y: number) => Math.round(area * 0.9 * 1.03 ** (y - 2021));
    row["TAXE BUREAU IDF 2021"] = office(2021);
    row["TAXE BUREAU IDF / M² 2021"] = per(office(2021));
    row["TAXE BUREAU IDF 2022"] = office(2022);
    row["TAXE BUREAU IDF / M² 2022"] = per(office(2022));
    row["TAXE BUREAU 2023"] = office(2023);
    row["TAXE BUREAU /M² 2023"] = per(office(2023));
    row["TAXE BUREAU 2024"] = office(2024);
    row["TAXE BUREAU /M² 2024"] = per(office(2024));
    row["EVOLUTION TAXE BUREAU N-1"] = 0.03;
  }
  return row;
}

/** Dirty cases, applied on top of the clean values. */
function applyDirtyCases(rows: Map<number, Record<string, Cell>>): void {
  const r = (n: number) => rows.get(n)!;

  // 1 — hyperlinks (the formula is set in buildSampleWorkbook, it needs a cell address).
  r(1).BAIL = { text: "Bail signé (PDF)", hyperlink: "https://ged-fictive.example/baux/SMP-001.pdf" };
  r(1)["URL Géorisques"] = { text: "Fiche Géorisques", hyperlink: "https://georisques.example/installation/0000001" };
  r(1)["Lien Géorisques"] = "https://georisques.example/installation/0000001";
  r(1)["DATE DE REHABILITATION"] = "2016";
  r(1)["DATE D'EXTENSION"] = "2010 ; 03/2019";

  // 2 — French number formats with units, as text.
  r(2)["LOYER 2024"] = frNumber(r(2)["LOYER 2024"] as number, ",00 €");
  r(2)["SURFACE ENTREPOT TOTAL"] = frNumber(32150, " m²");
  r(2)["2023 CONSO ELEC EN KWH"] = frNumber(r(2)["2023 CONSO ELEC EN KWH"] as number, " kWh");
  r(2)["MONTANT FRANCHISE"] = "120 000 €";
  r(2).BAIL = "\\\\srv-fictif\\baux\\SMP-002\\bail.pdf";

  // 3 — placeholders.
  Object.assign(r(3), { "CODE BAIL": "NC", "PORTEUR DE L'ICPE": "-", "HAUTEUR (M)": "N/A", VLM: "?", "AVANCEMENT NEGOCIATION": "à venir", "DATE DE PREAVIS": "en cours", "EN ACTIVITE": "Oui", BAIL: "néant" });

  // 4 — dates in various formats, year alone, several dates in one cell.
  Object.assign(r(4), {
    "ENTREE EN ACTIVITE": "2004",
    "DATE D'EFFET BAIL INITIAL": "12/03/2015",
    "DATE D'EFFET DERNIER AVENANT": "mars 2021",
    "DATE DE FIN DE BAIL": "31.12.2033",
    "PRISE D'EFFET DU CONTRAT DE PRESTATION": "janv. 2020",
    "DATE DE 1ERE RESILIATION": "15/06/27",
    "DATE DE CONSTRUCTION": "1998 ; 2004",
    "DATE D'EXTENSION": "12/2016",
  });

  // 5 — notice periods in words.
  Object.assign(r(5), { "DUREE DE PREAVIS": "six mois", "EN ACTIVITE": "Non", STATUT: "Fermé" });
  Object.assign(r(11), { "DUREE DE PREAVIS": "1 an", "CLES QLICKSENS": "QS-SMP-011 ; QS-SMP-011B / QS-SMP-011C" });
  Object.assign(r(13), { "DUREE DE PREAVIS": "3 ans ferme" });
  Object.assign(r(17), { "DUREE DE PREAVIS": "à chaque échéance triennale" });

  // 12 — TAXE BUREAU and TAXE BUREAU IDF in conflict for 2022.
  r(12)["TAXE BUREAU 2022"] = (r(12)["TAXE BUREAU IDF 2022"] as number) + 500;

  // 13 — inconsistent per-m² value.
  r(13)["LOYER 2024 /M²"] = 99.99;

  // 14 — STATUT « Fermé » but EN ACTIVITE « Oui ».
  Object.assign(r(14), { STATUT: "Fermé définitivement", "EN ACTIVITE": "Oui" });

  // 15 — inactive, plans on a UNC path and an admin folder as URL.
  Object.assign(r(15), { "EN ACTIVITE": "Non", STATUT: "Vacant", "DOSSIER ADMINISTRATIF": { text: "Dossier", hyperlink: "https://ged-fictive.example/admin/SMP-015" } });

  // 17 — arbitration date inconsistent with the notice date.
  r(17)["DATE D'ARBITRAGE POUR ECHEANCE CONTRACTUELLE (6 MOIS AVANT)"] = utc(2025, 1, 1);

  // 19 — AL code already used by SMP-001, department in lower case, region mismatch.
  r(19)["CODE AL"] = r(1)["CODE AL"];

  // 20 — water in litres (order of magnitude), department name without hyphens.
  r(20)["2022 EAU"] = (r(20)["2022 EAU"] as number) * 1000;
  r(20)["2023 EAU"] = (r(20)["2023 EAU"] as number) * 1000;

  // 21 — ICPE regime unknown, bad boolean.
  Object.assign(r(21), { "PRINCIPALES RUBRIQUES ICPE": "Rubriques 1510 et 2925 (à confirmer)", "CONDITIONS RENOUVELLEMENT SIGNEES": "peut-être" });
}

/** Options of {@link buildSampleWorkbook}. */
export interface SampleOptions {
  /**
   * Extra copies of the clean sites (codes suffixed « -1 », « -2 »…) for
   * performance tests; the dirty cases are only in the first copy.
   */
  copies?: number;
  /** Path of docs/source-mapping.md. */
  docPath?: string;
}

/** Builds the synthetic workbook. */
export function buildSampleWorkbook(options: SampleOptions = {}): ExcelJS.Workbook {
  const columns = [...realColumns(options.docPath), ...EXTRA_COLUMNS];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vigie — fichier de test synthétique";
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = workbook.created;
  const sheet = workbook.addWorksheet("Référentiel");

  sheet.getCell(1, 1).value = "RÉFÉRENTIEL ENTREPÔTS — EXPORT FICTIF";
  sheet.mergeCells(1, 1, 1, 8);
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = "Données entièrement fictives, générées pour les tests d'import d'Vigie — aucune donnée réelle.";
  sheet.mergeCells(2, 1, 2, 8);

  const headerRow = sheet.getRow(3);
  columns.forEach((column, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = MULTILINE_HEADERS[column] ?? column;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = { bold: true };
  });
  headerRow.height = 32;

  const rows = new Map<number, Record<string, Cell>>();
  for (const seed of SEEDS) rows.set(seed.n, siteRow(seed));
  applyDirtyCases(rows);

  const ordered: Record<string, Cell>[] = [];
  for (const seed of SEEDS) {
    ordered.push(rows.get(seed.n)!);
    if (seed.n === 9) ordered.push({}); // an empty row in the middle
    if (seed.n === 12) ordered.push({ ...rows.get(3)!, "NOM ENTREPOT": "Doublon de SMP-003" }); // duplicated code
  }
  for (let copy = 1; copy <= (options.copies ?? 0); copy++) {
    for (const seed of SEEDS.filter((s) => s.code)) ordered.push(siteRow(seed, { scale: copy }));
  }

  ordered.forEach((values, i) => {
    const row = sheet.getRow(4 + i);
    columns.forEach((column, c) => {
      const value = values[column];
      if (value !== undefined && value !== null) row.getCell(c + 1).value = value;
    });
  });
  // A value computed by a formula: LOYER 2026 = ROUND(LOYER 2025 × 1.03) on the
  // first site. The import must read the cached RESULT, never the formula.
  const rent2025 = sheet.getRow(4).getCell(columns.indexOf("LOYER 2025") + 1);
  const rent2026 = sheet.getRow(4).getCell(columns.indexOf("LOYER 2026") + 1);
  rent2026.value = { formula: `ROUND(${rent2025.address}*1.03,0)`, result: Math.round((rent2025.value as number) * 1.03) };

  for (let c = 1; c <= columns.length; c++) sheet.getColumn(c).width = 18;
  return workbook;
}

/** Number of sites and rows of the sample (for the tests). */
export const SAMPLE_FACTS = {
  /** Distinct codes that must be created. */
  sites: SEEDS.filter((s) => s.code).length,
  /** Rejected rows: the row without code and the duplicated SMP-003. */
  rejectedRows: 2,
  /** Non-empty data rows. */
  rows: SEEDS.length + 1,
} as const;
