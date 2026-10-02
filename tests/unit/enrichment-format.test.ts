import { describe, expect, it } from "vitest";
import { formatSha256Sums, parseSha256Sums } from "@/domain/bundle-manifest";
import { ENRICHMENT_TARGETS, exportedSiteSchema, parseEnrichmentFile } from "@/domain/enrichment-format";

const square = { type: "Polygon", coordinates: [[[4.9, 45.7], [4.901, 45.7], [4.901, 45.701], [4.9, 45.701], [4.9, 45.7]]] };

const validFile = () => ({
  formatVersion: 1,
  generatedAt: "2026-09-28T08:00:00.000Z",
  generator: "Vigie-offline-bundle/1.0.0",
  sites: [
    {
      code: "SMP-001",
      providers: {
        geocoding: {
          status: "ok",
          fetchedAt: "2026-09-28T08:00:00.000Z",
          data: { score: 0.93 },
          proposals: [
            { target: "Site.latitude", value: 45.7, confidence: 0.93, evidence: "BAN" },
            { target: "Site.communeInseeCode", value: "2A004", confidence: 0.93, evidence: "BAN" },
          ],
        },
        buildings: {
          status: "ok",
          fetchedAt: "2026-09-28T08:00:00.000Z",
          data: null,
          proposals: [{ target: "SiteGeometry.footprintGeoJson", value: square, confidence: 0.9, evidence: "BD TOPO" }],
          publicData: {},
        },
        georisques: { status: "error", fetchedAt: null, data: null, proposals: [], error: "HTTP 503" },
      },
    },
  ],
});

describe("enrichment.json schema", () => {
  it("accepts a valid file (publicData defaults to {})", () => {
    const file = parseEnrichmentFile(validFile());
    expect(file.sites[0]!.providers.geocoding!.publicData).toEqual({});
  });

  it("refuses a target outside the closed list", () => {
    const f = validFile();
    f.sites[0]!.providers.geocoding!.proposals.push({ target: "Lease.annualRent", value: 1, confidence: 1, evidence: "x" } as never);
    expect(() => parseEnrichmentFile(f)).toThrow(/Fichier d'enrichissement invalide/);
  });

  it("refuses an incompatible format version with a French message", () => {
    expect(() => parseEnrichmentFile({ ...validFile(), formatVersion: 2 })).toThrow(/Version de format non prise en charge \(attendue : 1\)/);
  });

  it("checks the value type of each target", () => {
    const bad = (target: string, value: unknown) => {
      const f = validFile();
      f.sites[0]!.providers.geocoding!.proposals = [{ target, value, confidence: 0.9, evidence: "x" } as never];
      return () => parseEnrichmentFile(f);
    };
    expect(bad("Site.latitude", 95)).toThrow();
    expect(bad("Site.postalCode", "6980")).toThrow(/code postal/);
    expect(bad("Site.communeInseeCode", "ABCDE")).toThrow(/INSEE/);
    expect(bad("SiteGeometry.footprintGeoJson", { type: "Point", coordinates: [4.9, 45.7] })).toThrow();
    expect(bad("SiteIcpe.georisquesUrl", "pas une url")).toThrow();
    expect(bad("SiteGeometry.heightM", 12.5)).not.toThrow();
  });

  it("refuses a confidence outside 0–1 and an unknown status", () => {
    const f = validFile();
    f.sites[0]!.providers.geocoding!.proposals[0]!.confidence = 1.2;
    expect(() => parseEnrichmentFile(f)).toThrow();
    const g = validFile();
    (g.sites[0]!.providers.geocoding as { status: string }).status = "partial";
    expect(() => parseEnrichmentFile(g)).toThrow();
  });

  it("closed list of 7 targets", () => {
    expect(ENRICHMENT_TARGETS).toHaveLength(7);
  });
});

describe("sites.json export", () => {
  it("is strict: no other field may leave the network", () => {
    const site = { code: "A", name: "A", addressLine: null, postalCode: null, city: null, latitude: null, longitude: null };
    expect(exportedSiteSchema.safeParse(site).success).toBe(true);
    expect(exportedSiteSchema.safeParse({ ...site, annualRent: 1 }).success).toBe(false);
  });
});

describe("SHA256SUMS", () => {
  it("round trip, sorted, sha256sum-compatible (binary marker accepted)", () => {
    const h = "a".repeat(64);
    const text = formatSha256Sums([{ path: "map/b", sha256: h }, { path: "a.json", sha256: h }]);
    expect(text).toBe(`${h}  a.json\n${h}  map/b\n`);
    expect([...parseSha256Sums(text).keys()]).toEqual(["a.json", "map/b"]);
    expect(parseSha256Sums(`${h} *x.bin\n`).get("x.bin")).toBe(h);
    expect(() => parseSha256Sums("zz  x\n")).toThrow(/ligne 1/);
  });
});
