import "server-only";
import { runWithAuditContext } from "../audit/context";
import { db } from "../db";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "./password";
import { createSession } from "./session";

/** Result of {@link changeOwnPassword}. */
export type PasswordChangeResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string; field?: "current" | "next" | "confirm" };

/**
 * Changes one's own password (forced after a temporary password, or
 * voluntary): checks the current password, the policy, the confirmation and
 * that the new one differs; clears `mustChangePassword`; closes EVERY session
 * of the account, then opens a new one for the caller (the cookie must be
 * replaced with the returned token). Audited (`passwordHash` redacted).
 * @param userId - Signed-in user.
 * @param input - Current, new and confirmation passwords (never logged).
 * @param meta - IP address and user agent of the new session.
 */
export async function changeOwnPassword(
  userId: string,
  input: { current: string; next: string; confirm: string },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<PasswordChangeResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true, isActive: true } });
  if (!user || !user.isActive || !user.passwordHash) return { ok: false, error: "Compte indisponible." };
  if (!(await verifyPassword(user.passwordHash, input.current.slice(0, 1024)))) return { ok: false, error: "Mot de passe actuel incorrect.", field: "current" };
  const policy = validatePasswordPolicy(input.next, user.email);
  if (!policy.ok) return { ok: false, error: policy.errors.join(" "), field: "next" };
  if (input.next !== input.confirm) return { ok: false, error: "Les deux saisies du nouveau mot de passe ne correspondent pas.", field: "confirm" };
  if (input.next === input.current) return { ok: false, error: "Le nouveau mot de passe doit être différent de l'actuel.", field: "next" };

  const passwordHash = await hashPassword(input.next);
  const now = new Date();
  await runWithAuditContext({ actorId: user.id, source: "ui", comment: "Changement de mot de passe" }, () =>
    db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: now, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
      await tx.session.deleteMany({ where: { userId: user.id } });
    }),
  );
  // Created a moment after passwordChangedAt: not considered stale.
  const session = await createSession(user.id, meta, new Date(now.getTime() + 1));
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}
