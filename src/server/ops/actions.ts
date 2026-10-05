"use server";

/**
 * Server Action of the operations screen: « Lancer maintenant ». The
 * permission is checked HERE (`settings:manage`), whatever the interface shows.
 */
import { requirePermission } from "../auth/current-user";
import { ForbiddenError } from "../auth/permissions";
import { JobAlreadyRunningError, runJob, UnknownJobError } from "./run";

/** Result of {@link runJobNowAction}. */
export type RunJobNowResult = { ok: true; status: "success" | "failed" | "skipped"; message: string } | { ok: false; message: string };

/**
 * Runs a job now (trigger `manual`, author = current user) and waits for its end.
 * @param input - Job name.
 */
export async function runJobNowAction(input: { job: string }): Promise<RunJobNowResult> {
  let user;
  try {
    user = await requirePermission("settings:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, message: "Action non autorisée pour votre rôle." };
    throw error;
  }
  try {
    const outcome = await runJob(String(input.job), "manual", { actorId: user.id });
    if (outcome.status === "skipped") return { ok: true, status: "skipped", message: outcome.reason };
    return { ok: true, status: outcome.status, message: outcome.status === "success" ? "Tâche terminée avec succès." : `Échec : ${outcome.error ?? "erreur inconnue"}` };
  } catch (error) {
    if (error instanceof JobAlreadyRunningError || error instanceof UnknownJobError) return { ok: false, message: error.message };
    throw error;
  }
}
