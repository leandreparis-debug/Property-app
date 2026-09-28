/**
 * Shared HTTP client of the offline-bundle tool: per-provider rate limit,
 * retries with exponential back-off on 429 and 5xx, timeout, explicit
 * User-Agent, and a DISK CACHE of raw responses so an interrupted build
 * resumes without calling the services again.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HTTP_DEFAULTS, USER_AGENT } from "./config";

/** A raw HTTP response (as cached). */
export interface RawResponse {
  url: string;
  status: number;
  contentType: string | null;
  /** Body as bytes (base64 in the cache file). */
  body: Buffer;
  /** True when served from the disk cache. */
  fromCache: boolean;
}

/** Minimal fetch signature (injectable: tests, fixtures mode). */
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; method?: string; body?: string }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Clock abstraction (tests use a simulated clock). */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Real clock. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Options of {@link HttpClient}. */
export interface HttpClientOptions {
  fetch?: FetchLike;
  clock?: Clock;
  /** Cache directory; no cache when omitted. */
  cacheDir?: string;
  requestsPerSecond?: number;
  maxRetries?: number;
  backoffMs?: number;
  timeoutMs?: number;
  /** Per-provider rate overrides. */
  rateLimits?: Readonly<Record<string, number>>;
  userAgent?: string;
}

/** Raised when a request fails for good (after retries). */
export class HttpError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

/** Statuses kept in the cache: successes and definitive « not found ». */
const CACHEABLE = (status: number) => (status >= 200 && status < 300) || status === 404;

/**
 * Cache key of a request.
 * @param method - HTTP method.
 * @param url - Full URL.
 * @param body - Request body, if any.
 */
export function cacheKey(method: string, url: string, body?: string): string {
  return createHash("sha256").update(`${method} ${url}\n${body ?? ""}`).digest("hex");
}

/** Shared HTTP client (one instance per build). */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly clock: Clock;
  private readonly options: Required<Omit<HttpClientOptions, "fetch" | "clock" | "cacheDir" | "rateLimits">> & {
    cacheDir?: string;
    rateLimits: Readonly<Record<string, number>>;
  };
  /** Next allowed start time per provider. */
  private readonly nextSlot = new Map<string, number>();
  /** Number of network calls actually made (not served by the cache). */
  networkCalls = 0;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.clock = options.clock ?? systemClock;
    this.options = {
      cacheDir: options.cacheDir,
      requestsPerSecond: options.requestsPerSecond ?? HTTP_DEFAULTS.requestsPerSecond,
      maxRetries: options.maxRetries ?? HTTP_DEFAULTS.maxRetries,
      backoffMs: options.backoffMs ?? HTTP_DEFAULTS.backoffMs,
      timeoutMs: options.timeoutMs ?? HTTP_DEFAULTS.timeoutMs,
      rateLimits: options.rateLimits ?? {},
      userAgent: options.userAgent ?? USER_AGENT,
    };
  }

  /** Waits for the next rate-limit slot of `provider`. */
  private async throttle(provider: string): Promise<void> {
    const rps = this.options.rateLimits[provider] ?? this.options.requestsPerSecond;
    const interval = 1000 / Math.max(rps, 0.001);
    const now = this.clock.now();
    const slot = Math.max(now, this.nextSlot.get(provider) ?? 0);
    this.nextSlot.set(provider, slot + interval);
    if (slot > now) await this.clock.sleep(slot - now);
  }

  private cachePath(key: string): string | null {
    return this.options.cacheDir ? join(this.options.cacheDir, key.slice(0, 2), `${key}.json`) : null;
  }

  private async readCache(key: string): Promise<RawResponse | null> {
    const path = this.cachePath(key);
    if (!path) return null;
    try {
      const entry = JSON.parse(await readFile(path, "utf8")) as { url: string; status: number; contentType: string | null; body: string };
      return { url: entry.url, status: entry.status, contentType: entry.contentType, body: Buffer.from(entry.body, "base64"), fromCache: true };
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, response: RawResponse): Promise<void> {
    const path = this.cachePath(key);
    if (!path) return;
    await mkdir(join(path, ".."), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify({ url: response.url, status: response.status, contentType: response.contentType, body: response.body.toString("base64") }));
    await rename(tmp, path); // atomic: an interrupted write never leaves a corrupt entry
  }

  /**
   * GET (or POST) with cache, rate limit, retries and timeout.
   * @param provider - Provider name (rate-limit bucket).
   * @param url - Full URL.
   * @param init - Optional method, body and extra headers.
   * @returns The raw response (2xx or 404; other statuses throw).
   * @throws {HttpError} After the retries, on timeout or network failure.
   */
  async request(
    provider: string,
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<RawResponse> {
    const method = init.method ?? "GET";
    const key = cacheKey(method, url, init.body);
    const cached = await this.readCache(key);
    if (cached) return cached;

    let attempt = 0;
    for (;;) {
      await this.throttle(provider);
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.options.timeoutMs);
      let status: number | null = null;
      let retryAfterMs: number | null = null;
      try {
        this.networkCalls++;
        const response = await this.fetchImpl(url, {
          method,
          body: init.body,
          headers: { "User-Agent": this.options.userAgent, Accept: "application/json, */*", ...init.headers },
          signal: controller.signal,
        });
        status = response.status;
        if (!RETRYABLE(status)) {
          const body = Buffer.from(await response.arrayBuffer());
          const raw: RawResponse = { url, status, contentType: response.headers.get("content-type"), body, fromCache: false };
          if (!CACHEABLE(status)) throw new HttpError(`HTTP ${status} pour ${url}`, status);
          await this.writeCache(key, raw);
          return raw;
        }
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter && /^\d+$/.test(retryAfter)) retryAfterMs = Number(retryAfter) * 1000;
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (!timedOut && !(error instanceof Error)) throw error;
        if (attempt >= this.options.maxRetries) {
          throw new HttpError(timedOut ? `Délai dépassé (${this.options.timeoutMs} ms) pour ${url}` : `Échec réseau pour ${url} : ${(error as Error).message}`, null);
        }
      } finally {
        clearTimeout(timer);
      }
      if (status !== null && attempt >= this.options.maxRetries) {
        throw new HttpError(`HTTP ${status} pour ${url} après ${attempt + 1} tentative(s)`, status);
      }
      await this.clock.sleep(retryAfterMs ?? this.options.backoffMs * 2 ** attempt);
      attempt++;
    }
  }

  /** GET JSON (2xx); `null` on 404. */
  async getJson<T = unknown>(provider: string, url: string): Promise<{ json: T | null; raw: RawResponse }> {
    const raw = await this.request(provider, url);
    if (raw.status === 404) return { json: null, raw };
    try {
      return { json: JSON.parse(raw.body.toString("utf8")) as T, raw };
    } catch {
      throw new HttpError(`Réponse non JSON pour ${url}`, raw.status);
    }
  }
}

/**
 * Builds a URL with query parameters (undefined values skipped).
 * @param base - Endpoint.
 * @param params - Query parameters.
 */
export function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}
