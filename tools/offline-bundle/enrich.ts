/**
 * Enrichment orchestrator: runs the providers for each site and assembles
 * `enrichment.json`.
 *
 * Fault tolerance: a provider failure is recorded (status « error ») for that
 * site and provider; the build goes on.
 *
 * Resume: raw responses are cached by the HTTP client, and each finished site
 * is written to `<workDir>/progress/<code>.json`. A rerun after an
 * interruption reloads finished sites without any network call and resumes
 * with the next one.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ENRICHMENT_FORMAT_VERSION,
  enrichmentFileSchema,
  providerResultSchema,
  type EnrichmentFile,
  type ExportedSite,
  type ProviderResult,
} from "../../src/domain/enrichment-format";
import { USER_AGENT } from "./config";
import type { HttpClient } from "./http";
import type { Provider, SiteContext } from "./providers/types";

/** Result of one site. */
export type SiteEnrichment = EnrichmentFile["sites"][number];

/** Options of {@link enrichSites}. */
export interface EnrichOptions {
  http: HttpClient;
  providers: readonly Provider[];
  /** Progress directory (resume); no resume when omitted. */
  workDir?: string;
  /** Clock for `fetchedAt` / `generatedAt`. */
  now?: () => Date;
  /** Called after each site (progress display; an exception aborts the build). */
  onSite?: (site: SiteEnrichment, index: number, total: number, resumed: boolean) => void | Promise<void>;
}

/** Initial context of a site. */
export function initialContext(site: ExportedSite): SiteContext {
  return {
    site,
    position: site.latitude !== null && site.longitude !== null ? [site.longitude, site.latitude] : null,
    inseeCode: null,
    footprint: null,
  };
}

/** Safe file name for a site code. */
export function progressFileName(code: string): string {
  return `${encodeURIComponent(code).replace(/%/g, "_")}.json`;
}

/**
 * Runs every provider for one site, in order.
 * @returns The site's providers map.
 */
export async function enrichSite(site: ExportedSite, options: Pick<EnrichOptions, "http" | "providers" | "now">): Promise<SiteEnrichment> {
  const now = options.now ?? (() => new Date());
  let ctx = initialContext(site);
  const providers: Record<string, ProviderResult> = {};
  for (const provider of options.providers) {
    try {
      const raw = await provider.fetch(ctx, options.http);
      const parsed = provider.parse(raw, ctx);
      providers[provider.name] = {
        status: parsed.status,
        fetchedAt: raw.skipped ? null : now().toISOString(),
        data: parsed.data,
        proposals: parsed.proposals,
        publicData: parsed.publicData,
        ...(parsed.error ? { error: parsed.error } : {}),
      };
      if (provider.contribute) ctx = { ...ctx, ...provider.contribute(parsed, ctx) };
    } catch (error) {
      providers[provider.name] = {
        status: "error",
        fetchedAt: now().toISOString(),
        data: null,
        proposals: [],
        publicData: {},
        error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      };
    }
    // Every result must satisfy the shared schema (defence against a parser bug).
    const check = providerResultSchema.safeParse(providers[provider.name]);
    if (!check.success) {
      providers[provider.name] = {
        status: "error",
        fetchedAt: now().toISOString(),
        data: null,
        proposals: [],
        publicData: {},
        error: `Résultat invalide : ${check.error.issues[0]?.message ?? "?"}`,
      };
    }
  }
  return { code: site.code, providers };
}

async function readProgress(path: string): Promise<SiteEnrichment | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as SiteEnrichment;
  } catch {
    return null;
  }
}

/**
 * Enriches every site (sequentially: the rate limit is the bottleneck anyway).
 * @returns The validated `enrichment.json` content.
 */
export async function enrichSites(sites: readonly ExportedSite[], options: EnrichOptions): Promise<EnrichmentFile> {
  const now = options.now ?? (() => new Date());
  const progressDir = options.workDir ? join(options.workDir, "progress") : null;
  if (progressDir) await mkdir(progressDir, { recursive: true });
  const providerKey = options.providers.map((p) => p.name).join(",");

  const results: SiteEnrichment[] = [];
  for (const [index, site] of sites.entries()) {
    const path = progressDir ? join(progressDir, progressFileName(site.code)) : null;
    const saved = path ? await readProgress(path) : null;
    // Resume only when the saved site was built with the same providers.
    const reusable = saved && saved.code === site.code && Object.keys(saved.providers).join(",") === providerKey;
    const result = reusable ? saved : await enrichSite(site, options);
    if (path && !reusable) {
      await writeFile(`${path}.tmp`, JSON.stringify(result));
      await rename(`${path}.tmp`, path);
    }
    results.push(result);
    await options.onSite?.(result, index, sites.length, !!reusable);
  }
  return enrichmentFileSchema.parse({
    formatVersion: ENRICHMENT_FORMAT_VERSION,
    generatedAt: now().toISOString(),
    generator: USER_AGENT,
    sites: results,
  });
}

/** Counts per provider and status (console summary, manifest). */
export function statusSummary(file: EnrichmentFile): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {};
  for (const site of file.sites) {
    for (const [name, result] of Object.entries(site.providers)) {
      const bucket = (summary[name] ??= {});
      bucket[result.status] = (bucket[result.status] ?? 0) + 1;
    }
  }
  return summary;
}
