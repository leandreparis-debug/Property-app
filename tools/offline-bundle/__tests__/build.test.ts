import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleManifestSchema, parseSha256Sums } from "../../../src/domain/bundle-manifest";
import { enrichmentFileSchema, type ExportedSite } from "../../../src/domain/enrichment-format";
import { buildBundle, bundleName, readSites, sitePositions } from "../build";
import { enrichSites, progressFileName } from "../enrich";
import { fixtureFetch } from "../fixtures";
import { HttpClient, type FetchLike } from "../http";
import { assetFiles } from "../map/assets";
import { latestBuildKey } from "../map/basemap";
import { MbtilesWriter } from "../map/mbtiles";
import { orthoTileUrl } from "../map/ortho";
import { extractArgs } from "../map/pmtiles-cli";
import { sha256File, writeManifest } from "../manifest";
import { PROVIDERS, selectProviders } from "../providers";

const noSleep = { now: () => 0, sleep: async () => {} };

const SITES: ExportedSite[] = [
  { code: "S-1", name: "Entrepôt Fictif Lyon-Est", addressLine: "11 rue de l'Exemple", postalCode: "69800", city: "Saint-Priest", latitude: 45.7106, longitude: 4.9486 },
  { code: "S-2", name: "Entrepôt Fictif Clermont", addressLine: "26 rue de l'Exemple", postalCode: "63510", city: "Aulnat", latitude: null, longitude: null },
  { code: "S-3", name: "Sans adresse", addressLine: null, postalCode: null, city: null, latitude: null, longitude: null },
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vigie-bundle-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const writeSites = (sites: ExportedSite[] = SITES) => {
  const path = join(dir, "sites.json");
  writeFileSync(path, JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), sites }));
  return path;
};

/** Fixture fetch that fails for one host (provider failure). */
const failingFor = (host: string): FetchLike => async (url, init) => {
  if (new URL(url).hostname.includes(host)) throw new Error("connexion refusée");
  return fixtureFetch(url, init);
};

describe("enrichSites", () => {
  it("a provider failure is recorded for that site and provider; the others go on", async () => {
    const http = new HttpClient({ fetch: failingFor("georisques"), clock: noSleep, maxRetries: 0 });
    const file = await enrichSites(SITES, { http, providers: PROVIDERS });
    const s1 = file.sites[0]!.providers;
    expect(s1.georisques).toMatchObject({ status: "error", error: expect.stringContaining("connexion refusée") });
    expect(s1.geocoding!.status).toBe("ok");
    expect(s1.buildings!.status).toBe("ok");
    expect(s1.cadastre!.status).toBe("ok");
    expect(enrichmentFileSchema.safeParse(file).success).toBe(true);
  });

  it("a site with neither address nor coordinates is skipped by every provider", async () => {
    const http = new HttpClient({ fetch: fixtureFetch, clock: noSleep });
    const file = await enrichSites(SITES, { http, providers: PROVIDERS });
    expect(Object.values(file.sites[2]!.providers).map((r) => r.status)).toEqual(Array(PROVIDERS.length).fill("skipped"));
    // S-2 has no coordinates: geocoding feeds the next providers.
    expect(file.sites[1]!.providers.buildings!.status).toBe("ok");
  });

  it("resumes an interrupted build without calling the network again for finished sites", async () => {
    const work = join(dir, "work");
    let calls = 0;
    const counting: FetchLike = async (url, init) => {
      calls++;
      return fixtureFetch(url, init);
    };
    const run = (onSite?: (i: number) => void) =>
      enrichSites(SITES, { http: new HttpClient({ fetch: counting, clock: noSleep, cacheDir: join(work, "cache") }), providers: PROVIDERS, workDir: work, onSite: (_s, i) => onSite?.(i) });

    // First run interrupted after the first site.
    await expect(run((i) => { if (i === 0) throw new Error("interruption"); })).rejects.toThrow("interruption");
    const callsFirstSite = calls;
    expect(readdirSync(join(work, "progress"))).toEqual([progressFileName("S-1")]);

    // Second run: S-1 reloaded from progress, S-2/S-3 fetched.
    const resumed: boolean[] = [];
    const file = await enrichSites(SITES, {
      http: new HttpClient({ fetch: counting, clock: noSleep, cacheDir: join(work, "cache") }),
      providers: PROVIDERS,
      workDir: work,
      onSite: (_s, _i, _t, wasResumed) => void resumed.push(wasResumed),
    });
    expect(resumed).toEqual([true, false, false]);
    expect(file.sites).toHaveLength(3);
    const callsSecondRun = calls - callsFirstSite;

    // Third run: everything comes from progress / cache — zero network call.
    const before = calls;
    rmSync(join(work, "progress"), { recursive: true });
    await run();
    expect(calls).toBe(before);
    expect(callsSecondRun).toBeGreaterThan(0);
  });
});

describe("manifest and SHA256SUMS", () => {
  it("lists every file with size and hash; SHA256SUMS covers the manifest too", async () => {
    const root = join(dir, "b");
    await import("node:fs/promises").then((fs) => fs.mkdir(join(root, "map", "fonts"), { recursive: true }));
    writeFileSync(join(root, "enrichment.json"), "{}");
    writeFileSync(join(root, "map", "fonts", "a.pbf"), Buffer.from([1, 2, 3]));
    const manifest = await writeManifest(root, { name: "b", createdAt: new Date("2026-09-28T00:00:00Z"), sources: [], parameters: { x: 1 } });
    expect(manifest.files.map((f) => f.path)).toEqual(["enrichment.json", "map/fonts/a.pbf"]);
    expect(manifest.totalSize).toBe(5);
    expect(bundleManifestSchema.safeParse(JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))).success).toBe(true);
    const sums = parseSha256Sums(readFileSync(join(root, "SHA256SUMS"), "utf8"));
    expect([...sums.keys()].sort()).toEqual(["enrichment.json", "manifest.json", "map/fonts/a.pbf"]);
    expect(sums.get("manifest.json")).toBe((await sha256File(join(root, "manifest.json"))).sha256);
    expect(sums.get("map/fonts/a.pbf")).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
  });
});

describe("buildBundle --fixtures", () => {
  it("produces vigie-offline-bundle-AAAAMMJJ/ with enrichment.json, map/, manifest.json and SHA256SUMS, offline", async () => {
    const now = () => new Date("2026-09-28T08:00:00Z");
    const logs: string[] = [];
    const result = await buildBundle({ sitesFile: writeSites(), outDir: dir, fixtures: true, skipMap: true, skipOrtho: true, workDir: join(dir, "work"), now, log: (m) => logs.push(m) });
    expect(result.root).toBe(join(dir, "vigie-offline-bundle-20260928"));
    const files = readdirSync(result.root, { recursive: true }).map(String).filter((f) => statSync(join(result.root, f)).isFile()).sort();
    expect(files).toEqual(expect.arrayContaining(["SHA256SUMS", "enrichment.json", "manifest.json", join("map", "LISEZMOI.txt")]));
    const manifest = bundleManifestSchema.parse(JSON.parse(readFileSync(join(result.root, "manifest.json"), "utf8")));
    expect(manifest.parameters).toMatchObject({ fixtures: true, map: "ignoré", ortho: "ignoré" });
    expect(manifest.sources.map((s) => s.id)).toEqual(expect.arrayContaining(["ign-geocoding", "ign-bdtopo", "georisques"]));
    expect(manifest.sources.every((s) => s.licence && s.attribution)).toBe(true);
    const enrichment = enrichmentFileSchema.parse(JSON.parse(readFileSync(join(result.root, "enrichment.json"), "utf8")));
    expect(enrichment.sites.map((s) => s.code)).toEqual(["S-1", "S-2", "S-3"]);
    expect(logs.some((l) => l.includes("0 appel(s) réseau") || l.includes("appel(s) réseau"))).toBe(true);
    expect(readdirSync(dir).some((f) => f.endsWith(".partial"))).toBe(false);
    // Same day again: refused rather than overwritten.
    await expect(buildBundle({ sitesFile: writeSites(), outDir: dir, fixtures: true, workDir: join(dir, "work"), now, log: () => {} })).rejects.toThrow(/existe déjà/);
  });

  it("--providers restricts the providers; an unknown one is refused", async () => {
    const result = await buildBundle({ sitesFile: writeSites(), outDir: dir, fixtures: true, providers: "geocoding,buildings", workDir: join(dir, "w"), log: () => {} });
    expect(Object.keys(result.enrichment.sites[0]!.providers)).toEqual(["geocoding", "buildings"]);
    expect(() => selectProviders("geocoding,meteo")).toThrow(/Fournisseur inconnu : meteo/);
  });

  it("refuses a sites file that is not an export", async () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), sites: [{ code: "A", name: "A", rent: 1 }] }));
    await expect(readSites(path)).rejects.toThrow(/n'est pas un export valide/);
  });

  it("sitePositions: own coordinates, else geocoded, else none", async () => {
    const http = new HttpClient({ fetch: fixtureFetch, clock: noSleep });
    const file = await enrichSites(SITES, { http, providers: selectProviders("geocoding") });
    const positions = sitePositions(SITES, file);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual([4.9486, 45.7106]);
  });

  it("bundleName uses the UTC date", () => {
    expect(bundleName(new Date("2026-01-05T23:30:00Z"))).toBe("vigie-offline-bundle-20260105");
  });
});

describe("map helpers", () => {
  it("latestBuildKey picks the most recent AAAAMMJJ.pmtiles whatever the index shape", () => {
    expect(latestBuildKey([{ key: "20260926.pmtiles", size: 1 }, { key: "20260927.pmtiles" }, { key: "20250101.pmtiles" }])).toBe("20260927.pmtiles");
    expect(latestBuildKey({ builds: ["x/20260101.pmtiles"] })).toBe("20260101.pmtiles");
    expect(latestBuildKey({})).toBeNull();
  });

  it("pmtiles extract arguments", () => {
    expect(extractArgs("https://b.test/20260927.pmtiles", "out.pmtiles", [-5.8, 41.2, 10, 51.5], 14)).toEqual([
      "extract", "https://b.test/20260927.pmtiles", "out.pmtiles", "--bbox=-5.8,41.2,10,51.5", "--maxzoom=14",
    ]);
  });

  it("assets: 3 font stacks × 8 ranges + 4 sprite files, URL-encoded stacks", () => {
    const files = assetFiles();
    expect(files).toHaveLength(28);
    expect(files[0]).toMatchObject({ path: "fonts/Noto Sans Regular/0-255.pbf" });
    expect(files[0]!.url).toContain("Noto%20Sans%20Regular/0-255.pbf");
    expect(files.at(-1)!.path).toBe("sprites/v4/dark@2x.png");
  });

  it("WMTS GetTile URL of the PM_0_19 grid", () => {
    const url = new URL(orthoTileUrl({ z: 17, x: 67000, y: 46000 }));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ LAYER: "ORTHOIMAGERY.ORTHOPHOTOS", TILEMATRIXSET: "PM_0_19", TILEMATRIX: "17", TILECOL: "67000", TILEROW: "46000", FORMAT: "image/jpeg" });
  });

  it("MBTiles writer: TMS rows and metadata", () => {
    const path = join(dir, "t.mbtiles");
    const writer = new MbtilesWriter(path);
    writer.addTile({ z: 15, x: 16598, y: 11273 }, Buffer.from([0xff, 0xd8]));
    writer.addTile({ z: 16, x: 33196, y: 22546 }, Buffer.from([0xff, 0xd8]));
    writer.finish({ name: "t", format: "jpg", attribution: "© IGN" });
    const db = new DatabaseSync(path);
    const rows = db.prepare("SELECT zoom_level z, tile_column x, tile_row y FROM tiles ORDER BY z").all();
    expect(rows).toEqual([{ z: 15, x: 16598, y: 2 ** 15 - 1 - 11273 }, { z: 16, x: 33196, y: 2 ** 16 - 1 - 22546 }]);
    const meta = Object.fromEntries(db.prepare("SELECT name, value FROM metadata").all().map((r) => [r.name, r.value]));
    expect(meta).toMatchObject({ format: "jpg", minzoom: "15", maxzoom: "16", attribution: "© IGN" });
    db.close();
  });
});

describe("isolation", () => {
  it("no file of src/ imports tools/ (the application never reaches the internet)", () => {
    const srcDir = join(__dirname, "..", "..", "..", "src");
    const offenders = readdirSync(srcDir, { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /from\s+["'][^"']*tools\//.test(readFileSync(join(srcDir, f), "utf8")));
    expect(offenders.map((f) => relative(srcDir, join(srcDir, f)))).toEqual([]);
  });
});
