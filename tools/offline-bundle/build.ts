/**
 * `bundle:build` and `bundle:probe` — the two commands of the offline-bundle
 * tool (argument parsing lives in cli.ts).
 */
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sitesExportSchema, type EnrichmentFile, type ExportedSite } from "../../src/domain/enrichment-format";
import { MAP_DEFAULTS, PROVIDER_RATE_LIMITS, SOURCES, TOOL_VERSION } from "./config";
import { enrichSites, initialContext, statusSummary } from "./enrich";
import { fixtureFetch } from "./fixtures";
import type { LonLat } from "./geo";
import { HttpClient, type FetchLike } from "./http";
import { downloadAssets, writePlaceholderAssets, assetFiles } from "./map/assets";
import { buildBasemap, resolveLatestBuildUrl } from "./map/basemap";
import { buildOrtho, orthoTileUrl } from "./map/ortho";
import { detectPmtiles, PMTILES_INSTALL_HELP } from "./map/pmtiles-cli";
import { formatBytes, writeManifest } from "./manifest";
import { selectProviders } from "./providers";
import { lonLatToTile } from "./tiles";

/** Logger (console by default; silenced in tests). */
export type Log = (message: string) => void;

/**
 * Reads and validates `sites.json`.
 * @throws {Error} With a French message when the file is not a Vigie export.
 */
export async function readSites(path: string): Promise<ExportedSite[]> {
  const json = JSON.parse(await readFile(path, "utf8")) as unknown;
  const parsed = sitesExportSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`${path} n'est pas un export valide de « pnpm enrichment:export-sites » : ${parsed.error.issues[0]?.message ?? "format inattendu"}.`);
  }
  return parsed.data.sites;
}

/** Bundle directory name for a date (UTC): vigie-offline-bundle-AAAAMMJJ. */
export function bundleName(date: Date): string {
  return `vigie-offline-bundle-${date.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** Options of {@link buildBundle}. */
export interface BuildOptions {
  sitesFile: string;
  outDir: string;
  providers?: string;
  skipMap?: boolean;
  skipOrtho?: boolean;
  maxzoom?: number;
  orthoRadius?: number;
  fixtures?: boolean;
  /** Working directory (HTTP cache, progress): resume after interruption. */
  workDir?: string;
  /** Explicit basemap source (else the latest daily build). */
  basemapUrl?: string;
  now?: () => Date;
  /** Injected fetch (tests). */
  fetch?: FetchLike;
  log?: Log;
}

/** Result of a build. */
export interface BuildResult {
  root: string;
  totalSize: number;
  enrichment: EnrichmentFile;
  warnings: string[];
}

/** Site positions for the imagery: own coordinates, else geocoded. */
export function sitePositions(sites: readonly ExportedSite[], enrichment: EnrichmentFile): LonLat[] {
  const byCode = new Map(enrichment.sites.map((s) => [s.code, s]));
  const out: LonLat[] = [];
  for (const site of sites) {
    const own = initialContext(site).position;
    if (own) {
      out.push(own);
      continue;
    }
    const proposals = byCode.get(site.code)?.providers.geocoding?.proposals ?? [];
    const lat = proposals.find((p) => p.target === "Site.latitude")?.value;
    const lon = proposals.find((p) => p.target === "Site.longitude")?.value;
    if (typeof lat === "number" && typeof lon === "number") out.push([lon, lat]);
  }
  return out;
}

/**
 * Builds the bundle `vigie-offline-bundle-AAAAMMJJ/` in `outDir`.
 * The bundle is assembled in « <name>.partial » and renamed when complete.
 */
export async function buildBundle(options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const fixtures = options.fixtures === true;
  const skipMap = fixtures || options.skipMap === true;
  const skipOrtho = fixtures || options.skipOrtho === true;
  const maxzoom = options.maxzoom ?? MAP_DEFAULTS.maxzoom;
  const orthoRadius = options.orthoRadius ?? MAP_DEFAULTS.orthoRadiusM;
  const providers = selectProviders(options.providers);
  const warnings: string[] = [];
  if (fixtures && (!options.skipMap || !options.skipOrtho)) {
    warnings.push("Mode --fixtures : fond de carte et orthophotographies ignorés (aucun accès réseau).");
  }

  const sites = await readSites(options.sitesFile);
  const name = bundleName(startedAt);
  const root = join(options.outDir, name);
  const partial = `${root}.partial`;
  if (await access(root).then(() => true, () => false)) {
    throw new Error(`${root} existe déjà : le déplacer ou le supprimer avant de relancer.`);
  }

  // Fail fast when the map needs pmtiles and it is missing.
  if (!skipMap || !skipOrtho) {
    const version = await detectPmtiles();
    if (!version) throw new Error(PMTILES_INSTALL_HELP);
    log(`pmtiles : ${version}`);
  }

  const workDir = options.workDir ?? ".bundle-work";
  const http = new HttpClient({
    fetch: options.fetch ?? (fixtures ? fixtureFetch : undefined),
    cacheDir: join(workDir, fixtures ? "http-cache-fixtures" : "http-cache"),
    rateLimits: PROVIDER_RATE_LIMITS,
    requestsPerSecond: fixtures ? 1000 : undefined,
    clock: fixtures ? { now: () => Date.now(), sleep: async () => {} } : undefined,
  });

  await mkdir(join(partial, "map"), { recursive: true });

  // 1. Enrichment.
  log(`Enrichissement de ${sites.length} site(s) — fournisseurs : ${providers.map((p) => p.name).join(", ")}${fixtures ? " (FIXTURES synthétiques)" : ""}`);
  const enrichment = await enrichSites(sites, {
    http,
    providers,
    workDir: join(workDir, fixtures ? "progress-fixtures" : "progress"),
    now,
    onSite: (site, index, total, resumed) => {
      const failed = Object.entries(site.providers).filter(([, r]) => r.status === "error").map(([n]) => n);
      log(`  [${index + 1}/${total}] ${site.code}${resumed ? " (repris)" : ""}${failed.length ? ` — échec : ${failed.join(", ")}` : ""}`);
    },
  });
  await writeFile(join(partial, "enrichment.json"), JSON.stringify(enrichment, null, 2) + "\n");
  const summary = statusSummary(enrichment);
  for (const [provider, counts] of Object.entries(summary)) {
    log(`  ${provider} : ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(", ")}`);
  }

  // 2. Map.
  const mapDir = join(partial, "map");
  const parameters: Record<string, unknown> = {
    toolVersion: TOOL_VERSION,
    fixtures,
    providers: providers.map((p) => p.name),
    sites: sites.length,
    map: skipMap ? "ignoré" : { maxzoom },
    ortho: skipOrtho ? "ignoré" : { radiusM: orthoRadius, minZoom: MAP_DEFAULTS.orthoMinZoom, maxZoom: MAP_DEFAULTS.orthoMaxZoom },
    providerStatus: summary,
  };
  const sourceIds = new Set(providers.flatMap((p) => p.sources));
  if (fixtures) {
    await writePlaceholderAssets(mapDir);
  }
  if (!skipMap) {
    log(`Polices et symboles (${assetFiles().length} fichiers)…`);
    const assets = await downloadAssets(http, mapDir);
    log(`  ${assets.files} fichiers, ${formatBytes(assets.bytes)}`);
    log(`Fond de carte France (zoom ≤ ${maxzoom})…`);
    const basemap = await buildBasemap({ http, output: join(mapDir, "france.pmtiles"), maxzoom, sourceUrl: options.basemapUrl });
    log(`  ${basemap.sourceUrl} → ${formatBytes(basemap.bytes)}`);
    parameters.map = { maxzoom, sourceUrl: basemap.sourceUrl, bytes: basemap.bytes };
    sourceIds.add("protomaps-osm").add("protomaps-assets");
  }
  if (!skipOrtho) {
    const centers = sitePositions(sites, enrichment);
    log(`Orthophotographies : ${centers.length} site(s), rayon ${orthoRadius} m, zooms ${MAP_DEFAULTS.orthoMinZoom}–${MAP_DEFAULTS.orthoMaxZoom}…`);
    const ortho = await buildOrtho({
      http,
      centers,
      radiusM: orthoRadius,
      minZoom: MAP_DEFAULTS.orthoMinZoom,
      maxZoom: MAP_DEFAULTS.orthoMaxZoom,
      mbtilesPath: join(workDir, "ortho-sites.mbtiles"),
      output: join(mapDir, "ortho-sites.pmtiles"),
      attribution: SOURCES.find((s) => s.id === "ign-ortho")?.attribution ?? "© IGN",
      onProgress: (done, total) => log(`  tuiles ${done}/${total}`),
    });
    log(`  ${ortho.tilesWritten} tuiles (${ortho.tilesMissing} absentes), ${formatBytes(ortho.bytes)}`);
    parameters.ortho = { radiusM: orthoRadius, minZoom: MAP_DEFAULTS.orthoMinZoom, maxZoom: MAP_DEFAULTS.orthoMaxZoom, ...ortho };
    sourceIds.add("ign-ortho");
  }

  // 3. Manifest, checksums, size.
  const manifest = await writeManifest(partial, {
    name,
    createdAt: startedAt,
    sources: SOURCES.filter((s) => sourceIds.has(s.id)),
    parameters,
  });
  if (manifest.totalSize > MAP_DEFAULTS.targetBundleBytes) {
    warnings.push(`Taille ${formatBytes(manifest.totalSize)} au-delà de l'objectif de ${formatBytes(MAP_DEFAULTS.targetBundleBytes)} : réduire --maxzoom ou --ortho-radius.`);
  }
  await rename(partial, root);
  log(`Paquet prêt : ${root} (${formatBytes(manifest.totalSize)}, ${manifest.files.length} fichiers, ${http.networkCalls} appel(s) ${fixtures ? "simulé(s) — aucun accès réseau" : "réseau"})`);
  for (const w of warnings) log(`⚠ ${w}`);
  return { root, totalSize: manifest.totalSize, enrichment, warnings };
}

/** Options of {@link probe}. */
export interface ProbeOptions {
  sitesFile: string;
  limit?: number;
  outDir?: string;
  providers?: string;
  /** Also probe the map endpoints (builds index, one WMTS tile, one glyph range). */
  map?: boolean;
  fetch?: FetchLike;
  log?: Log;
}

/**
 * `bundle:probe`: calls the REAL services (no cache) for the first sites and
 * writes every raw response to `probe-output/`, to confirm the formats
 * against the synthetic fixtures.
 */
export async function probe(options: ProbeOptions): Promise<string> {
  const log = options.log ?? ((m: string) => console.log(m));
  const outDir = options.outDir ?? "probe-output";
  const sites = (await readSites(options.sitesFile)).slice(0, options.limit ?? 1);
  const providers = selectProviders(options.providers);
  const http = new HttpClient({ fetch: options.fetch, rateLimits: PROVIDER_RATE_LIMITS });
  await rm(outDir, { recursive: true, force: true });

  for (const site of sites) {
    const dir = join(outDir, encodeURIComponent(site.code));
    await mkdir(dir, { recursive: true });
    let ctx = initialContext(site);
    for (const provider of providers) {
      try {
        const raw = await provider.fetch(ctx, http);
        for (const r of raw.responses) {
          await writeFile(join(dir, `${provider.name}.${r.key}.json`), JSON.stringify({ url: r.url, status: r.status, json: r.json }, null, 2));
        }
        const parsed = provider.parse(raw, ctx);
        await writeFile(join(dir, `${provider.name}.parsed.json`), JSON.stringify(parsed, null, 2));
        if (provider.contribute) ctx = { ...ctx, ...provider.contribute(parsed, ctx) };
        log(`${site.code} ${provider.name} : ${parsed.status} (${raw.responses.map((r) => `${r.key} HTTP ${r.status}`).join(", ") || raw.skipped})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeFile(join(dir, `${provider.name}.error.txt`), message);
        log(`${site.code} ${provider.name} : ÉCHEC — ${message}`);
      }
    }
  }

  if (options.map !== false) {
    const dir = join(outDir, "_map");
    await mkdir(dir, { recursive: true });
    const attempt = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
        log(`carte ${label} : ok`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeFile(join(dir, `${label}.error.txt`), message);
        log(`carte ${label} : ÉCHEC — ${message}`);
      }
    };
    await attempt("builds", async () => {
      await writeFile(join(dir, "latest-build.txt"), (await resolveLatestBuildUrl(http)) + "\n");
    });
    const first = sites.map((s) => initialContext(s).position).find((p) => p !== null);
    if (first) {
      await attempt("ortho", async () => {
        const url = orthoTileUrl(lonLatToTile(first, MAP_DEFAULTS.orthoMaxZoom));
        const r = await http.request("ortho", url, { headers: { Accept: "image/jpeg, image/*" } });
        await writeFile(join(dir, "ortho-tile.json"), JSON.stringify({ url, status: r.status, contentType: r.contentType, bytes: r.body.length }, null, 2));
        if (r.status === 200) await writeFile(join(dir, "ortho-tile.jpg"), r.body);
      });
    }
    await attempt("assets", async () => {
      const file = assetFiles()[0]!;
      const r = await http.request("assets", file.url);
      await writeFile(join(dir, "font-sample.json"), JSON.stringify({ url: file.url, status: r.status, bytes: r.body.length }, null, 2));
    });
  }
  log(`Réponses brutes enregistrées dans ${outDir}/ (${http.networkCalls} appel(s) réseau).`);
  return outDir;
}
