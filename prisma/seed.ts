/**
 * Demonstration data set: 10 ENTIRELY FICTITIOUS warehouses (DEMO-001 … DEMO-010).
 *
 * Idempotent: sites are upserted on `code`, 1-1 records on `siteId`, metrics on
 * (site, year, metric), external ids on (site, system); list tables without a
 * natural key (building works, ICPE headings) are replaced per site. Running it
 * twice yields the same row counts. Lease dates are relative to today, so the
 * « arbitration overdue » and « arbitration within 6 months » profiles stay true.
 *
 * No user is created (step 3).
 *
 * Run: `pnpm db:seed` (or `prisma db seed`).
 */
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addMonths, todayDateOnly, toDateOnly } from "../src/domain/dates";
import type { BuildingWorkKind, ExternalSystem, IcpeRegime } from "../src/domain/enums";
import type { MetricCode } from "../src/domain/metrics";
import { createPrismaClient, type PrismaClient } from "../src/server/prisma";

type YearValues = Partial<Record<number, number>>;

interface DemoSite {
  code: string;
  name: string;
  city: string;
  postalCode: string | null;
  departmentCode: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  /** full: every table; standard: main tables; partial: identity only. */
  profile: "full" | "standard" | "partial";
  isActive: boolean;
  area: number | null;
  lease: "overdue" | "soon" | "later" | "none" | "codeOnly";
  metricYears: "many" | "few" | "none";
  icpe: { code: string; regime: IcpeRegime; label: string }[];
  works: { kind: BuildingWorkKind; date: string; description: string }[];
}

const SITES: DemoSite[] = [
  {
    code: "DEMO-001", name: "Entrepôt Démo Lyon-Est", city: "Saint-Priest", postalCode: "69800",
    departmentCode: "69", region: "Auvergne-Rhône-Alpes", lat: 45.710600, lng: 4.948600,
    profile: "full", isActive: true, area: 48320, lease: "later", metricYears: "many",
    icpe: [
      { code: "1510", regime: "E", label: "Entrepôts couverts (stockage de matières combustibles)" },
      { code: "1511", regime: "D", label: "Entrepôts frigorifiques" },
      { code: "2925", regime: "D", label: "Ateliers de charge d'accumulateurs" },
    ],
    works: [
      { kind: "CONSTRUCTION", date: "2004-06-15", description: "Construction initiale (démo)" },
      { kind: "EXTENSION", date: "2016-09-01", description: "Extension de 8 000 m² (démo)" },
      { kind: "REHABILITATION", date: "2022-03-10", description: "Réfection de la toiture (démo)" },
    ],
  },
  {
    code: "DEMO-002", name: "Entrepôt Démo Lille-Lesquin", city: "Lesquin", postalCode: "59810",
    departmentCode: "59", region: "Hauts-de-France", lat: 50.589000, lng: 3.115000,
    profile: "standard", isActive: true, area: 32150, lease: "overdue", metricYears: "many",
    icpe: [{ code: "1510", regime: "A", label: "Entrepôts couverts" }],
    works: [{ kind: "CONSTRUCTION", date: "1998-01-20", description: "Construction initiale (démo)" }],
  },
  {
    code: "DEMO-003", name: "Entrepôt Démo Marseille-Vitrolles", city: "Vitrolles", postalCode: "13127",
    departmentCode: "13", region: "Provence-Alpes-Côte d'Azur", lat: 43.445000, lng: 5.248000,
    profile: "standard", isActive: true, area: 27480, lease: "soon", metricYears: "few",
    icpe: [], works: [{ kind: "CONSTRUCTION", date: "2009-05-04", description: "Construction initiale (démo)" }],
  },
  {
    code: "DEMO-004", name: "Entrepôt Démo Bordeaux-Cestas", city: "Cestas", postalCode: null,
    departmentCode: "33", region: "Nouvelle-Aquitaine", lat: 44.742000, lng: -0.681000,
    profile: "partial", isActive: true, area: null, lease: "codeOnly", metricYears: "none", icpe: [], works: [],
  },
  {
    code: "DEMO-005", name: "Entrepôt Démo Rennes-Nord", city: "La Mézière", postalCode: "35520",
    departmentCode: "35", region: "Bretagne", lat: 48.215000, lng: -1.753000,
    profile: "standard", isActive: false, area: 18900, lease: "none", metricYears: "few", icpe: [],
    works: [{ kind: "CONSTRUCTION", date: "1992-10-01", description: "Construction initiale (démo)" }],
  },
  {
    code: "DEMO-006", name: "Entrepôt Démo Strasbourg-Port", city: "Strasbourg", postalCode: "67100",
    departmentCode: "67", region: "Grand Est", lat: null, lng: null,
    profile: "standard", isActive: true, area: 21340, lease: "later", metricYears: "few",
    icpe: [{ code: "1510", regime: "UNKNOWN", label: "Entrepôts couverts (régime à confirmer)" }], works: [],
  },
  {
    code: "DEMO-007", name: "Entrepôt Démo Toulouse-Sud", city: "Portet-sur-Garonne", postalCode: "31120",
    departmentCode: "31", region: "Occitanie", lat: 43.523000, lng: 1.404000,
    profile: "full", isActive: true, area: 39760, lease: "later", metricYears: "many",
    icpe: [
      { code: "1510", regime: "E", label: "Entrepôts couverts" },
      { code: "4331", regime: "DC", label: "Liquides inflammables de catégorie 2 ou 3" },
    ],
    works: [
      { kind: "CONSTRUCTION", date: "2011-02-14", description: "Construction initiale (démo)" },
      { kind: "EXTENSION", date: "2019-11-30", description: "Création d'une cellule froid (démo)" },
    ],
  },
  {
    code: "DEMO-008", name: "Entrepôt Démo Nantes-Carquefou", city: "Carquefou", postalCode: "44470",
    departmentCode: "44", region: "Pays de la Loire", lat: 47.298000, lng: -1.492000,
    profile: "standard", isActive: true, area: 25600, lease: "later", metricYears: "few", icpe: [], works: [],
  },
  {
    code: "DEMO-009", name: "Entrepôt Démo Paris-Rungis", city: "Rungis", postalCode: "94150",
    departmentCode: "94", region: "Île-de-France", lat: 48.747000, lng: 2.349000,
    profile: "full", isActive: true, area: 15480, lease: "later", metricYears: "many",
    icpe: [{ code: "1511", regime: "E", label: "Entrepôts frigorifiques" }],
    works: [{ kind: "REHABILITATION", date: "2018-07-01", description: "Mise en conformité sprinklage (démo)" }],
  },
  {
    code: "DEMO-010", name: "Entrepôt Démo Dijon-Longvic", city: "Longvic", postalCode: "21600",
    departmentCode: "21", region: "Bourgogne-Franche-Comté", lat: 47.288000, lng: 5.064000,
    profile: "standard", isActive: true, area: 12750, lease: "later", metricYears: "few", icpe: [], works: [],
  },
];

/** Deterministic pseudo-variation (±5 %) so series look realistic but stay stable. */
function vary(base: number, seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round(base * (0.95 + (x - Math.floor(x)) * 0.1));
}

function metricsFor(site: DemoSite, index: number): { metric: MetricCode; year: number; value: number }[] {
  if (site.metricYears === "none" || !site.area) return [];
  const area = site.area;
  const many = site.metricYears === "many";
  const rows: { metric: MetricCode; year: number; value: number }[] = [];
  const add = (metric: MetricCode, values: YearValues) => {
    for (const [year, value] of Object.entries(values)) {
      if (value !== undefined) rows.push({ metric, year: Number(year), value });
    }
  };
  const series = (base: number, from: number, to: number, growth: number, salt: number): YearValues => {
    const out: YearValues = {};
    for (let y = from; y <= to; y++) out[y] = vary(base * (1 + growth) ** (y - from), index * 100 + salt + y);
    return out;
  };

  add("RENT", series(area * 52, many ? 2022 : 2024, 2026, 0.035, 1));
  add("CHARGES", many ? { ...series(area * 9, 2021, 2024, 0.04, 2), 2026: vary(area * 10.5, index + 2026) } : series(area * 9, 2023, 2024, 0.04, 2));
  add("INSURANCE", series(area * 1.8, many ? 2021 : 2023, 2024, 0.06, 3));
  add("PROPERTY_TAX", series(area * 6.2, many ? 2021 : 2023, 2024, 0.05, 4));
  add("ELECTRICITY", series(area * 95, many ? 2020 : 2022, 2023, -0.03, 5));
  if (many) {
    add("RENT_COLLECTED", { 2026: vary(area * 52 * 1.1, index + 7) });
    add("CHARGES_PROVISION", { 2024: vary(area * 9.5, index + 8) });
    add("TAXES_TOTAL", { 2026: vary(area * 7, index + 9) });
    add("GAS", series(area * 40, 2020, 2023, -0.05, 6));
    add("WATER", { 2022: vary(area * 0.12, index + 10), 2023: vary(area * 0.11, index + 11) });
    add("HEADCOUNT_FTE", { 2026: vary(area / 180, index + 12) });
    add("MERCHANDISE_REVENUE", { 2026: vary(area * 4200, index + 13) });
    add("PARCELS", { 2026: vary(area * 95, index + 14) });
  }
  if (site.region === "Île-de-France") {
    add("OFFICE_TAX", series(area * 0.9, 2021, 2024, 0.03, 15));
    add("PARKING_TAX", { 2024: vary(area * 0.25, index + 16) });
  }
  return rows;
}

function leaseFor(site: DemoSite, today: Date) {
  const common = {
    code: `BAIL-${site.code}`,
    holdingEntity: "SCI Démo Logistique",
    initialEffectiveDate: toDateOnly("2014-01-01"),
    currentTerms: "Bail commercial 3/6/9 (données fictives de démonstration).",
    documentReference: `Bail/${site.code}/bail-signe.pdf`,
    indexation: "ILAT annuel",
    rentReview: "Révision triennale",
  };
  switch (site.lease) {
    case "none":
      return null;
    case "codeOnly":
      return { code: common.code };
    case "overdue": {
      // Notice date 2 months ago → arbitration date 8 months ago (overdue).
      const noticeDate = addMonths(today, -2);
      return {
        ...common,
        nextExitDate: addMonths(noticeDate, 6),
        endDate: addMonths(noticeDate, 6),
        noticePeriodMonths: 6,
        noticePeriodRaw: "6 mois",
        noticeDate,
        negotiationProgress: "Renégociation à engager",
        renewalConditionsSigned: false,
      };
    }
    case "soon": {
      // No notice date: arbitration = next exit − 3 months notice − 6 months = today + 3 months.
      const nextExitDate = addMonths(today, 12);
      return {
        ...common,
        nextExitDate,
        endDate: addMonths(nextExitDate, 36),
        noticePeriodMonths: 3,
        noticePeriodRaw: "3 mois",
        negotiationProgress: "Premier échange avec le bailleur",
        renewalConditionsSigned: false,
      };
    }
    case "later": {
      const nextExitDate = addMonths(today, 30);
      return {
        ...common,
        lastAmendmentDate: toDateOnly("2021-07-01"),
        endDate: addMonths(nextExitDate, 36),
        nextExitDate,
        noticePeriodMonths: 6,
        noticePeriodRaw: "6 mois",
        noticeDate: addMonths(nextExitDate, -6),
        renewalConditionsSigned: true,
        rentFreeAmount: 120000,
        rentFreeMonths: 3,
        economicRentPerSqm: 48.5,
        marketRentValue: 52,
        officePricePerSqm: 140,
        rentComments: "Loyer conforme au marché local (démo).",
      };
    }
  }
}

/**
 * Upserts the demonstration data set.
 * @param prisma - Client connected to the target database.
 * @param now - Reference instant for relative lease dates.
 * @returns Number of sites processed.
 */
export async function seed(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const today = todayDateOnly(now);

  for (const [index, s] of SITES.entries()) {
    const full = s.profile === "full";
    const partial = s.profile === "partial";

    const identity = {
      name: s.name,
      city: s.city,
      postalCode: s.postalCode,
      departmentCode: s.departmentCode,
      region: s.region,
      country: "FR",
      latitude: s.lat,
      longitude: s.lng,
      coordinatesSource: s.lat === null ? null : "import",
      isActive: s.isActive,
      ...(partial
        ? {}
        : {
            legacyNumber: String(100 + index),
            portfolio: index % 2 === 0 ? "Portefeuille Démo Nord" : "Portefeuille Démo Sud",
            occupyingBu: "BU Démo Supply Chain",
            buBasin: `Bassin Démo ${s.region ?? ""}`.trim(),
            regionalDirector: "Camille Exemple",
            regionalTechnicalManager: "Dominique Exemple",
            propertyManager: "Property Manager Démo",
            occupancyStatus: "Locataire",
            wallsOwner: "Foncière Démo",
            sciOnAsset: "SCI Démo Logistique",
            status: s.isActive ? "Exploité" : "Fermé",
            operatingMode: index % 3 === 0 ? "Intégré" : "Prestataire",
            logisticsOperator: index % 3 === 0 ? null : "Logisticien Démo",
            addressLine: `${10 + index} rue de l'Exemple, Zone logistique Démo`,
            distributionSector: index % 2 === 0 ? "Hypermarchés" : "Proximité",
            typology: index % 2 === 0 ? "Multi-température" : "Sec",
            targetActivity: "Préparation de commandes magasins",
            storesServedDescription: "Magasins de démonstration de la région",
            storesServedCount: 40 + index * 7,
            activityStartDate: toDateOnly(`${2000 + index}-03-01`),
            adminFileReference: `Admin/${s.code}/`,
          }),
    };

    const site = await prisma.site.upsert({
      where: { code: s.code },
      create: { code: s.code, ...identity },
      update: identity,
      select: { id: true },
    });
    const siteId = site.id;

    // External identifiers.
    const externalIds: [ExternalSystem, string][] = partial
      ? []
      : [
          ["QLIK_SENSE", `QS-${s.code}`],
          ["AL_CODE", `AL${String(index + 1).padStart(4, "0")}`],
          ...(full ? ([["RAMSES", `RAM-${900 + index}`]] as [ExternalSystem, string][]) : []),
        ];
    for (const [system, value] of externalIds) {
      await prisma.siteExternalId.upsert({
        where: { siteId_system: { siteId, system } },
        create: { siteId, system, value },
        update: { value },
      });
    }

    // Lease (1-1).
    const lease = leaseFor(s, today);
    if (lease) {
      await prisma.lease.upsert({ where: { siteId }, create: { siteId, ...lease }, update: lease });
    }

    if (!partial) {
      const area = s.area ?? 0;
      const technical = {
        buildingQuality: full ? "A" : "B",
        heightM: full ? 12.5 : 10,
        leaseWarehouseArea: area,
        landArea: Math.round(area * 2.6),
        totalWarehouseArea: area,
        surveyedTotalArea: full ? Math.round(area * 1.012) : null,
        temperatureControlledArea: full ? Math.round(area * 0.35) : null,
        dryArea: Math.round(area * (full ? 0.55 : 0.9)),
        packagingArea: full ? Math.round(area * 0.03) : null,
        chargingRoomArea: Math.round(area * 0.01),
        technicalRoomsArea: Math.round(area * 0.008),
        socialOfficeArea: Math.round(area * 0.045),
        guardHouseArea: 25,
        carSpaces: Math.round(area / 250),
        truckSpaces: Math.round(area / 900),
        dockCount: Math.round(area / 1100),
        cellCount: Math.max(1, Math.round(area / 6000)),
        retentionBasin: full ? "Bassin de 1 200 m³" : null,
        extensionCapacity: full ? "Réserve foncière de 10 000 m²" : null,
        technicalSpecifics: full ? "Sprinklage ESFR, quais niveleurs" : null,
        certification: full ? "BREEAM Very Good" : null,
        evCharging: full ? "6 bornes" : null,
        photovoltaic: full ? "Centrale en toiture de 1,2 MWc" : null,
        plansReference: `Plans/${s.code}/`,
      };
      await prisma.siteTechnical.upsert({ where: { siteId }, create: { siteId, ...technical }, update: technical });

      const contract = {
        effectiveDate: toDateOnly("2019-01-01"),
        hasRealEstateClause: full,
        durationRaw: "5 ans",
        endDate: toDateOnly("2028-12-31"),
        renewal: "Tacite reconduction annuelle",
        notice: "6 mois",
        seniority: "Depuis 2019",
        firstTerminationDate: toDateOnly("2027-12-31"),
      };
      await prisma.serviceContract.upsert({ where: { siteId }, create: { siteId, ...contract }, update: contract });

      const energy = {
        referenceYear: 2020,
        referenceElectricityKwh: area * 100,
        referenceGasKwh: full ? area * 45 : null,
        operatCertificates: full ? `Energie/${s.code}/operat-2023.pdf` : null,
        technicalManagementRebilled: full,
        technicalManagementRebillDetail: full ? "Refacturation au prorata des surfaces (démo)" : null,
      };
      await prisma.siteEnergyProfile.upsert({ where: { siteId }, create: { siteId, ...energy }, update: energy });
    }

    // ICPE: 1-1 record plus replaced headings.
    if (s.icpe.length > 0) {
      const icpe = {
        holder: "Exploitant Démo",
        headingsRaw: s.icpe.map((h) => `${h.code} (${h.regime})`).join(" ; "),
        georisquesUrl: null,
        documentsReference: `ICPE/${s.code}/`,
      };
      await prisma.siteIcpe.upsert({ where: { siteId }, create: { siteId, ...icpe }, update: icpe });
    }
    await prisma.$transaction([
      prisma.icpeHeading.deleteMany({ where: { siteId } }),
      prisma.icpeHeading.createMany({ data: s.icpe.map((h) => ({ siteId, ...h })) }),
      prisma.buildingWork.deleteMany({ where: { siteId } }),
      prisma.buildingWork.createMany({
        data: s.works.map((w) => ({ siteId, kind: w.kind, date: toDateOnly(w.date), description: w.description })),
      }),
    ]);

    // Annual metrics.
    for (const row of metricsFor(s, index)) {
      await prisma.annualMetric.upsert({
        where: { siteId_year_metric: { siteId, year: row.year, metric: row.metric } },
        create: { siteId, ...row, source: "import", note: "Donnée fictive de démonstration" },
        update: { value: row.value },
      });
    }
  }
  return SITES.length;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example).");
  const prisma = createPrismaClient(url);
  try {
    const count = await seed(prisma);
    const [sites, metrics] = await Promise.all([prisma.site.count(), prisma.annualMetric.count()]);
    console.log(`Seed terminé : ${count} sites de démonstration (base : ${sites} sites, ${metrics} indicateurs annuels).`);
  } finally {
    await prisma.$disconnect();
  }
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
