import "server-only";
import { db } from "../db";
import { runWithAuditContext } from "../audit/context";
import { getDummyHash, verifyPassword } from "./password";
import { createLoginIpLimiter, type SlidingWindowRateLimiter } from "./rate-limit";
import { createSession, type SessionUser } from "./session";
import type { UserRole } from "@/domain/enums";

/** The only message shown on a failed login (no account enumeration). */
export const INVALID_CREDENTIALS = "Identifiants invalides.";
/** Message shown when the per-IP limit is reached (reveals nothing about accounts). */
export const TOO_MANY_ATTEMPTS = "Trop de tentatives depuis ce poste. Réessayez dans quelques minutes.";

/** Consecutive failures that lock an account. */
export const MAX_FAILED_ATTEMPTS = 5;
/** First lock duration; doubles at each new lock. */
export const BASE_LOCK_MS = 15 * 60 * 1000;
/** Lock duration ceiling. */
export const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

/** Internal failure reasons, written to the audit log only — never shown. */
export type LoginFailureReason =
  | "invalid_input"
  | "unknown_email"
  | "no_password"
  | "inactive"
  | "locked"
  | "bad_password"
  | "ip_rate_limited";

/** Result of {@link authenticate}. The failure shape is identical for every reason. */
export type AuthenticationResult =
  | { ok: true; token: string; expiresAt: Date; user: SessionUser }
  | { ok: false; error: string };

/**
 * Lock duration after `failedCount` consecutive failures: 0 below 5 failures,
 * then 15 min at 5, 30 min at 10, 1 h at 15… capped at 24 h.
 * @param failedCount - Consecutive failures including the current one.
 */
export function lockDurationMs(failedCount: number): number {
  if (failedCount < MAX_FAILED_ATTEMPTS || failedCount % MAX_FAILED_ATTEMPTS !== 0) return 0;
  const lockIndex = failedCount / MAX_FAILED_ATTEMPTS - 1;
  return Math.min(BASE_LOCK_MS * 2 ** Math.min(lockIndex, 20), MAX_LOCK_MS);
}

const defaultLimiter = createLoginIpLimiter();

/** Options of {@link authenticate} (all injectable for tests). */
export interface AuthenticateOptions {
  now?: Date;
  limiter?: SlidingWindowRateLimiter;
  userAgent?: string | null;
}

async function logEvent(
  action: "LOGIN" | "LOGIN_FAILED",
  userId: string | null,
  details: Record<string, string | null>,
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      occurredAt: now,
      actorId: action === "LOGIN" ? userId : null,
      action,
      source: "ui",
      entityType: "User",
      entityId: userId ?? "unknown",
      afterValue: JSON.stringify(details),
    },
  });
}

/**
 * Checks credentials and opens a session.
 *
 * - Unknown email, missing password hash, deactivated or locked account and
 *   wrong password all return the same `{ ok: false, error: "Identifiants
 *   invalides." }`, after an argon2 verification (against a dummy hash when
 *   the account does not exist) so response times match.
 * - 5 consecutive failures lock the account for 15 min, doubling at each new
 *   lock up to 24 h; a success resets the counter.
 * - 20 attempts per IP and 15 minutes (in memory, single instance).
 * - Writes LOGIN / LOGIN_FAILED audit events (reason in `after_value`, never
 *   shown to the user).
 *
 * @param email - Email as typed (trimmed and lower-cased here).
 * @param password - Password as typed (never logged).
 * @param ip - Client IP address, if known.
 * @param options - Clock, limiter and user agent (for tests and the session).
 */
export async function authenticate(
  email: string,
  password: string,
  ip: string | null,
  options: AuthenticateOptions = {},
): Promise<AuthenticationResult> {
  const now = options.now ?? new Date();
  const limiter = options.limiter ?? defaultLimiter;
  const normalizedEmail = email.trim().toLowerCase();
  const fail = async (reason: LoginFailureReason, userId: string | null): Promise<AuthenticationResult> => {
    await logEvent("LOGIN_FAILED", userId, { ip, reason }, now);
    return { ok: false, error: reason === "ip_rate_limited" ? TOO_MANY_ATTEMPTS : INVALID_CREDENTIALS };
  };

  if (!limiter.hit(ip ?? "unknown").allowed) return fail("ip_rate_limited", null);

  const validInput = normalizedEmail.length > 0 && normalizedEmail.length <= 254 && password.length > 0 && password.length <= 1024;
  const user = validInput
    ? await db.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, name: true, role: true, passwordHash: true, isActive: true, failedLoginCount: true, lockedUntil: true },
      })
    : null;

  // Always run one argon2 verification, whatever happens next (constant time).
  const passwordMatches = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password.slice(0, 1024));

  if (!validInput) return fail("invalid_input", null);
  if (!user) return fail("unknown_email", null);
  if (!user.passwordHash) return fail("no_password", user.id);
  if (!user.isActive) return fail("inactive", user.id);
  if (user.lockedUntil && user.lockedUntil > now) return fail("locked", user.id);

  return runWithAuditContext({ actorId: user.id, source: "ui" }, async () => {
    if (!passwordMatches) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockMs = lockDurationMs(failedLoginCount);
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount, ...(lockMs > 0 ? { lockedUntil: new Date(now.getTime() + lockMs) } : {}) },
      });
      return fail("bad_password", user.id);
    }

    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    const session = await createSession(user.id, { ipAddress: ip, userAgent: options.userAgent }, now);
    await logEvent("LOGIN", user.id, { ip }, now);
    return {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role as UserRole },
    };
  });
}

/**
 * Writes the LOGOUT audit event.
 * @param userId - User whose session was closed.
 * @param ip - Client IP address, if known.
 */
export async function logLogout(userId: string, ip: string | null): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: "LOGOUT",
      source: "ui",
      entityType: "User",
      entityId: userId,
      afterValue: JSON.stringify({ ip }),
    },
  });
}
