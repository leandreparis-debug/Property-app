import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWithAuditContext } from "@/server/audit/context";
import { authenticate, INVALID_CREDENTIALS, lockDurationMs, TOO_MANY_ATTEMPTS } from "@/server/auth/login";
import { createLoginIpLimiter } from "@/server/auth/rate-limit";
import {
  createSession,
  hashSessionToken,
  invalidateSession,
  purgeExpiredSessions,
  validateSession,
} from "@/server/auth/session";
import { resetPassword, setUserActive } from "@/server/auth/users";
import { createUserFixture, disconnectAll, raw, resetDatabase, TEST_PASSWORD } from "./helpers";

const EMAIL = "camille.test@atlas.local";
const MIN = 60_000;
const T0 = new Date("2026-06-01T08:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Fresh limiter per call site, so the per-IP limit never interferes. */
const login = (password: string, now: Date = T0, email = EMAIL) =>
  authenticate(email, password, "10.0.0.1", { now, limiter: createLoginIpLimiter(), userAgent: "vitest" });

const system = <T>(fn: () => Promise<T>) => runWithAuditContext({ actorId: null, source: "system" }, fn);

let userId: string;
beforeEach(async () => {
  await resetDatabase();
  userId = await createUserFixture(EMAIL);
});
afterAll(disconnectAll);

describe("login", () => {
  it("creates a session and stores only the token hash", async () => {
    const result = await login(TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(result.user).toEqual({ id: userId, email: EMAIL, name: "Utilisateur Test", role: "viewer" });
    const sessions = await raw.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe(hashSessionToken(result.token));
    expect(sessions[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sessions)).not.toContain(result.token);
    expect(sessions[0]).toMatchObject({ userId, ipAddress: "10.0.0.1", userAgent: "vitest" });

    const user = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastLoginAt?.toISOString()).toBe(T0.toISOString());
  });

  it("normalises the email (case, spaces)", async () => {
    expect((await login(TEST_PASSWORD, T0, "  Camille.TEST@atlas.local ")).ok).toBe(true);
  });

  it("increments the counter on a wrong password", async () => {
    expect(await login("mauvais mot de passe")).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(await login("mauvais mot de passe")).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    const user = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLoginCount).toBe(2);
    expect(user.lockedUntil).toBeNull();
    expect(await raw.session.count()).toBe(0);
  });

  it("locks after 5 failures and refuses the right password during the lock", async () => {
    for (let i = 0; i < 5; i++) await login("mauvais mot de passe", at(i * 1000));
    const user = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLoginCount).toBe(5);
    expect(user.lockedUntil?.toISOString()).toBe(at(4000 + 15 * MIN).toISOString());

    expect(await login(TEST_PASSWORD, at(10 * MIN))).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(await raw.session.count()).toBe(0);
    // Attempts during the lock do not extend it.
    const still = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(still.lockedUntil?.toISOString()).toBe(user.lockedUntil?.toISOString());
  });

  it("lets the lock expire (injected clock), and a success resets the counter", async () => {
    for (let i = 0; i < 5; i++) await login("mauvais mot de passe", T0);
    expect((await login(TEST_PASSWORD, at(15 * MIN - 1))).ok).toBe(false);
    expect((await login(TEST_PASSWORD, at(15 * MIN))).ok).toBe(true);
    const user = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("doubles the lock duration at the next lock, up to 24 h", async () => {
    for (let i = 0; i < 5; i++) await login("mauvais mot de passe", T0);
    const second = at(16 * MIN);
    for (let i = 0; i < 5; i++) await login("mauvais mot de passe", second);
    const user = await raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLoginCount).toBe(10);
    expect(user.lockedUntil?.toISOString()).toBe(new Date(second.getTime() + 30 * MIN).toISOString());

    expect([5, 10, 15, 20, 25].map(lockDurationMs)).toEqual([15, 30, 60, 120, 240].map((m) => m * MIN));
    expect(lockDurationMs(55)).toBe(24 * 60 * MIN);
    expect([0, 4, 6, 9].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
  });

  it("answers an unknown email with the same message and shape", async () => {
    const unknown = await login(TEST_PASSWORD, T0, "personne@atlas.local");
    const wrong = await login("mauvais mot de passe");
    expect(unknown).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(Object.keys(unknown)).toEqual(Object.keys(wrong));
    expect(unknown).toEqual(wrong);
  });

  it("refuses a deactivated account and deletes its existing sessions", async () => {
    const first = await login(TEST_PASSWORD);
    expect(first.ok).toBe(true);
    await createSession(userId, {}, T0);
    expect(await raw.session.count()).toBe(2);

    const closed = await system(() => setUserActive(EMAIL, false));
    expect(closed).toBe(2);
    expect(await raw.session.count()).toBe(0);
    expect(await login(TEST_PASSWORD)).toEqual({ ok: false, error: INVALID_CREDENTIALS });
  });

  it("limits attempts per IP address (20 per 15 minutes)", async () => {
    const limiter = createLoginIpLimiter(() => T0.getTime());
    for (let i = 0; i < 20; i++) {
      await authenticate("personne@atlas.local", "x", "10.9.9.9", { now: T0, limiter });
    }
    const blocked = await authenticate(EMAIL, TEST_PASSWORD, "10.9.9.9", { now: T0, limiter });
    expect(blocked).toEqual({ ok: false, error: TOO_MANY_ATTEMPTS });
    // Another address is unaffected.
    expect((await authenticate(EMAIL, TEST_PASSWORD, "10.9.9.8", { now: T0, limiter })).ok).toBe(true);
  });
});

describe("sessions", () => {
  const durations = { idleMinutes: 240, absoluteHours: 12 };

  it("expires after the inactivity timeout", async () => {
    const { token } = await createSession(userId, {}, T0, durations);
    expect(await validateSession(token, at(239 * MIN), durations)).not.toBeNull();
    // The first validation at +239 min renewed the idle expiry (> 5 min since creation).
    expect(await validateSession(token, at(239 * MIN + 240 * MIN - 1), durations)).not.toBeNull();
    expect(await validateSession(token, at(239 * MIN + 240 * MIN - 1 + 240 * MIN), durations)).toBeNull();
    expect(await raw.session.count()).toBe(0);
  });

  it("renews the sliding expiry at most every 5 minutes", async () => {
    const { token, sessionId } = await createSession(userId, {}, T0, durations);
    await validateSession(token, at(4 * MIN), durations);
    expect((await raw.session.findUniqueOrThrow({ where: { id: sessionId } })).lastSeenAt.toISOString()).toBe(T0.toISOString());
    await validateSession(token, at(5 * MIN), durations);
    const session = await raw.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.lastSeenAt.toISOString()).toBe(at(5 * MIN).toISOString());
    expect(session.idleExpiresAt.toISOString()).toBe(at(245 * MIN).toISOString());
  });

  it("expires at the absolute lifetime even when active", async () => {
    const { token } = await createSession(userId, {}, T0, durations);
    for (let minutes = 60; minutes < 12 * 60; minutes += 60) {
      expect(await validateSession(token, at(minutes * MIN), durations), `${minutes} min`).not.toBeNull();
    }
    // Idle expiry never goes beyond the absolute expiry.
    const session = await raw.session.findFirstOrThrow();
    expect(session.idleExpiresAt.getTime()).toBeLessThanOrEqual(session.expiresAt.getTime());
    expect(await validateSession(token, at(12 * 60 * MIN), durations)).toBeNull();
  });

  it("logout deletes the session", async () => {
    const { token } = await createSession(userId, {}, T0);
    expect(await invalidateSession(token)).toBe(userId);
    expect(await raw.session.count()).toBe(0);
    expect(await validateSession(token, T0)).toBeNull();
    expect(await invalidateSession(token)).toBeNull();
  });

  it("a password change deletes every session of the user", async () => {
    const a = await createSession(userId, {}, new Date());
    await createSession(userId, {}, new Date());
    const other = await createUserFixture("autre@atlas.local");
    await createSession(other, {}, new Date());

    const closed = await system(() => resetPassword(EMAIL, "Une toute nouvelle phrase secrète"));
    expect(closed).toBe(2);
    expect(await raw.session.count({ where: { userId } })).toBe(0);
    expect(await raw.session.count({ where: { userId: other } })).toBe(1);
    expect(await validateSession(a.token)).toBeNull();
    expect((await login("Une toute nouvelle phrase secrète", new Date())).ok).toBe(true);
  });

  it("rejects tokens that are empty, unknown or oversized", async () => {
    expect(await validateSession(undefined)).toBeNull();
    expect(await validateSession("")).toBeNull();
    expect(await validateSession("inconnu")).toBeNull();
    expect(await validateSession("x".repeat(500))).toBeNull();
  });

  it("purges expired sessions", async () => {
    await createSession(userId, {}, T0, durations);
    await createSession(userId, {}, at(11 * 60 * MIN), durations);
    expect(await purgeExpiredSessions(at(12 * 60 * MIN))).toBe(1);
    expect(await raw.session.count()).toBe(1);
  });
});
