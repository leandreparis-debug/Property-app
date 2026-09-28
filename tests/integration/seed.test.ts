import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arbitrationDate } from "@/domain/derived";
import { todayDateOnly } from "@/domain/dates";
import { createPrismaClient } from "@/server/prisma";
import { seed } from "../../prisma/seed";
import { testDatabaseUrl } from "./test-db";

const prisma = createPrismaClient(testDatabaseUrl());

async function counts() {
  return {
    sites: await prisma.site.count(),
    externalIds: await prisma.siteExternalId.count(),
    leases: await prisma.lease.count(),
    serviceContracts: await prisma.serviceContract.count(),
    technicals: await prisma.siteTechnical.count(),
    buildingWorks: await prisma.buildingWork.count(),
    icpes: await prisma.siteIcpe.count(),
    icpeHeadings: await prisma.icpeHeading.count(),
    energyProfiles: await prisma.siteEnergyProfile.count(),
    annualMetrics: await prisma.annualMetric.count(),
    users: await prisma.user.count(),
  };
}

beforeAll(async () => {
  await prisma.equipment.deleteMany();
  await prisma.sitePlan.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("seed", () => {
  it("is idempotent: two runs give the same counts", async () => {
    await seed(prisma);
    const first = await counts();
    await seed(prisma);
    expect(await counts()).toEqual(first);

    expect(first.sites).toBe(10);
    expect(first.users).toBe(0);
    expect(first.annualMetrics).toBeGreaterThan(100);
    expect(first.buildingWorks).toBeGreaterThan(0);
    expect(first.icpeHeadings).toBeGreaterThan(0);
  });

  it("covers the required profiles", async () => {
    const sites = await prisma.site.findMany({ include: { lease: true, technical: true }, orderBy: { code: "asc" } });
    expect(sites.map((s) => s.code)).toEqual(Array.from({ length: 10 }, (_, i) => `DEMO-${String(i + 1).padStart(3, "0")}`));
    expect(sites.every((s) => s.name.startsWith("Entrepôt Démo "))).toBe(true);
    expect(sites.some((s) => s.isActive === false)).toBe(true);
    expect(sites.some((s) => s.latitude === null && s.longitude === null)).toBe(true);
    expect(sites.some((s) => s.technical === null && s.portfolio === null)).toBe(true); // partial

    const today = todayDateOnly();
    const sixMonths = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 6, today.getUTCDate()));
    const arbitrations = sites.map((s) => arbitrationDate(s.lease)).filter((d): d is Date => d !== null);
    expect(arbitrations.some((d) => d < today)).toBe(true);
    expect(arbitrations.some((d) => d >= today && d < sixMonths)).toBe(true);

    // Metropolitan France bounding box.
    for (const s of sites.filter((x) => x.latitude !== null)) {
      expect(s.latitude!.toNumber()).toBeGreaterThan(41);
      expect(s.latitude!.toNumber()).toBeLessThan(51.2);
      expect(s.longitude!.toNumber()).toBeGreaterThan(-5.3);
      expect(s.longitude!.toNumber()).toBeLessThan(9.7);
    }
  });
});
