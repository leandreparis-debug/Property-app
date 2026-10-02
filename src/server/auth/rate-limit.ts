/**
 * In-memory sliding-window rate limiter.
 *
 * ⚠ State lives in the process memory: the limit holds for ONE server
 * instance only, and resets on restart. With several instances, move it to a
 * shared store (database table or cache) — see docs/security.md.
 */

/** Outcome of {@link SlidingWindowRateLimiter.hit}. */
export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window (after this one). */
  remaining: number;
  /** Milliseconds until the next attempt is allowed (0 when allowed). */
  retryAfterMs: number;
}

/** Options of {@link SlidingWindowRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum attempts per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Clock (injectable for tests). */
  now?: () => number;
}

/** Sliding-window counter per key (e.g. per IP address). */
export class SlidingWindowRateLimiter {
  readonly limit: number;
  readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  private recent(key: string, at: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter((t) => t > at - this.windowMs);
    if (kept.length === 0) this.hits.delete(key);
    else this.hits.set(key, kept);
    return kept;
  }

  /**
   * Records an attempt for `key` if the window still has room.
   * @param key - Identifier (IP address…).
   * @returns Whether the attempt is allowed, attempts left, and retry delay.
   */
  hit(key: string): RateLimitResult {
    const at = this.now();
    const recent = this.recent(key, at);
    if (recent.length >= this.limit) {
      const oldest = recent[0] ?? at;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + this.windowMs - at) };
    }
    recent.push(at);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterMs: 0 };
  }

  /** Forgets every attempt of `key`. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Drops expired entries of every key (memory housekeeping). */
  prune(): void {
    const at = this.now();
    for (const key of [...this.hits.keys()]) this.recent(key, at);
  }

  /** Number of keys currently tracked. */
  get size(): number {
    return this.hits.size;
  }
}

/** Login attempts allowed per IP address and window. */
export const LOGIN_IP_LIMIT = 20;
/** Window of the per-IP login limit: 15 minutes. */
export const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Creates the per-IP login limiter (20 attempts / 15 min).
 * @param now - Clock (injectable for tests).
 */
export function createLoginIpLimiter(now?: () => number): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter({ limit: LOGIN_IP_LIMIT, windowMs: LOGIN_IP_WINDOW_MS, now });
}
