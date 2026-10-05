import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arbitrationDate } from "@/domain/derived";
import { todayDateOnly } from "@/domain/dates";
import { createAuditedPrismaClient } from "@/server/prisma";
import { seed } from "../../prisma/seed";
import { raw, resetDatabase } from "./helpers";
import { testDatabaseUrl } from "./test-db";

const audited = createAuditedPrismaClient(testDatabaseUrl());

async function counts() {
  return {
    sites: await raw.site.count(),
    externalIds: await raw.siteExternalId.count(),
    leases: await raw.lease.count(),
    serviceContracts: await raw.serviceContract.count(),
    technicals: await raw.siteTechnical.count(),
    buildingWorks: await raw.buildingWork.count(),
    icpes: await raw.siteIcpe.count(),
    icpeHeadings: await raw.icpeHeading.count(),
    energyProfiles: await raw.siteEnergyProfile.count(),
    annualMetrics: await raw.annualMetric.count(),
    users: await raw.user.count(),
  };
}

beforeAll(resetDatabase);
afterAll(async () => {
  await audited.$disconnect();
  await raw.$disconnect();
});

describe("seed", () => {
  it("is idempotent: two runs give the same counts and no new audit line", async () => {
    await seed(audited);
    const first = await counts();
    const auditAfterFirst = await raw.auditLog.count();
    await seed(audited);
    expect(await counts()).toEqual(first);
    expect(await raw.auditLog.count()).toBe(auditAfterFirst);

    expect(first.sites).toBe(10);
    expect(first.users).toBe(0);
    expect(first.annualMetrics).toBeGreaterThan(100);
    expect(first.buildingWorks).toBeGreaterThan(0);
    expect(first.icpeHeadings).toBeGreaterThan(0);
  });

  it("is audited: one CREATE line per created record, source system", async () => {
    const total = Object.values(await counts()).reduce((a, b) => a + b, 0);
    const lines = await raw.auditLog.groupBy({ by: ["action", "source"], _count: true });
    expect(lines).toEqual([{ action: "CREATE", source: "system", _count: total }]);
    expect(await raw.auditLog.count({ where: { entityType: "Site", siteId: { not: null } } })).toBe(10);
  });

  it("covers the required profiles", async () => {
    const sites = await raw.site.findMany({ include: { lease: true, technical: true }, orderBy: { code: "asc" } });
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

    for (const s of sites.filter((x) => x.latitude !== null)) {
      expect(s.latitude!.toNumber()).toBeGreaterThan(41);
      expect(s.latitude!.toNumber()).toBeLessThan(51.2);
      expect(s.longitude!.toNumber()).toBeGreaterThan(-5.3);
      expect(s.longitude!.toNumber()).toBeLessThan(9.7);
    }
  });
});
