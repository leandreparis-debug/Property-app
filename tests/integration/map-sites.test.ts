import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDateOnly } from "@/domain/dates";
import { getMapSites } from "@/server/map/sites";
import { disconnectAll, raw, resetDatabase } from "./helpers";

const TODAY = toDateOnly("2026-09-28")!;
const d = (iso: string) => toDateOnly(iso)!;

/** A complete site: compliant unless overridden. */
async function site(code: string, over: { lease?: Record<string, unknown>; site?: Record<string, unknown>; archived?: boolean; footprint?: boolean } = {}) {
  const created = await raw.site.create({
    data: {
      code,
      name: `Entrepôt ${code}`,
      isActive: true,
      addressLine: "1 rue de l'Exemple",
      postalCode: "69800",
      city: "Saint-Priest",
      departmentCode: "69",
      region: "Auvergne-Rhône-Alpes",
      portfolio: "Portefeuille",
      typology: "Entrepôt",
      latitude: 45.7,
      longitude: 4.95,
      archivedAt: over.archived ? new Date() : null,
      ...over.site,
      lease: {
        create: { code: `B-${code}`, holdingEntity: "SCI", endDate: d("2035-12-31"), nextExitDate: d("2032-12-31"), noticeDate: d("2032-06-30"), noticePeriodMonths: 6, renewalConditionsSigned: false, ...over.lease } as never,
      },
      technical: { create: { totalWarehouseArea: 20000, landArea: 50000, socialOfficeArea: 800, dockCount: 30 } },
      icpe: { create: { holder: "Exploitant" } },
      icpeHeadings: { create: [{ code: "1510", regime: "E" }] },
      ...(over.footprint
        ? { geometry: { create: { footprintGeoJson: JSON.stringify({ type: "Polygon", coordinates: [[[4.95, 45.7], [4.951, 45.7], [4.951, 45.701], [4.95, 45.701], [4.95, 45.7]]] }), heightM: null } } }
        : {}),
    },
  });
  return created.id;
}

beforeAll(async () => {
  await resetDatabase();
  await site("OK-1", { footprint: true });
  await site("WARN-1", { site: { city: null } });
  await site("CRIT-1", { lease: { noticeDate: d("2026-10-15") } });
  await site("INACTIVE-1", { site: { isActive: false } });
  await site("ARCHIVED-1", { archived: true, lease: { noticeDate: d("2026-10-15") } });
  await site("NOPOS-1", { site: { latitude: null, longitude: null } });
});

afterAll(disconnectAll);

describe("getMapSites", () => {
  it("covers every status, excludes archived sites, lists unlocated ones", async () => {
    const data = await getMapSites(TODAY);
    const codes = data.points.features.map((f) => f.properties.code).sort();
    expect(codes).toEqual(["CRIT-1", "INACTIVE-1", "OK-1", "WARN-1"]);
    expect(data.unlocated.map((u) => u.code)).toEqual(["NOPOS-1"]);
    expect(data.counts).toEqual({ ok: 2, warning: 1, critical: 1, unknown: 1 });
    const status = Object.fromEntries(data.points.features.map((f) => [f.properties.code, f.properties.status]));
    expect(status).toEqual({ "OK-1": "ok", "WARN-1": "warning", "CRIT-1": "critical", "INACTIVE-1": "unknown" });
    expect(JSON.stringify(data)).not.toContain("ARCHIVED-1");
  });

  it("critical reasons with detail; footprint with default height", async () => {
    const data = await getMapSites(TODAY);
    const crit = data.points.features.find((f) => f.properties.code === "CRIT-1")!.properties;
    expect(crit.reasons[0]).toMatchObject({ ruleId: "LEASE_ARBITRATION_OVERDUE", severity: "critical" });
    expect(crit.reasons.map((r) => r.ruleId)).toContain("LEASE_NOTICE_IMMINENT");
    expect(data.footprints.features).toHaveLength(1);
    expect(data.footprints.features[0]!.properties).toMatchObject({ code: "OK-1", heightM: 12, heightEstimated: true });
    expect(data.points.features.find((f) => f.properties.code === "OK-1")!.properties.hasFootprint).toBe(true);
  });
});
