import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticate, INVALID_CREDENTIALS } from "@/server/auth/login";
import { changeOwnPassword } from "@/server/auth/password-change";
import { createLoginIpLimiter } from "@/server/auth/rate-limit";
import { createSession, validateSession, type SessionUser } from "@/server/auth/session";
import { changeUserRole, createUserWithTemporaryPassword, resetUserPasswordByAdmin, revokeUserSessions, setUserActiveByAdmin } from "@/server/users/admin";
import { createUserFixture, disconnectAll, raw, resetDatabase, TEST_PASSWORD } from "./helpers";

let admin: SessionUser;

const login = (email: string, password: string) => authenticate(email, password, "10.0.0.1", { limiter: createLoginIpLimiter() });

/** Every audit line written since the last reset, as one string. */
async function auditText(): Promise<string> {
  return JSON.stringify(await raw.auditLog.findMany(), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

beforeEach(async () => {
  await resetDatabase();
  const id = await createUserFixture("chef@vigie.local", { role: "admin" });
  admin = { id, email: "chef@vigie.local", name: "Chef", role: "admin" };
});

afterAll(async () => {
  await disconnectAll();
});

describe("account creation", () => {
  it("temporary password conforming to the policy, must be changed at first sign-in; audited without any secret", async () => {
    const created = await createUserWithTemporaryPassword(admin, { email: "  Nouvelle.Personne@Vigie.LOCAL ", name: "Nouvelle", role: "editor" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.email).toBe("nouvelle.personne@vigie.local");
    expect(created.temporaryPassword).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    const user = await raw.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user).toMatchObject({ role: "editor", mustChangePassword: true, isActive: true });

    const lines = await raw.auditLog.findMany({ where: { entityType: "User", entityId: created.userId } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "CREATE", source: "ui", actorId: admin.id });
    const text = await auditText();
    expect(text).not.toContain(created.temporaryPassword);
    expect(text).not.toContain(user.passwordHash!);
    expect(text).not.toMatch(/argon2/);

    // First sign-in works; every page then requires the change.
    const first = await login("nouvelle.personne@vigie.local", created.temporaryPassword);
    expect(first.ok && first.user.mustChangePassword).toBe(true);
  });

  it("email unique without regard to case", async () => {
    await createUserWithTemporaryPassword(admin, { email: "double@vigie.local", role: "viewer" });
    const again = await createUserWithTemporaryPassword(admin, { email: "DOUBLE@vigie.local", role: "viewer" });
    expect(again).toEqual({ ok: false, message: "Un compte existe déjà pour double@vigie.local." });
  });

  it("an editor cannot manage accounts", async () => {
    await expect(createUserWithTemporaryPassword({ ...admin, role: "editor" }, { email: "x@vigie.local", role: "viewer" })).rejects.toThrow(/Accès refusé/);
  });
});

describe("changing one's password", () => {
  it("clears the obligation, closes every other session and opens a new one", async () => {
    const created = await createUserWithTemporaryPassword(admin, { email: "change@vigie.local", role: "viewer" });
    if (!created.ok) throw new Error(created.message);
    const other = await createSession(created.userId);
    const bad = await changeOwnPassword(created.userId, { current: "faux", next: "Une phrase de passe neuve", confirm: "Une phrase de passe neuve" });
    expect(bad).toMatchObject({ ok: false, field: "current" });
    const result = await changeOwnPassword(created.userId, { current: created.temporaryPassword, next: "Une phrase de passe neuve", confirm: "Une phrase de passe neuve" });
    expect(result.ok).toBe(true);
    expect(await validateSession(other.token)).toBeNull();
    const fresh = result.ok ? await validateSession(result.token) : null;
    expect(fresh?.user.mustChangePassword).toBe(false);
    expect((await raw.user.findUniqueOrThrow({ where: { id: created.userId } })).mustChangePassword).toBe(false);
    expect(await auditText()).not.toContain("Une phrase de passe neuve");
  });
});

describe("deactivation, role change, reset, revocation", () => {
  it("deactivation revokes every session (audited count), and the account can no longer sign in, with the usual message", async () => {
    const userId = await createUserFixture("partant@vigie.local", { role: "editor" });
    const s1 = await createSession(userId);
    await createSession(userId);
    const result = await setUserActiveByAdmin(admin, userId, false);
    expect(result).toEqual({ ok: true, sessionsRevoked: 2 });
    expect(await validateSession(s1.token)).toBeNull();
    expect(await raw.session.count({ where: { userId } })).toBe(0);
    const line = await raw.auditLog.findFirstOrThrow({ where: { entityType: "User", entityId: userId, field: "sessions" } });
    expect(line).toMatchObject({ actorId: admin.id, action: "UPDATE", beforeValue: '{"active":2}', afterValue: '{"active":0}' });
    expect(await raw.auditLog.count({ where: { entityType: "User", entityId: userId, field: "isActive" } })).toBe(1);
    expect(await login("partant@vigie.local", TEST_PASSWORD)).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(await login("inconnu@vigie.local", TEST_PASSWORD)).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(await setUserActiveByAdmin(admin, userId, true)).toEqual({ ok: true, sessionsRevoked: 0 });
    expect((await login("partant@vigie.local", TEST_PASSWORD)).ok).toBe(true);
  });

  it("role change revokes the sessions", async () => {
    const userId = await createUserFixture("promu@vigie.local", { role: "viewer" });
    await createSession(userId);
    expect(await changeUserRole(admin, userId, "editor")).toEqual({ ok: true, sessionsRevoked: 1 });
    expect((await raw.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe("editor");
  });

  it("reset: new temporary password (the old one stops working), sessions revoked, account unlocked; nothing secret in the audit", async () => {
    const userId = await createUserFixture("oubli@vigie.local", { role: "viewer" });
    await raw.user.update({ where: { id: userId }, data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 3_600_000) } });
    await createSession(userId);
    const result = await resetUserPasswordByAdmin(admin, userId);
    expect(result.ok && result.sessionsRevoked).toBe(1);
    if (!result.ok) return;
    expect(await login("oubli@vigie.local", TEST_PASSWORD)).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    const signed = await login("oubli@vigie.local", result.temporaryPassword);
    expect(signed.ok && signed.user.mustChangePassword).toBe(true);
    const text = await auditText();
    expect(text).not.toContain(result.temporaryPassword);
    expect(text).not.toMatch(/argon2/);
    const sessions = await raw.session.findMany({ select: { id: true } });
    for (const s of sessions) expect(text).not.toContain(s.id);
  });

  it("revocation alone", async () => {
    const userId = await createUserFixture("sessions2@vigie.local");
    await createSession(userId);
    expect(await revokeUserSessions(admin, userId)).toEqual({ ok: true, sessionsRevoked: 1 });
  });
});

describe("guards", () => {
  it("nobody deactivates nor demotes themselves", async () => {
    expect(await setUserActiveByAdmin(admin, admin.id, false)).toMatchObject({ ok: false, message: expect.stringMatching(/propre compte/) });
    expect(await changeUserRole(admin, admin.id, "viewer")).toMatchObject({ ok: false, message: expect.stringMatching(/propre rôle/) });
  });

  it("the last active administrator is protected; two simultaneous demotions cannot both pass", async () => {
    const second = await createUserFixture("second@vigie.local", { role: "admin" });
    const otherAdmin: SessionUser = { id: second, email: "second@vigie.local", name: null, role: "admin" };
    // Each administrator demotes the other at the same time: only one may succeed.
    const results = await Promise.all([changeUserRole(admin, second, "editor"), changeUserRole(otherAdmin, admin.id, "editor")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await raw.user.count({ where: { role: "admin", isActive: true } })).toBe(1);

    // A deactivated administrator does not count.
    const remaining = await raw.user.findFirstOrThrow({ where: { role: "admin", isActive: true } });
    const third = await createUserFixture("troisieme@vigie.local", { role: "admin", isActive: false });
    const thirdUser: SessionUser = { id: third, email: "troisieme@vigie.local", name: null, role: "admin" };
    expect(await setUserActiveByAdmin(thirdUser, remaining.id, false)).toMatchObject({ ok: false, message: expect.stringMatching(/dernier administrateur actif/) });
  });
});
