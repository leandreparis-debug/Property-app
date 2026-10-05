"use server";

/** Server Actions of the divergence review (`enrichment:apply`, checked here and in divergences.ts). */
import { requirePermission } from "../auth/current-user";
import { ForbiddenError } from "../auth/permissions";
import { adoptDivergence, dismissDivergences, type DivergenceResult } from "./divergences";

async function reviewer() {
  try {
    return await requirePermission("enrichment:apply");
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
}

const FORBIDDEN: DivergenceResult = { ok: false, message: "Action non autorisée pour votre rôle." };

/** « Conserver la valeur actuelle » on a selection. */
export async function dismissDivergencesAction(input: { ids: string[]; comment?: string | null }): Promise<DivergenceResult> {
  const user = await reviewer();
  if (!user) return FORBIDDEN;
  try {
    return await dismissDivergences(user, Array.isArray(input.ids) ? input.ids.map(String) : [], input.comment ?? null);
  } catch (error) {
    if (error instanceof ForbiddenError) return FORBIDDEN;
    throw error;
  }
}

/** « Adopter la valeur proposée » on one divergence. */
export async function adoptDivergenceAction(input: { id: string; comment?: string | null }): Promise<DivergenceResult> {
  const user = await reviewer();
  if (!user) return FORBIDDEN;
  try {
    return await adoptDivergence(user, String(input.id), input.comment ?? null);
  } catch (error) {
    if (error instanceof ForbiddenError) return FORBIDDEN;
    throw error;
  }
}
