import { describe, expect, it } from "vitest";
import type { EnrichmentFile, ProviderResult } from "@/domain/enrichment-format";
import { NO_PRESERVATION, type PreservationIndex } from "@/server/import/plan";
import { planEnrichment, type EnrichmentSiteState } from "@/server/enrichment/plan";
import { changesCsv, divergencesCsv } from "@/server/enrichment/report";

const AT = "2026-09-28T08:00:00.000Z";
const square = { type: "Polygon" as const, coordinates: [[[4.9, 45.7], [4.901, 45.7], [4.901, 45.701], [4.9, 45.701], [4.9, 45.7]]] };

const state = (over: Partial<EnrichmentSiteState> = {}): EnrichmentSiteState => ({
  id: "site1",
  code: "SMP-001",
  archived: false,
  site: { latitude: null, longitude: null, communeInseeCode: null, postalCode: null },
  geometry: null,
  icpe: null,
  icpeHeadingCodes: [],
  technical: null,
  publicData: new Map(),
  ...over,
});

const result = (over: Partial<ProviderResult>): ProviderResult => ({ status: "ok", fetchedAt: AT, data: {}, proposals: [], publicData: {}, ...over });

const file = (providers: Record<string, ProviderResult>, code = "SMP-001"): EnrichmentFile => ({
  formatVersion: 1,
  generatedAt: AT,
  generator: "test",
  sites: [{ code, providers }],
});

const geocoding = (confidence = 0.93) =>
  result({
    proposals: [
      { target: "Site.latitude", value: 45.7001234, confidence, evidence: "BAN" },
      { target: "Site.longitude", value: 4.9004321, confidence, evidence: "BAN" },
      { target: "Site.communeInseeCode", value: "69290", confidence, evidence: "BAN" },
      { target: "Site.postalCode", value: "69800", confidence, evidence: "BAN" },
    ],
  });

const plan = (f: EnrichmentFile, s: EnrichmentSiteState, p: PreservationIndex = NO_PRESERVATION) => planEnrichment(f, new Map([[s.code.toUpperCase(), s]]), p);

describe("planEnrichment", () => {
  it("EMPTY fields: applied, coordinates rounded to 6 decimals, coordinatesSource = enrichment", () => {
    const p = plan(file({ geocoding: geocoding() }), state());
    expect(p.counts.applied).toBe(4);
    expect(p.writes[0]!.site).toEqual({ latitude: 45.700123, longitude: 4.900432, communeInseeCode: "69290", postalCode: "69800", coordinatesSource: "enrichment" });
  });

  it("EQUAL values: nothing to write", () => {
    const s = state({ site: { latitude: 45.700123, longitude: 4.900432, communeInseeCode: "69290", postalCode: "69800" } });
    const p = plan(file({ geocoding: geocoding() }), s);
    expect(p.counts.unchanged).toBe(4);
    expect(p.writes).toEqual([]);
  });

  it("DIFFERENT value: divergence, listed, never applied", () => {
    const s = state({ site: { latitude: 45.8, longitude: 4.95, communeInseeCode: "69123", postalCode: null } });
    const p = plan(file({ geocoding: geocoding() }), s);
    expect(p.counts.divergence).toBe(3);
    expect(p.writes[0]!.site).toEqual({ postalCode: "69800" });
    const csv = divergencesCsv(p.lines);
    expect(csv.startsWith("﻿code;champ;valeur actuelle;valeur proposée;source;preuve\r\n")).toBe(true);
    expect(csv).toContain("SMP-001;Site.communeInseeCode;69123;69290;geocoding;BAN");
  });

  it("PRESERVED: empty field last written from the interface is left alone and counted", () => {
    const preservation: PreservationIndex = { isFieldPreserved: (_m, _id, field) => field === "postalCode", isRecordPreserved: () => false };
    const p = plan(file({ geocoding: geocoding() }), state(), preservation);
    expect(p.counts.preserved).toBe(1);
    expect(p.writes[0]!.site).not.toHaveProperty("postalCode");
    expect(changesCsv(p.lines)).toContain("préservé (modifié dans Vigie)");
  });

  it("low confidence: not applied", () => {
    const p = plan(file({ geocoding: geocoding(0.79) }), state());
    expect(p.counts.low_confidence).toBe(4);
    expect(p.writes).toEqual([]);
  });

  it("latitude and longitude only go together", () => {
    const p = plan(file({ geocoding: geocoding() }), state({ site: { latitude: null, longitude: 4.9, communeInseeCode: null, postalCode: null } }));
    expect(p.lines.find((l) => l.target === "Site.latitude")!.outcome).toBe("incomplete_pair");
    expect(p.lines.find((l) => l.target === "Site.longitude")!.outcome).toBe("divergence");
    expect(p.writes[0]!.site).not.toHaveProperty("latitude");
    expect(p.writes[0]!.site).not.toHaveProperty("coordinatesSource");
  });

  it("footprint on a missing SiteGeometry: created with source, sourceRef and fetchedAt; same footprint later = unchanged", () => {
    const buildings = result({
      data: { sourceRef: "BDTOPO_V3:batiment/B1", areaM2: 24000 },
      proposals: [
        { target: "SiteGeometry.footprintGeoJson", value: square, confidence: 0.9, evidence: "BD TOPO" },
        { target: "SiteGeometry.heightM", value: 12.5, confidence: 0.9, evidence: "BD TOPO" },
      ],
    });
    const p = plan(file({ buildings }), state());
    expect(p.writes[0]!.geometry).toEqual({
      id: null,
      data: { footprintGeoJson: JSON.stringify(square), source: "enrichment", sourceRef: "BDTOPO_V3:batiment/B1", fetchedAt: new Date(AT), heightM: 12.5 },
    });
    const again = plan(file({ buildings }), state({ geometry: { id: "g1", footprintGeoJson: JSON.stringify(square), heightM: 12.5 } }));
    expect(again.counts.unchanged).toBe(2);
    expect(again.writes).toEqual([]);
  });

  it("georisquesUrl on a missing SiteIcpe: created", () => {
    const georisques = result({ proposals: [{ target: "SiteIcpe.georisquesUrl", value: "https://example.test/i/1", confidence: 0.8, evidence: "ICPE" }] });
    expect(plan(file({ georisques }), state()).writes[0]!.icpe).toEqual({ id: null, data: { georisquesUrl: "https://example.test/i/1" } });
  });

  it("public data: written when new or changed, skipped when identical", () => {
    const georisques = result({ publicData: { radonClass: "1", seismicZone: { code: "3" } } });
    const s = state({ publicData: new Map([["georisques|radonClass", { id: "p1", valueJson: '"1"' }], ["georisques|seismicZone", { id: "p2", valueJson: '{"code":"2"}' }]]) });
    const p = plan(file({ georisques }), s);
    expect(p.counts).toMatchObject({ publicDataWritten: 1, publicDataUnchanged: 1 });
    expect(p.writes[0]!.publicData).toEqual([{ id: "p2", provider: "georisques", key: "seismicZone", valueJson: '{"code":"3"}', fetchedAt: new Date(AT) }]);
  });

  it("proposals of a provider in error are ignored; errors are counted", () => {
    const p = plan(file({ geocoding: { ...geocoding(), status: "error", error: "HTTP 503" } }), state());
    expect(p.writes).toEqual([]);
    expect(p.counts.providerErrors).toBe(1);
  });

  it("unknown and archived codes are reported, not written", () => {
    expect(plan(file({ geocoding: geocoding() }, "XXX"), state()).unknownCodes).toEqual(["XXX"]);
    expect(plan(file({ geocoding: geocoding() }), state({ archived: true })).archivedCodes).toEqual(["SMP-001"]);
  });

  it("checks: area gap > 30 %, ICPE headings differences", () => {
    const providers = {
      buildings: result({ data: { areaM2: 24000 } }),
      cadastre: result({ publicData: { parcelsTotalAreaM2: 60000 } }),
      georisques: result({ data: { match: { id: "0006", headings: [{ code: "1510" }, { code: "2925" }] } } }),
    };
    const s = state({ technical: { totalWarehouseArea: 48000, landArea: 62000 }, icpeHeadingCodes: ["1510", "4331"] });
    const checks = plan(file(providers), s).checks;
    expect(checks.map((c) => c.check)).toEqual(["surface bâtie", "rubriques ICPE"]);
    expect(checks[0]!.message).toContain("50 %");
    expect(checks[1]!.message).toBe("absentes de Vigie : 2925 ; absentes de Géorisques : 4331 (installation 0006)");
  });
});
