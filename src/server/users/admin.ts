import "server-only";
import { randomInt } from "node:crypto";
import { UserRole } from "@/domain/enums";
import { userChangeRefusal } from "@/domain/users/guards";
import { getAuditContext, runWithAuditContext } from "../audit/context";
import { hashPassword, validatePasswordPolicy } from "../auth/password";
import { can, ForbiddenError } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { createUser, normalizeEmail, UserServiceError } from "../auth/users";
import { db } from "../db";
import { newBatchId } from "../sites/edit-common";

/**
 * Account management from the administration screen (step 11, `user:manage`).
 *
 * - Temporary passwords are generated here, returned ONCE to the caller and
 *   never written anywhere else (no log, no audit: the audit extension
 *   redacts `passwordHash`).
 * - Guards, all on the server: no one deactivates or demotes themselves; the
 *   last ACTIVE administrator can be neither deactivated nor demoted (checked
 *   under a lock, so two simultaneous changes cannot both pass).
 * - Deactivation, role change and password reset revoke every session of
 *   the account; each revocation adds an audit line (count only).
 * - No deletion: the audit journal references the actors.
 */

/** A failed operation (French message for the administrator). */
export interface UserAdminFailure {
  ok: false;
  message: string;
}

/** Result of the operations that do not return data. */
export type UserAdminResult = { ok: true; sessionsRevoked: number } | UserAdminFailure;

const fail = (message: string): UserAdminFailure => ({ ok: false, message });

/** Characters of the temporary passwords (no 0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * A random temporary password (4 groups of 4 characters, about 94 bits),
 * checked against the password policy (common passwords, email local part).
 * @param email - Account email (its local part must not appear).
 */
export function generateTemporaryPassword(email: string): string {
  for (;;) {
    const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""));
    const candidate = groups.join("-");
    if (validatePasswordPolicy(candidate, email).ok) return candidate;
  }
}

function assertManage(actor: SessionUser): void {
  if (!can(actor.role, "user:manage")) throw new ForbiddenError("user:manage");
}

/** Runs `fn` as the administrator, in the interface audit context. */
function asAdmin<T>(actor: SessionUser, fn: () => Promise<T>, comment?: string | null): Promise<T> {
  return runWithAuditContext({ actorId: actor.id, source: "ui", batchId: newBatchId(), comment: comment ?? null }, fn);
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Ids of the ACTIVE administrators, rows locked until the end of the transaction. */
async function lockedActiveAdmins(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WITH (UPDLOCK, HOLDLOCK) WHERE role = N'admin' AND is_active = 1`;
  return rows.map((r) => r.id);
}

/**
 * Deletes every session of an account and records it in the audit journal
 * (`UPDATE` of field `sessions` on the user: count before, 0 after — never a
 * token nor its hash), with the batch of the current audit context.
 * @returns Number of sessions deleted.
 */
async function revokeInContext(actor: SessionUser, userId: string, tx: Tx): Promise<number> {
  const { count } = await tx.session.deleteMany({ where: { userId } });
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action: "UPDATE",
      source: "ui",
      entityType: "User",
      entityId: userId,
      field: "sessions",
      beforeValue: JSON.stringify({ active: count }),
      afterValue: JSON.stringify({ active: 0 }),
      batchId: getAuditContext()?.batchId ?? null,
      comment: "Sessions révoquées",
    },
  });
  return count;
}

/** An account as listed on the screen (no secret). */
export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  activeSessions: number;
}

/** Filters of the account list. */
export interface UserListFilters {
  q?: string;
  role?: string;
  status?: "active" | "inactive";
}

/**
 * Accounts, filtered (name or email contains `q`, role, status), by email.
 * @param filters - Search, role, status.
 * @param now - Current instant (active sessions).
 */
export async function listUsers(filters: UserListFilters = {}, now: Date = new Date()): Promise<UserListItem[]> {
  const q = filters.q?.trim().slice(0, 100);
  const users = await db.user.findMany({
    where: {
      ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] } : {}),
      ...(filters.role && UserRole.is(filters.role) ? { role: filters.role } : {}),
      ...(filters.status ? { isActive: filters.status === "active" } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { sessions: { where: { expiresAt: { gt: now }, idleExpiresAt: { gt: now } } } } },
    },
    orderBy: { email: "asc" },
  });
  return users.map(({ _count, ...u }) => ({ ...u, activeSessions: _count.sessions }));
}

/**
 * Creates an account with a temporary password (to change at first sign-in).
 * @param actor - Administrator.
 * @param input - Email (unique, case-insensitive), name, role.
 * @returns The id and the temporary password — shown ONCE, never stored in clear.
 */
export async function createUserWithTemporaryPassword(
  actor: SessionUser,
  input: { email: string; name?: string | null; role: string },
): Promise<{ ok: true; userId: string; email: string; temporaryPassword: string } | UserAdminFailure> {
  assertManage(actor);
  try {
    const email = normalizeEmail(input.email);
    const temporaryPassword = generateTemporaryPassword(email);
    const userId = await asAdmin(actor, () => createUser({ email, name: input.name?.trim().slice(0, 150) || null, role: input.role, password: temporaryPassword, mustChangePassword: true }));
    return { ok: true, userId, email, temporaryPassword };
  } catch (error) {
    if (error instanceof UserServiceError) return fail(error.message);
    throw error;
  }
}

async function findTarget(tx: Tx, userId: string) {
  return tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, isActive: true } });
}

/**
 * Changes the role of an account and revokes its sessions.
 * Refused: on oneself; demoting the last active administrator.
 */
export async function changeUserRole(actor: SessionUser, userId: string, role: string): Promise<UserAdminResult> {
  assertManage(actor);
  return asAdmin(actor, () =>
    db.$transaction(async (tx) => {
      const target = await findTarget(tx, userId);
      if (!target) return fail("Compte introuvable.");
      const refusal = userChangeRefusal(actor.id, target, { kind: "role", role }, (await lockedActiveAdmins(tx)).length);
      if (refusal) return fail(refusal);
      await tx.user.update({ where: { id: userId }, data: { role } });
      return { ok: true as const, sessionsRevoked: await revokeInContext(actor, userId, tx) };
    }),
  );
}

/**
 * Deactivates (`active = false`) or reactivates an account. Deactivation
 * revokes the sessions; a deactivated account cannot sign in (same message
 * as invalid credentials). Refused: deactivating oneself or the last active
 * administrator.
 */
export async function setUserActiveByAdmin(actor: SessionUser, userId: string, active: boolean): Promise<UserAdminResult> {
  assertManage(actor);
  return asAdmin(actor, () =>
    db.$transaction(async (tx) => {
      const target = await findTarget(tx, userId);
      if (!target) return fail("Compte introuvable.");
      const refusal = userChangeRefusal(actor.id, target, { kind: active ? "activate" : "deactivate" }, (await lockedActiveAdmins(tx)).length);
      if (refusal) return fail(refusal);
      await tx.user.update({ where: { id: userId }, data: { isActive: active } });
      return { ok: true as const, sessionsRevoked: active ? 0 : await revokeInContext(actor, userId, tx) };
    }),
  );
}

/**
 * Replaces the password by a new temporary one (to change at the next
 * sign-in), unlocks the account and revokes its sessions.
 * @returns The temporary password — shown ONCE.
 */
export async function resetUserPasswordByAdmin(
  actor: SessionUser,
  userId: string,
): Promise<{ ok: true; temporaryPassword: string; sessionsRevoked: number } | UserAdminFailure> {
  assertManage(actor);
  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return fail("Compte introuvable.");
  const temporaryPassword = generateTemporaryPassword(target.email);
  const passwordHash = await hashPassword(temporaryPassword);
  const sessionsRevoked = await asAdmin(actor, () =>
    db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      return revokeInContext(actor, userId, tx);
    }),
  );
  return { ok: true, temporaryPassword, sessionsRevoked };
}

/** Revokes every session of an account (forces a new sign-in). */
export async function revokeUserSessions(actor: SessionUser, userId: string): Promise<UserAdminResult> {
  assertManage(actor);
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return fail("Compte introuvable.");
  return asAdmin(actor, () => db.$transaction(async (tx) => ({ ok: true as const, sessionsRevoked: await revokeInContext(actor, userId, tx) })));
}
