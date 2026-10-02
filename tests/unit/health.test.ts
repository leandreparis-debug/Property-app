import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/server/db", () => ({ db: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));

const { checkDatabase, DATABASE_PROBE_TIMEOUT_MS } = await import("@/server/health");

describe("checkDatabase", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    queryRaw.mockReset();
  });

  it("returns ok when SELECT 1 succeeds", async () => {
    queryRaw.mockResolvedValue([{ ok: 1 }]);
    await expect(checkDatabase()).resolves.toBe("ok");
  });

  it("returns unreachable without leaking the error", async () => {
    queryRaw.mockRejectedValue(new Error("Login failed for user 'sa' on sqlserver://localhost:1433;password=secret"));
    await expect(checkDatabase()).resolves.toBe("unreachable");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/password|secret|sqlserver:\/\//);
  });

  it("gives up after 2 seconds", async () => {
    vi.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => {})); // never settles
    const result = checkDatabase();
    await vi.advanceTimersByTimeAsync(DATABASE_PROBE_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("unreachable");
    expect(DATABASE_PROBE_TIMEOUT_MS).toBe(2000);
  });
});
