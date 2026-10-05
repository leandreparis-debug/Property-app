import "server-only";
import { UserRole } from "@/domain/enums";
import { db } from "../db";
import { hashPassword, validatePasswordPolicy } from "./password";
import { invalidateUserSessions } from "./session";

/**
 * Account management used by the CLI scripts (and, at step 11, by the admin
 * screen). Must run inside `runWithAuditContext`: every change is audited.
 */

/** Raised with French, user-facing messages (validation, not found, duplicates). */
export class UserServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserServiceError";
  }
}

/** Normalises an email: trimmed, lower-case; throws if malformed. */
export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(value)) {
    throw new UserServiceError(`Adresse email invalide : « ${email} ».`);
  }
  return value;
}

function assertPolicy(password: string, email: string): void {
  const policy = validatePasswordPolicy(password, email);
  if (!policy.ok) throw new UserServiceError(policy.errors.join(" "));
}

/**
 * Creates an account.
 * @param input - Email (stored lower-case), display name, role, password (policy checked).
 * @returns The new user id.
 */
export async function createUser(input: { email: string; name?: string | null; role: string; password: string }): Promise<string> {
  const email = normalizeEmail(input.email);
  if (!UserRole.is(input.role)) {
    throw new UserServiceError(`Rôle invalide : « ${input.role} » (valeurs : ${UserRole.values.join(", ")}).`);
  }
  assertPolicy(input.password, email);
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new UserServiceError(`Un compte existe déjà pour ${email}.`);
  }
  const user = await db.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      passwordChangedAt: new Date(),
    },
    select: { id: true },
  });
  return user.id;
}

async function findUserId(email: string): Promise<string> {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
  if (!user) throw new UserServiceError(`Aucun compte pour ${email.trim().toLowerCase()}.`);
  return user.id;
}

/**
 * Replaces a password, unlocks the account and closes all its sessions.
 * @returns Number of sessions closed.
 */
export async function resetPassword(email: string, password: string): Promise<number> {
  const normalized = normalizeEmail(email);
  assertPolicy(password, normalized);
  const id = await findUserId(normalized);
  await db.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  return invalidateUserSessions(id);
}

/**
 * Activates or deactivates an account. Deactivation closes all its sessions.
 * @returns Number of sessions closed.
 */
export async function setUserActive(email: string, active: boolean): Promise<number> {
  const id = await findUserId(email);
  await db.user.update({ where: { id }, data: { isActive: active } });
  return active ? 0 : invalidateUserSessions(id);
}
