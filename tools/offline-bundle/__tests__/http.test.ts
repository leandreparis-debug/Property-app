import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HttpClient, HttpError, type Clock, type FetchLike } from "../http";
import { USER_AGENT } from "../config";

/** Simulated clock: sleep advances time instantly and records the delays. */
function fakeClock(): Clock & { sleeps: number[]; time: number } {
  const clock = {
    time: 0,
    sleeps: [] as number[],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
  return clock;
}

/** Scripted fetch: returns the statuses in order, records calls. */
function scripted(statuses: number[], headers: Record<string, string> = {}) {
  const calls: { url: string; headers: Record<string, string>; at: number }[] = [];
  let i = 0;
  const make = (clock?: { now(): number }): FetchLike => async (url, init) => {
    calls.push({ url, headers: init.headers, at: clock?.now() ?? 0 });
    const status = statuses[Math.min(i++, statuses.length - 1)]!;
    const body = Buffer.from(JSON.stringify({ ok: status }));
    return {
      status,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? (n.toLowerCase() === "content-type" ? "application/json" : null) },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    };
  };
  return { calls, make };
}

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("HttpClient", () => {
  it("rate limit: 5 req/s per provider → 200 ms apart; providers are independent", async () => {
    const clock = fakeClock();
    const s = scripted([200]);
    const http = new HttpClient({ fetch: s.make(clock), clock, requestsPerSecond: 5 });
    for (let i = 0; i < 4; i++) await http.request("a", `https://x.test/${i}`);
    await http.request("b", "https://x.test/b");
    expect(s.calls.slice(0, 4).map((c) => c.at)).toEqual([0, 200, 400, 600]);
    expect(s.calls[4]!.at).toBe(600); // provider « b » does not wait for « a »
  });

  it("per-provider override of the rate", async () => {
    const clock = fakeClock();
    const s = scripted([200]);
    const http = new HttpClient({ fetch: s.make(clock), clock, rateLimits: { slow: 2 } });
    await http.request("slow", "https://x.test/1");
    await http.request("slow", "https://x.test/2");
    expect(s.calls[1]!.at).toBe(500);
  });

  it("retries on 429 and 503 with exponential back-off, then succeeds", async () => {
    const clock = fakeClock();
    const s = scripted([429, 503, 200]);
    const http = new HttpClient({ fetch: s.make(clock), clock, backoffMs: 1000, requestsPerSecond: 1000 });
    const r = await http.request("p", "https://x.test/");
    expect(r.status).toBe(200);
    expect(s.calls).toHaveLength(3);
    expect(clock.sleeps.filter((ms) => ms >= 1000)).toEqual([1000, 2000]);
  });

  it("Retry-After (seconds) wins over the back-off", async () => {
    const clock = fakeClock();
    const s = scripted([429, 200], { "retry-after": "7" });
    const http = new HttpClient({ fetch: s.make(clock), clock, requestsPerSecond: 1000 });
    await http.request("p", "https://x.test/");
    expect(clock.sleeps).toContain(7000);
  });

  it("gives up after 3 retries (4 attempts) with an HttpError", async () => {
    const clock = fakeClock();
    const s = scripted([503]);
    const http = new HttpClient({ fetch: s.make(clock), clock, requestsPerSecond: 1000 });
    await expect(http.request("p", "https://x.test/")).rejects.toMatchObject({ name: "HttpError", status: 503 });
    expect(s.calls).toHaveLength(4);
  });

  it("does not retry a 400 and does not cache it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vigie-http-"));
    dirs.push(dir);
    const s = scripted([400]);
    const http = new HttpClient({ fetch: s.make(), clock: fakeClock(), cacheDir: dir });
    await expect(http.request("p", "https://x.test/")).rejects.toBeInstanceOf(HttpError);
    await expect(http.request("p", "https://x.test/")).rejects.toBeInstanceOf(HttpError);
    expect(s.calls).toHaveLength(2);
  });

  it("timeout: aborts after timeoutMs, retries, then fails with a French message", async () => {
    let calls = 0;
    const hanging: FetchLike = (_url, init) => {
      calls++;
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const http = new HttpClient({ fetch: hanging, clock: fakeClock(), timeoutMs: 20, maxRetries: 1 });
    await expect(http.request("p", "https://x.test/")).rejects.toThrow(/Délai dépassé \(20 ms\)/);
    expect(calls).toBe(2);
  });

  it("sends the explicit User-Agent", async () => {
    const s = scripted([200]);
    await new HttpClient({ fetch: s.make(), clock: fakeClock() }).request("p", "https://x.test/");
    expect(s.calls[0]!.headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^Vigie-offline-bundle\/\d+\.\d+\.\d+$/);
  });

  it("disk cache: the second client serves 2xx and 404 without network", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vigie-http-"));
    dirs.push(dir);
    const first = scripted([200, 404]);
    const a = new HttpClient({ fetch: first.make(), clock: fakeClock(), cacheDir: dir });
    await a.request("p", "https://x.test/ok");
    await a.request("p", "https://x.test/missing");
    const second = scripted([500]);
    const b = new HttpClient({ fetch: second.make(), clock: fakeClock(), cacheDir: dir });
    const ok = await b.request("p", "https://x.test/ok");
    const missing = await b.getJson("p", "https://x.test/missing");
    expect(ok.fromCache).toBe(true);
    expect(JSON.parse(ok.body.toString())).toEqual({ ok: 200 });
    expect(missing.json).toBeNull();
    expect(second.calls).toHaveLength(0);
    expect(b.networkCalls).toBe(0);
  });
});
