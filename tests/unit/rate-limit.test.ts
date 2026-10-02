import { describe, expect, it } from "vitest";
import { createLoginIpLimiter, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS, SlidingWindowRateLimiter } from "@/server/auth/rate-limit";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("SlidingWindowRateLimiter", () => {
  it("allows up to the limit, then refuses", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 1000, now: c.now });
    expect(limiter.hit("a")).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(limiter.hit("a").remaining).toBe(1);
    expect(limiter.hit("a").remaining).toBe(0);
    const refused = limiter.hit("a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBe(1000);
  });

  it("slides: attempts leave the window one by one", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1000, now: c.now });
    limiter.hit("a"); // t=0
    c.advance(600);
    limiter.hit("a"); // t=600
    expect(limiter.hit("a").allowed).toBe(false);
    c.advance(399); // t=999: the first attempt is still inside
    expect(limiter.hit("a").allowed).toBe(false);
    c.advance(1); // t=1000: the first attempt left the window
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
  });

  it("does not count refused attempts", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    limiter.hit("a");
    for (let i = 0; i < 5; i++) limiter.hit("a");
    c.advance(1000);
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("resets a key", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    limiter.hit("a");
    expect(limiter.hit("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("keeps IP addresses independent", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    expect(limiter.hit("10.0.0.1").allowed).toBe(true);
    expect(limiter.hit("10.0.0.1").allowed).toBe(false);
    expect(limiter.hit("10.0.0.2").allowed).toBe(true);
  });

  it("prunes expired keys", () => {
    const c = clock();
    const limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 1000, now: c.now });
    limiter.hit("a");
    limiter.hit("b");
    expect(limiter.size).toBe(2);
    c.advance(1000);
    limiter.prune();
    expect(limiter.size).toBe(0);
  });

  it("login limiter: 20 attempts per 15 minutes", () => {
    const c = clock();
    const limiter = createLoginIpLimiter(c.now);
    expect([LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS]).toEqual([20, 900_000]);
    for (let i = 0; i < 20; i++) expect(limiter.hit("ip").allowed).toBe(true);
    expect(limiter.hit("ip").allowed).toBe(false);
    c.advance(15 * 60 * 1000);
    expect(limiter.hit("ip").allowed).toBe(true);
  });
});
