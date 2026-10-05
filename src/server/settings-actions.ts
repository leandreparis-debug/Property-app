"use server";

/** Server Action of the import lock (`settings:manage`, checked here and in setSetting). */
import { requirePermission } from "./auth/current-user";
import { ForbiddenError } from "./auth/permissions";
import { setSetting } from "./settings";

/**
 * Activates or deactivates the import lock (audited, optional reason).
 * @param input - New state and reason.
 */
export async function setImportLockAction(input: { locked: boolean; comment?: string | null }): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const user = await requirePermission("settings:manage");
    await setSetting(user, "import.locked", input.locked === true, input.comment ?? null);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, message: "Action non autorisée pour votre rôle." };
    throw error;
  }
}
