/**
 * Guards of the account changes made by an administrator (step 11), PURE.
 * The server calls them with the number of active administrators read under
 * a lock, so two simultaneous changes cannot both pass.
 */
import { UserRole } from "../enums";

/** The account being changed. */
export interface GuardTarget {
  id: string;
  role: string;
  isActive: boolean;
}

/** A change of role or status. */
export type UserChange = { kind: "role"; role: string } | { kind: "deactivate" } | { kind: "activate" };

/** Whether a change would leave no active administrator. */
function removesActiveAdmin(target: GuardTarget, change: UserChange): boolean {
  if (target.role !== "admin" || !target.isActive) return false;
  return change.kind === "deactivate" || (change.kind === "role" && change.role !== "admin");
}

/**
 * Why a change is refused, or `null` when it is allowed.
 * - nobody changes their own role nor deactivates their own account;
 * - the last ACTIVE administrator can be neither demoted nor deactivated;
 * - unknown role, no-op changes.
 * @param actorId - Administrator making the change.
 * @param target - Account changed.
 * @param change - Role change, deactivation or reactivation.
 * @param activeAdmins - Number of active administrators (target included).
 * @returns French message, or `null`.
 */
export function userChangeRefusal(actorId: string, target: GuardTarget, change: UserChange, activeAdmins: number): string | null {
  if (change.kind === "role") {
    if (!UserRole.is(change.role)) return "Rôle invalide.";
    if (target.id === actorId) return "Vous ne pouvez pas modifier votre propre rôle.";
    if (target.role === change.role) return "Le compte a déjà ce rôle.";
    if (removesActiveAdmin(target, change) && activeAdmins <= 1) return "Impossible de retirer le rôle Administrateur au dernier administrateur actif.";
    return null;
  }
  if (change.kind === "deactivate") {
    if (target.id === actorId) return "Vous ne pouvez pas désactiver votre propre compte.";
    if (!target.isActive) return "Le compte est déjà désactivé.";
    if (removesActiveAdmin(target, change) && activeAdmins <= 1) return "Impossible de désactiver le dernier administrateur actif.";
    return null;
  }
  return target.isActive ? "Le compte est déjà actif." : null;
}
