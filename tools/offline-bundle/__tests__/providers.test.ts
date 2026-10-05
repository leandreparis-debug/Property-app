/**
 * Parsers of every provider, on the SYNTHETIC fixtures of __fixtures__/
 * (« synthétique — à confirmer par probe »).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enrichmentFileSchema, proposalSchema, type ExportedSite, type Footprint } from "../../../src/domain/enrichment-format";
import { FIXTURE_MARKER, FIXTURES_DIR, instantiate, loadFixture } from "../fixtures";
import { buildingsProvider, parseBuildings, selectBuilding } from "../providers/buildings";
import { cadastreProvider, parseParcels } from "../providers/cadastre";
import { candidatesNamed, companiesProvider, parseCompanies } from "../providers/companies";
import { geocodeProposals, geocodeQuery, geocodingProvider, parseCandidates } from "../providers/geocoding";
import { georisquesProvider, installationUrl, matchInstallation, parseCommuneRisks, parseInstallations, parseRadon, parseSeismicZone } from "../providers/georisques";
import type { RawResult, SiteContext } from "../providers/types";
import { urbanismeProvider } from "../providers/urbanisme";
import type { LonLat } from "../geo";
import { square } from "./geo-tiles.test";

/** Reference point of every template. */
const REF: LonLat = [4.95, 45.7];

/** A fixture with its placeholders filled, at the reference point. */
const fixture = (name: string, vars: Record<string, string> = { seed: "12345", seed2: "54321", insee: "69290" }) => instantiate(loadFixture(name), null, vars);

const site = (over: Partial<ExportedSite> = {}): ExportedSite => ({
  code: "T-1",
  name: "Entrepôt Fictif Lyon-Est",
  addressLine: "12 rue de l'Exemple",
  postalCode: "69800",
  city: "Saint-Priest",
  latitude: null,
  longitude: null,
  ...over,
});

const ctx = (over: Partial<SiteContext> = {}): SiteContext => ({ site: site(), position: REF, inseeCode: "69290", footprint: null, ...over });

const raw = (key: string, json: unknown): RawResult => ({ responses: [{ key, url: "https://x.test/", status: 200, json, fromCache: false }] });

describe("fixtures", () => {
  it("every template is marked synthetic and has a reference point", () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const json = JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Record<string, unknown>;
      expect(json._comment, f).toBe(FIXTURE_MARKER);
      expect(json._referencePoint, f).toEqual(REF);
    }
  });

  it("instantiate moves coordinates and fills placeholders, drops « _ » keys", () => {
    const moved = instantiate({ _referencePoint: [4.95, 45.7], p: [4.951, 45.701], longitude: 4.95, id: "A{{seed}}" }, [5.95, 46.7], { seed: "9" }) as Record<string, unknown>;
    expect(moved._referencePoint).toBeUndefined();
    expect((moved.p as number[])[0]).toBeCloseTo(5.951, 9);
    expect(moved.longitude).toBeCloseTo(5.95, 9);
    expect(moved.id).toBe("A9");
  });
});

describe("geocoding", () => {
  it("builds a query without repeating the postal code and city", () => {
    expect(geocodeQuery(site({ addressLine: "12 rue de l'Exemple, 69800 Saint-Priest" }))).toBe("12 rue de l'Exemple, 69800 Saint-Priest");
    expect(geocodeQuery(site({ addressLine: null, postalCode: null, city: null }))).toBeNull();
  });

  it("parses candidates best score first", () => {
    const c = parseCandidates(fixture("geocode-search.json"));
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ score: 0.93, type: "housenumber", citycode: "69290", postcode: "69800" });
  });

  it("site without coordinates: lat/lon, INSEE and postal code proposed with confidence = score", () => {
    const parsed = geocodingProvider.parse(raw("search", fixture("geocode-search.json")), ctx({ position: null }));
    expect(parsed.status).toBe("ok");
    expect(parsed.proposals.map((p) => p.target)).toEqual(["Site.latitude", "Site.longitude", "Site.communeInseeCode", "Site.postalCode"]);
    expect(parsed.proposals.every((p) => p.confidence === 0.93)).toBe(true);
    for (const p of parsed.proposals) expect(proposalSchema.safeParse(p).success).toBe(true);
  });

  const best = parseCandidates(fixture("geocode-search.json"))[0]!;

  it("score below 0.8: nothing proposed", () => {
    expect(geocodeProposals({ ...best, score: 0.79 }, null).proposals).toEqual([]);
  });

  it("type municipality: INSEE code only, no coordinates, no postal code", () => {
    expect(geocodeProposals({ ...best, type: "municipality" }, null).proposals.map((p) => p.target)).toEqual(["Site.communeInseeCode"]);
  });

  it("type street is accepted for coordinates", () => {
    expect(geocodeProposals({ ...best, type: "street" }, null).proposals.map((p) => p.target)).toContain("Site.latitude");
  });

  it("existing coordinates within 500 m: no coordinates proposal (no false divergence)", () => {
    const near: LonLat = [best.lonLat[0] + 0.003, best.lonLat[1]]; // ≈ 233 m
    const r = geocodeProposals(best, near);
    expect(r.distanceM).toBeGreaterThan(200);
    expect(r.distanceM).toBeLessThan(500);
    expect(r.proposals.map((p) => p.target)).not.toContain("Site.latitude");
  });

  it("existing coordinates beyond 500 m: coordinates proposed (divergence) with the distance in evidence", () => {
    const far: LonLat = [best.lonLat[0] + 0.01, best.lonLat[1]]; // ≈ 780 m
    const r = geocodeProposals(best, far);
    expect(r.distanceM).toBeGreaterThan(500);
    const lat = r.proposals.find((p) => p.target === "Site.latitude");
    expect(lat?.evidence).toMatch(/à \d+ m des coordonnées actuelles/);
    const parsed = geocodingProvider.parse(raw("search", fixture("geocode-search.json")), ctx({ site: site({ latitude: far[1], longitude: far[0] }) }));
    expect(parsed.data).toMatchObject({ divergent: true });
  });

  it("reverse geocoding gives the INSEE code only", () => {
    const parsed = geocodingProvider.parse(raw("reverse", fixture("geocode-reverse.json")), ctx({ site: site({ addressLine: null, postalCode: null, city: null, latitude: 45.7, longitude: 4.95 }) }));
    expect(parsed.proposals.map((p) => p.target)).toEqual(["Site.communeInseeCode"]);
  });

  it("no result → not_found; nothing to query → skipped", () => {
    expect(geocodingProvider.parse(raw("search", { type: "FeatureCollection", features: [] }), ctx()).status).toBe("not_found");
    expect(geocodingProvider.parse({ skipped: "x", responses: [] }, ctx()).status).toBe("skipped");
  });

  it("contribute: the site's own coordinates win over the geocoded ones", () => {
    const parsed = geocodingProvider.parse(raw("search", fixture("geocode-search.json")), ctx({ position: null }));
    expect(geocodingProvider.contribute!(parsed, ctx({ position: null })).position).not.toBeNull();
    expect(geocodingProvider.contribute!(parsed, ctx({ position: [1, 45] })).position).toEqual([1, 45]);
    expect(geocodingProvider.contribute!(parsed, ctx({ inseeCode: null })).inseeCode).toBe("69290");
  });
});

describe("buildings", () => {
  const json = fixture("wfs-batiment.json");

  it("the building CONTAINING the point wins over the larger one", () => {
    const candidates = parseBuildings(json, REF);
    expect(candidates).toHaveLength(3);
    const largest = [...candidates].sort((a, b) => b.areaM2 - a.areaM2)[0]!;
    const chosen = selectBuilding(candidates)!;
    expect(chosen.selection).toBe("contains");
    expect(chosen.building.id).toBe("BATIMENT0000000240000001");
    expect(largest.id).not.toBe(chosen.building.id);
  });

  it("no building contains the point: the largest within 250 m, lower confidence", () => {
    const away: LonLat = [REF[0], REF[1] + 0.0009]; // ≈ 100 m north of building 1
    const parsed = buildingsProvider.parse(raw("wfs", json), ctx({ position: away }));
    expect(parsed.data).toMatchObject({ selection: "largest", sourceRef: "BDTOPO_V3:batiment/BATIMENT0000000240000003" });
    expect(parsed.proposals[0]!.confidence).toBeLessThan(0.8);
  });

  it("produces footprint, height (0 = unknown ignored), sourceRef and area", () => {
    const parsed = buildingsProvider.parse(raw("wfs", json), ctx());
    expect(parsed.proposals.map((p) => p.target)).toEqual(["SiteGeometry.footprintGeoJson", "SiteGeometry.heightM"]);
    expect(parsed.proposals[1]!.value).toBe(12.5);
    expect(parsed.data?.areaM2).toBeGreaterThan(23_500);
    expect(parsed.data?.areaM2).toBeLessThan(24_500);
    const zeroHeight = parseBuildings(json, REF).find((b) => b.id === "BATIMENT0000000240000003");
    expect(zeroHeight?.heightM).toBeNull();
  });

  it("MultiPolygon with several parts, Polygon, and 3D coordinates are accepted", () => {
    const multi = { type: "MultiPolygon", coordinates: [square(4.95, 45.7, 50).coordinates, square(4.9505, 45.7, 20).coordinates] };
    const poly3d = { type: "Polygon", coordinates: (square(4.951, 45.7005, 30).coordinates as number[][][]).map((r) => r.map((p) => [...p, 210])) };
    const candidates = parseBuildings({ features: [{ geometry: multi, properties: { cleabs: "M" } }, { geometry: poly3d, properties: { cleabs: "P" } }] }, REF);
    expect(candidates.map((c) => c.id)).toEqual(["M", "P"]);
    expect(candidates[0]!.containsPoint).toBe(true);
    expect((candidates[1]!.footprint.coordinates as number[][][])[0]![0]).toHaveLength(2);
  });

  it("an answer in (lat, lon) order is swapped back", () => {
    const sq = square(4.95, 45.7, 40) as Footprint & { coordinates: number[][][] };
    const swapped = { type: "Polygon", coordinates: sq.coordinates.map((r) => r.map(([x, y]) => [y, x])) };
    const [c] = parseBuildings({ features: [{ geometry: swapped, properties: {} }] }, REF);
    expect(c?.containsPoint).toBe(true);
  });

  it("no building → not_found; no position → skipped", () => {
    expect(buildingsProvider.parse(raw("wfs", { features: [] }), ctx()).status).toBe("not_found");
    expect(buildingsProvider.parse({ skipped: "x", responses: [] }, ctx({ position: null })).status).toBe("skipped");
  });
});

describe("georisques", () => {
  const installations = parseInstallations(fixture("georisques-installations.json"));

  it("parses installations with their headings (camelCase fields)", () => {
    expect(installations).toHaveLength(2);
    expect(installations[0]).toMatchObject({ id: "0006112345", name: "LOGISTIQUE FICTIVE SAS", regime: "Enregistrement" });
    expect(installations[0]!.headings.map((h) => h.code)).toEqual(["1510", "2925", "4331"]);
  });

  it("also accepts snake_case fields", () => {
    const parsed = parseInstallations({ data: [{ code_aiot: "X1", raison_sociale: "ABC", longitude: 4.95, latitude: 45.7, rubriques: [{ numero_rubrique: "1510", regime_autorise_alinea: "A" }] }] });
    expect(parsed[0]).toMatchObject({ id: "X1", name: "ABC", headings: [{ code: "1510", regime: "A" }] });
  });

  it("match by distance (< 200 m)", () => {
    const { match, nearby } = matchInstallation(installations, ctx());
    expect(nearby[0]!.distanceM).toBeLessThan(200);
    expect(match).toMatchObject({ byDistance: true, byName: false, confidence: 0.8 });
  });

  it("match by name only (installation far away) has a lower confidence", () => {
    const far = installations.map((i) => ({ ...i, lonLat: [REF[0] + 0.008, REF[1]] as LonLat }));
    const { match } = matchInstallation(far, ctx({ site: site({ name: "Logistique Fictive Saint-Priest" }) }));
    expect(match).toMatchObject({ byName: true, byDistance: false, confidence: 0.7 });
  });

  it("name AND distance → 0.9; neither → no match", () => {
    expect(matchInstallation(installations, ctx({ site: site({ name: "LOGISTIQUE FICTIVE" }) })).match?.confidence).toBe(0.9);
    const far = installations.map((i) => ({ ...i, lonLat: [REF[0] + 0.008, REF[1]] as LonLat }));
    expect(matchInstallation(far, ctx()).match).toBeNull();
  });

  it("distance to the FOOTPRINT when known", () => {
    const footprint = square(REF[0] + 0.0006, REF[1], 100); // point of the installation inside the footprint
    const { nearby } = matchInstallation(installations, ctx({ footprint }));
    expect(nearby[0]!.distanceM).toBe(0);
  });

  it("commune risks, seismic zone, radon", () => {
    expect(parseCommuneRisks(fixture("georisques-risques.json"))).toEqual(["Inondation", "Séisme", "Transport de marchandises dangereuses"]);
    expect(parseSeismicZone(fixture("georisques-zonage-sismique.json"))).toEqual({ code: "3", label: "3 - Modérée" });
    expect(parseRadon(fixture("georisques-radon.json"))).toBe("1");
    expect(parseSeismicZone({ data: [] })).toBeNull();
  });

  it("full parse: georisquesUrl proposal and public data", () => {
    const r: RawResult = {
      responses: [
        { key: "installations", url: "u", status: 200, json: fixture("georisques-installations.json"), fromCache: false },
        { key: "risks", url: "u", status: 200, json: fixture("georisques-risques.json"), fromCache: false },
        { key: "seismic", url: "u", status: 200, json: fixture("georisques-zonage-sismique.json"), fromCache: false },
        { key: "radon", url: "u", status: 200, json: fixture("georisques-radon.json"), fromCache: false },
      ],
    };
    const parsed = georisquesProvider.parse(r, ctx());
    expect(parsed.proposals).toEqual([expect.objectContaining({ target: "SiteIcpe.georisquesUrl", value: installationUrl("0006112345") })]);
    expect(Object.keys(parsed.publicData).sort()).toEqual(["communeRisks", "icpeNearby", "radonClass", "seismicZone"]);
    expect((parsed.data?.match as { headings: unknown[] }).headings).toHaveLength(3);
  });
});

describe("P2 providers", () => {
  it("cadastre: parcels and total area", () => {
    const parcels = parseParcels(fixture("apicarto-cadastre-parcelle.json"));
    expect(parcels.map((p) => p.idu)).toEqual(["69290000AB0012", "69290000AB0013"]);
    const parsed = cadastreProvider.parse(raw("parcels", fixture("apicarto-cadastre-parcelle.json")), ctx());
    expect(parsed.publicData.parcelsTotalAreaM2).toBe(68_000);
    expect(parsed.proposals).toEqual([]);
  });

  it("urbanisme: zones", () => {
    const parsed = urbanismeProvider.parse(raw("zones", fixture("apicarto-gpu-zone-urba.json")), ctx());
    expect(parsed.publicData.urbanZones).toEqual([expect.objectContaining({ label: "UX", zoneType: "U" })]);
  });

  it("companies: candidates sorted by distance, matched by name", () => {
    const candidates = parseCompanies(fixture("recherche-entreprises-near-point.json"), ctx());
    expect(candidates.map((c) => c.siren)).toEqual(["000000001", "000000002"]);
    expect(candidates[0]!.distanceM).toBeLessThan(100);
    expect(candidatesNamed(candidates, "Logistique Fictive").map((c) => c.siren)).toEqual(["000000001"]);
    const parsed = companiesProvider.parse(raw("nearPoint", fixture("recherche-entreprises-near-point.json")), ctx());
    expect(parsed.proposals).toEqual([]);
    expect(parsed.publicData.companyCandidates).toHaveLength(2);
  });
});

describe("every parsed result fits the shared enrichment schema", () => {
  it("assembled into an enrichment file", () => {
    const providers = {
      geocoding: geocodingProvider.parse(raw("search", fixture("geocode-search.json")), ctx({ position: null })),
      buildings: buildingsProvider.parse(raw("wfs", fixture("wfs-batiment.json")), ctx()),
      cadastre: cadastreProvider.parse(raw("parcels", fixture("apicarto-cadastre-parcelle.json")), ctx()),
    };
    const file = {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      generator: "test",
      sites: [{ code: "T-1", providers: Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, { ...v, fetchedAt: new Date().toISOString() }])) }],
    };
    expect(enrichmentFileSchema.safeParse(file).success).toBe(true);
  });
});
