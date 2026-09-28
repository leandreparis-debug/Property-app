import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/domain/enums";
import { getEnv } from "@/lib/env";
import { db } from "../db";

/**
 * Server-side sessions.
 *
 * The browser holds a random 32-byte token (base64url) in an HttpOnly cookie;
 * the database only stores its SHA-256 (hex) as the session id. A database
 * leak therefore exposes no usable token.
 *
 * Two expiries: absolute (`SESSION_ABSOLUTE_HOURS` after creation) and
 * inactivity (`SESSION_IDLE_MINUTES`, sliding). The sliding expiry is renewed
 * at most once every {@link SESSION_TOUCH_INTERVAL_MS} to limit writes.
 */

/** Minimum delay between two renewals of the sliding expiry. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** The authenticated user as exposed to the application (no secrets). */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

/** A valid session and its user. */
export interface ValidatedSession {
  sessionId: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  user: SessionUser;
}

/** Durations used by the session functions (defaults from the environment). */
export interface SessionDurations {
  idleMinutes: number;
  absoluteHours: number;
}

function durations(override?: Partial<SessionDurations>): SessionDurations {
  const env = getEnv();
  return {
    idleMinutes: override?.idleMinutes ?? env.SESSION_IDLE_MINUTES,
    absoluteHours: override?.absoluteHours ?? env.SESSION_ABSOLUTE_HOURS,
  };
}

const minDate = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

/**
 * SHA-256 of a session token, lower-case hex: the session id stored in base.
 * @param token - Raw token from the cookie.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Creates a session for a user.
 * @param userId - User id.
 * @param meta - Client IP address and user agent (truncated to 255 characters).
 * @param now - Current instant (injectable for tests).
 * @param override - Durations (defaults: environment).
 * @returns The raw token (to put in the cookie — never stored) and the expiries.
 */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
  now: Date = new Date(),
  override?: Partial<SessionDurations>,
): Promise<{ token: string; sessionId: string; expiresAt: Date; idleExpiresAt: Date }> {
  const { idleMinutes, absoluteHours } = durations(override);
  const token = randomBytes(32).toString("base64url");
  const sessionId = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + absoluteHours * 3_600_000);
  const idleExpiresAt = minDate(new Date(now.getTime() + idleMinutes * 60_000), expiresAt);
  await db.session.create({
    data: {
      id: sessionId,
      userId,
      createdAt: now,
      expiresAt,
      idleExpiresAt,
      lastSeenAt: now,
      ipAddress: meta.ipAddress?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, sessionId, expiresAt, idleExpiresAt };
}

/**
 * Validates a session token.
 *
 * Returns `null` (and deletes the session) when it does not exist, has
 * expired (absolute or inactivity), belongs to a deactivated user, or
 * predates the user's last password change. Otherwise renews the sliding
 * expiry if the last renewal is older than 5 minutes.
 *
 * @param token - Raw token from the cookie.
 * @param now - Current instant (injectable for tests).
 * @param override - Durations (defaults: environment).
 */
export async function validateSession(
  token: string | null | undefined,
  now: Date = new Date(),
  override?: Partial<SessionDurations>,
): Promise<ValidatedSession | null> {
  if (!token || token.length > 128) return null;
  const sessionId = hashSessionToken(token);
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, email: true, name: true, role: true, isActive: true, passwordChangedAt: true } } },
  });
  if (!session) return null;

  const { user } = session;
  const expired = now >= session.expiresAt || now >= session.idleExpiresAt;
  const staleCredentials = user.passwordChangedAt !== null && user.passwordChangedAt > session.createdAt;
  if (expired || !user.isActive || staleCredentials) {
    await db.session.deleteMany({ where: { id: sessionId } });
    return null;
  }

  let { idleExpiresAt } = session;
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    const { idleMinutes } = durations(override);
    idleExpiresAt = minDate(new Date(now.getTime() + idleMinutes * 60_000), session.expiresAt);
    await db.session.update({ where: { id: sessionId }, data: { lastSeenAt: now, idleExpiresAt } });
  }

  return {
    sessionId,
    expiresAt: session.expiresAt,
    idleExpiresAt,
    user: { id: user.id, email: user.email, name: user.name, role: user.role as UserRole },
  };
}

/**
 * Deletes the session of a token (logout).
 * @param token - Raw token from the cookie.
 * @returns The user id of the deleted session, or `null` if none.
 */
export async function invalidateSession(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const sessionId = hashSessionToken(token);
  const session = await db.session.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (!session) return null;
  await db.session.deleteMany({ where: { id: sessionId } });
  return session.userId;
}

/**
 * Deletes every session of a user (deactivation, password change).
 * @param userId - User id.
 * @returns Number of deleted sessions.
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}

/**
 * Deletes expired sessions (absolute or inactivity). Called at server start;
 * scheduled at step 11.
 * @param now - Current instant.
 * @returns Number of deleted sessions.
 */
export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }] },
  });
  return count;
}
