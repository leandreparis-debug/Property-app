import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toDateOnly } from "@/domain/dates";
import { createPrismaClient, Prisma } from "@/server/prisma";
import { testDatabaseUrl } from "./test-db";

const prisma = createPrismaClient(testDatabaseUrl());

async function cleanDatabase() {
  // Order matters only for the NoAction relations (plans ↔ documents ↔ equipments).
  await prisma.equipment.deleteMany();
  await prisma.sitePlan.deleteMany();
  await prisma.site.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.user.deleteMany();
}

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

beforeEach(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Site and its relations", () => {
  it("creates a site with every 1-1 relation", async () => {
    const site = await prisma.site.create({
      data: {
        code: "IT-001",
        name: "Entrepôt Test",
        lease: { create: { code: "BAIL-IT-001", noticePeriodMonths: 6 } },
        serviceContract: { create: { hasRealEstateClause: true } },
        technical: { create: { totalWarehouseArea: 12450.5 } },
        icpe: { create: { holder: "Exploitant test" } },
        energyProfile: { create: { referenceYear: 2020 } },
        geometry: { create: { footprintGeoJson: '{"type":"Polygon","coordinates":[]}', source: "manual" } },
        externalIds: { create: [{ system: "QLIK_SENSE", value: "QS-IT-001" }] },
      },
      include: { lease: true, serviceContract: true, technical: true, icpe: true, energyProfile: true, geometry: true },
    });

    expect(site.country).toBe("FR");
    expect(site.version).toBe(1);
    expect(site.archivedAt).toBeNull();
    for (const relation of ["lease", "serviceContract", "technical", "icpe", "energyProfile", "geometry"] as const) {
      expect(site[relation]?.siteId, relation).toBe(site.id);
    }
  });

  it("refuses a second lease on the same site", async () => {
    const site = await prisma.site.create({ data: { code: "IT-002", name: "Test", lease: { create: {} } } });
    await expect(prisma.lease.create({ data: { siteId: site.id } })).rejects.toSatisfy(uniqueViolation);
  });

  it("allows several leases without code but refuses a duplicated code", async () => {
    await prisma.site.create({ data: { code: "IT-003", name: "Test", lease: { create: {} } } });
    await prisma.site.create({ data: { code: "IT-004", name: "Test", lease: { create: {} } } });
    await prisma.site.create({ data: { code: "IT-005", name: "Test", lease: { create: { code: "BAIL-X" } } } });
    await expect(
      prisma.site.create({ data: { code: "IT-006", name: "Test", lease: { create: { code: "BAIL-X" } } } }),
    ).rejects.toSatisfy(uniqueViolation);
    expect(await prisma.lease.count({ where: { code: null } })).toBe(2);
  });

  it("refuses a duplicated site code and external id", async () => {
    const site = await prisma.site.create({ data: { code: "IT-007", name: "Test" } });
    await expect(prisma.site.create({ data: { code: "IT-007", name: "Doublon" } })).rejects.toSatisfy(uniqueViolation);
    await prisma.siteExternalId.create({ data: { siteId: site.id, system: "AL_CODE", value: "AL1" } });
    await expect(
      prisma.siteExternalId.create({ data: { siteId: site.id, system: "AL_CODE", value: "AL2" } }),
    ).rejects.toSatisfy(uniqueViolation);
  });
});

describe("AnnualMetric", () => {
  it("refuses a duplicated (site, year, metric)", async () => {
    const site = await prisma.site.create({ data: { code: "IT-010", name: "Test" } });
    await prisma.annualMetric.create({ data: { siteId: site.id, year: 2024, metric: "RENT", value: 1 } });
    await prisma.annualMetric.create({ data: { siteId: site.id, year: 2025, metric: "RENT", value: 1 } });
    await expect(
      prisma.annualMetric.create({ data: { siteId: site.id, year: 2024, metric: "RENT", value: 2 } }),
    ).rejects.toSatisfy(uniqueViolation);
  });

  it("refuses an invalid source (CHECK constraint)", async () => {
    const site = await prisma.site.create({ data: { code: "IT-011", name: "Test" } });
    await expect(
      prisma.annualMetric.create({ data: { siteId: site.id, year: 2024, metric: "RENT", source: "excel" } }),
    ).rejects.toThrow(/annual_metrics_source_check|CHECK/i);
  });
});

describe("value types", () => {
  it("round-trips Decimals without loss", async () => {
    const site = await prisma.site.create({
      data: {
        code: "IT-020",
        name: "Test",
        latitude: "45.710612",
        longitude: "-0.681049",
        lease: { create: { marketRentValue: "999999999999.99", rentFreeAmount: "0.01" } },
        technical: { create: { totalWarehouseArea: "9999999999.99" } },
        annualMetrics: { create: [{ year: 2024, metric: "ELECTRICITY", value: "99999999999.9999" }] },
      },
      include: { lease: true, technical: true, annualMetrics: true },
    });
    const read = await prisma.site.findUniqueOrThrow({
      where: { id: site.id },
      include: { lease: true, technical: true, annualMetrics: true },
    });
    expect(read.latitude?.toString()).toBe("45.710612");
    expect(read.longitude?.toString()).toBe("-0.681049");
    expect(read.lease?.marketRentValue?.toFixed(2)).toBe("999999999999.99");
    expect(read.lease?.rentFreeAmount?.toFixed(2)).toBe("0.01");
    expect(read.technical?.totalWarehouseArea?.toFixed(2)).toBe("9999999999.99");
    expect(read.annualMetrics[0]?.value?.toFixed(4)).toBe("99999999999.9999");
    expect(read.annualMetrics[0]?.value).toBeInstanceOf(Prisma.Decimal);
  });

  it("stores 18-digit decimals exactly (driver reads are limited to 15 significant digits)", async () => {
    // Known limit of tedious/@prisma/adapter-mssql: DECIMAL is read as a JS double.
    // The database keeps the exact value; see METRIC_VALUE_MAX_ABS and docs/data-model.md.
    // If this canary starts failing because reads became exact, update the docs.
    const site = await prisma.site.create({
      data: { code: "IT-021", name: "Test", annualMetrics: { create: [{ year: 2024, metric: "GAS", value: "12345678901234.5678" }] } },
    });
    const [stored] = await prisma.$queryRaw<{ v: string }[]>`
      SELECT CONVERT(varchar(40), value) AS v FROM annual_metrics WHERE site_id = ${site.id}`;
    expect(stored?.v).toBe("12345678901234.5678");
    const read = await prisma.annualMetric.findFirstOrThrow({ where: { siteId: site.id } });
    expect(read.value?.toFixed(4)).toBe("12345678901234.5680");
  });

  it.each(["Pacific/Kiritimati", "America/Los_Angeles", "UTC"])(
    "round-trips @db.Date without shift (TZ=%s)",
    async (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        const date = toDateOnly(new Date(2026, 2, 12, 23, 30)); // local 12 March, late evening
        const site = await prisma.site.create({
          data: { code: `IT-DATE-${tz}`.slice(0, 50), name: "Test", activityStartDate: date, lease: { create: { noticeDate: toDateOnly("2027-01-01") } } },
          include: { lease: true },
        });
        const read = await prisma.site.findUniqueOrThrow({ where: { id: site.id }, include: { lease: true } });
        expect(read.activityStartDate?.toISOString()).toBe("2026-03-12T00:00:00.000Z");
        expect(read.lease?.noticeDate?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
        const [row] = await prisma.$queryRaw<{ d: string }[]>`
          SELECT CONVERT(varchar(10), activity_start_date, 23) AS d FROM sites WHERE id = ${site.id}`;
        expect(row?.d).toBe("2026-03-12");
      } finally {
        process.env.TZ = previous;
      }
    },
  );
});

describe("deletion", () => {
  it("cascades to every child table but keeps the audit log", async () => {
    const site = await prisma.site.create({
      data: {
        code: "IT-030",
        name: "À supprimer",
        lease: { create: {} },
        serviceContract: { create: {} },
        technical: { create: {} },
        icpe: { create: {} },
        energyProfile: { create: {} },
        geometry: { create: {} },
        externalIds: { create: [{ system: "RAMSES", value: "R-1" }] },
        buildingWorks: { create: [{ kind: "CONSTRUCTION", date: toDateOnly("2004-06-15") }] },
        icpeHeadings: { create: [{ code: "1510", regime: "E" }] },
        annualMetrics: { create: [{ year: 2024, metric: "RENT", value: 1 }] },
        documents: { create: [{ category: "PLAN", storagePath: "sites/IT-030/plan.png", sha256: "a".repeat(64), sizeBytes: 1024n }] },
      },
      include: { documents: true },
    });
    const plan = await prisma.sitePlan.create({
      data: { siteId: site.id, documentId: site.documents[0]!.id, isCurrent: true },
    });
    await prisma.equipment.create({ data: { siteId: site.id, planId: plan.id, type: "SPRINKLER", planX: 10.5, planY: 20.25 } });
    await prisma.auditLog.createMany({
      data: [
        { action: "CREATE", source: "system", entityType: "Site", entityId: site.id, siteId: site.id },
        { action: "UPDATE", source: "ui", entityType: "Lease", entityId: "x", siteId: site.id, field: "code", beforeValue: "null", afterValue: '"B"' },
      ],
    });

    await prisma.site.delete({ where: { id: site.id } });

    const where = { siteId: site.id };
    const counts = await Promise.all([
      prisma.lease.count({ where }),
      prisma.serviceContract.count({ where }),
      prisma.siteTechnical.count({ where }),
      prisma.siteIcpe.count({ where }),
      prisma.siteEnergyProfile.count({ where }),
      prisma.siteGeometry.count({ where }),
      prisma.siteExternalId.count({ where }),
      prisma.buildingWork.count({ where }),
      prisma.icpeHeading.count({ where }),
      prisma.annualMetric.count({ where }),
      prisma.document.count({ where }),
      prisma.sitePlan.count({ where }),
      prisma.equipment.count({ where }),
    ]);
    expect(counts).toEqual(new Array(counts.length).fill(0));
    expect(await prisma.auditLog.count({ where })).toBe(2);
  });
});

describe("CHECK constraints", () => {
  it("refuses an invalid users.role", async () => {
    await expect(prisma.user.create({ data: { email: "a@example.test", role: "superadmin" } })).rejects.toThrow(
      /users_role_check|CHECK/i,
    );
    const user = await prisma.user.create({ data: { email: "b@example.test", role: "editor" } });
    expect(user.role).toBe("editor");
  });

  it("refuses invalid audit_logs.action and audit_logs.source", async () => {
    const base = { entityType: "Site", entityId: "x" };
    await expect(prisma.auditLog.create({ data: { ...base, action: "PURGE", source: "ui" } })).rejects.toThrow(/CHECK/i);
    await expect(prisma.auditLog.create({ data: { ...base, action: "UPDATE", source: "api" } })).rejects.toThrow(/CHECK/i);
    const log = await prisma.auditLog.create({ data: { ...base, action: "LOGIN_FAILED", source: "system" } });
    expect(typeof log.id).toBe("bigint");
  });
});
