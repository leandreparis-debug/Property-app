/**
 * Provider contract of the offline-bundle tool.
 *
 * A provider has two halves, kept apart so every parser is testable offline:
 * - `fetch(ctx, http)` performs the HTTP calls (through the shared, cached
 *   {@link HttpClient}) and returns the RAW responses;
 * - `parse(raw, ctx)` is PURE: raw responses → data, proposals, public data.
 *
 * Providers run in a fixed order for each site; `contribute` lets one feed the
 * next (geocoded position → buildings → footprint → Géorisques, cadastre…).
 */
import type { ExportedSite, Footprint, Proposal } from "../../../src/domain/enrichment-format";
import type { LonLat } from "../geo";
import type { HttpClient } from "../http";

/** Names of the providers (keys of `providers` in enrichment.json). */
export const PROVIDER_NAMES = ["geocoding", "buildings", "georisques", "cadastre", "urbanisme", "companies"] as const;

/** A provider name. */
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** What is known about a site while its providers run. */
export interface SiteContext {
  site: ExportedSite;
  /** Best known position: the site's own coordinates, else the geocoded ones. */
  position: LonLat | null;
  /** Commune INSEE code found by geocoding. */
  inseeCode: string | null;
  /** Building footprint found by the buildings provider. */
  footprint: Footprint | null;
}

/** One raw HTTP response kept for parsing (and written by `probe`). */
export interface RawEntry {
  /** Logical name inside the provider (e.g. « installations », « radon »). */
  key: string;
  url: string;
  status: number;
  /** Decoded JSON body; `null` for a 404. */
  json: unknown;
  fromCache: boolean;
}

/** Raw result of one provider for one site. */
export interface RawResult {
  /** Set when a prerequisite is missing: the provider is reported `skipped`. */
  skipped?: string;
  responses: RawEntry[];
}

/** Parsed result (the `error` field is filled by the orchestrator on failure). */
export interface ParsedResult {
  status: "ok" | "not_found" | "skipped";
  data: Record<string, unknown> | null;
  proposals: Proposal[];
  /** Informative data for `site_public_data` (key → JSON value). */
  publicData: Record<string, unknown>;
  error?: string;
}

/** A provider. */
export interface Provider {
  name: ProviderName;
  /** Delivery priority (P1 first). */
  priority: "P1" | "P2";
  /** Source ids (config SOURCES) this provider relies on. */
  sources: readonly string[];
  /** HTTP calls → raw responses. May throw (the orchestrator records the error). */
  fetch(ctx: SiteContext, http: HttpClient): Promise<RawResult>;
  /** Pure parsing. */
  parse(raw: RawResult, ctx: SiteContext): ParsedResult;
  /** Context update for the next providers. */
  contribute?(parsed: ParsedResult, ctx: SiteContext): Partial<SiteContext>;
}

/**
 * Fetches a JSON document and wraps it as a {@link RawEntry}.
 * @param http - Shared client.
 * @param provider - Rate-limit bucket.
 * @param key - Logical name.
 * @param url - Full URL.
 */
export async function fetchEntry(http: HttpClient, provider: string, key: string, url: string): Promise<RawEntry> {
  const { json, raw } = await http.getJson(provider, url);
  return { key, url, status: raw.status, json, fromCache: raw.fromCache };
}

/** Finds a raw entry by key. */
export function entry(raw: RawResult, key: string): RawEntry | undefined {
  return raw.responses.find((r) => r.key === key);
}

/** A skipped result. */
export function skipped(reason: string): ParsedResult {
  return { status: "skipped", data: { reason }, proposals: [], publicData: {} };
}

/** Narrowing helpers for untrusted JSON. */
export const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null;
export const asNumber = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** First defined value among several field spellings (camelCase vs snake_case). */
export function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (record[k] !== undefined && record[k] !== null) return record[k];
  return undefined;
}

/** Rounds to `digits` decimals. */
export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
