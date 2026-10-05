"use server";

/**
 * Server Actions of the account screen. Each one checks `user:manage` HERE
 * (`requirePermission`), then delegates to `admin.ts`, which checks it again
 * and applies the guards.
 */
import { requirePermission } from "../auth/current-user";
import { ForbiddenError } from "../auth/permissions";
import { changeUserRole, createUserWithTemporaryPassword, resetUserPasswordByAdmin, revokeUserSessions, setUserActiveByAdmin, type UserAdminFailure } from "./admin";

const FORBIDDEN: UserAdminFailure = { ok: false, message: "Action non autorisée pour votre rôle." };

async function manager() {
  try {
    return await requirePermission("user:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
}

/** Creates an account; returns its temporary password, to show once. */
export async function createUserAction(input: { email: string; name?: string | null; role: string }) {
  const actor = await manager();
  return actor ? createUserWithTemporaryPassword(actor, { email: String(input.email), name: input.name ? String(input.name) : null, role: String(input.role) }) : FORBIDDEN;
}

/** Changes the role of an account (sessions revoked). */
export async function changeUserRoleAction(input: { userId: string; role: string }) {
  const actor = await manager();
  return actor ? changeUserRole(actor, String(input.userId), String(input.role)) : FORBIDDEN;
}

/** Deactivates or reactivates an account. */
export async function setUserActiveAction(input: { userId: string; active: boolean }) {
  const actor = await manager();
  return actor ? setUserActiveByAdmin(actor, String(input.userId), input.active === true) : FORBIDDEN;
}

/** New temporary password (shown once; sessions revoked). */
export async function resetUserPasswordAction(input: { userId: string }) {
  const actor = await manager();
  return actor ? resetUserPasswordByAdmin(actor, String(input.userId)) : FORBIDDEN;
}

/** Revokes every session of an account. */
export async function revokeUserSessionsAction(input: { userId: string }) {
  const actor = await manager();
  return actor ? revokeUserSessions(actor, String(input.userId)) : FORBIDDEN;
}
