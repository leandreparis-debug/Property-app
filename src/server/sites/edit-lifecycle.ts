import "server-only";
import { z } from "zod";
import { resolveDepartment } from "@/domain/geo";
import { newSiteSchema } from "@/domain/fields/new-site";
import { fieldErrors } from "@/domain/fields/validation";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { isWellFormedSiteId } from "./detail";
import { Abort, assertAll, auditedTransaction, COMMENT_MAX, commentSchema, fail, lockSite, withForbidden, type Failure } from "./edit-common";

/** Input of {@link createSite}: the dialog values (strings). */
export type CreateSiteInput = z.input<typeof newSiteSchema>;

/**
 * Creates a site from the « Nouveau site » dialog (`site:write`): unique
 * upper-case code, name, address and optional coordinates
 * (`coordinatesSource = "manual"`). The region follows the department.
 * Audited (`source = "ui"`).
 * @param user - Acting user.
 * @param input - Dialog values.
 * @returns The new site id, or a failure (`duplicate` for a used code).
 */
export async function createSite(user: SessionUser, input: CreateSiteInput): Promise<{ ok: true; id: string; code: string } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["site:write"]);
    const parsed = newSiteSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", "Certaines valeurs sont invalides.", { fieldErrors: fieldErrors(parsed.error) });
    const { code, name, latitude, longitude, departmentCode, addressLine, postalCode, city } = parsed.data;
    const existing = await db.site.findUnique({ where: { code }, select: { id: true } });
    if (existing) return fail("duplicate", `Le code ${code} est déjà utilisé.`, { fieldErrors: { code: `Le code ${code} est déjà utilisé.` } });
    const region = departmentCode ? (resolveDepartment(departmentCode)?.region ?? null) : null;
    const result = await auditedTransaction(user, null, async (tx) => {
      const site = await tx.site.create({
        data: {
          code,
          name,
          addressLine,
          postalCode,
          city,
          departmentCode,
          region,
          latitude,
          longitude,
          coordinatesSource: latitude !== null ? "manual" : null,
        },
      });
      return { id: site.id, code: site.code };
    });
    return "ok" in result ? result : { ok: true, ...result };
  });
}

const archiveInput = z.object({
  siteId: z.string().min(1).max(30),
  reason: z
    .string()
    .max(COMMENT_MAX, { error: `Motif : ${COMMENT_MAX} caractères au maximum.` })
    .transform((v) => v.trim())
    .refine((v) => v !== "", { error: "Motif obligatoire pour archiver un site." }),
});

/**
 * Archives a site (`site:archive`, administrators only): sets `archivedAt`.
 * The reason is MANDATORY and written on the audit line. An archived site
 * leaves the map, the list, the search and the supervision; its sheet stays
 * reachable by URL.
 * @param user - Acting user.
 * @param input - Site and reason.
 */
export async function archiveSite(user: SessionUser, input: z.input<typeof archiveInput>): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["site:archive"]);
    const parsed = archiveInput.safeParse(input);
    if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Requête invalide.", { fieldErrors: fieldErrors(parsed.error) });
    return setArchived(user, parsed.data.siteId, true, parsed.data.reason);
  });
}

/**
 * Restores an archived site (`site:archive`). The reason is optional.
 * @param user - Acting user.
 * @param input - Site and optional reason.
 */
export async function unarchiveSite(user: SessionUser, input: { siteId: string; reason?: string | null }): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["site:archive"]);
    const reason = commentSchema.safeParse(input.reason);
    if (!reason.success) return fail("invalid", reason.error.issues[0]?.message ?? "Motif invalide.");
    return setArchived(user, input.siteId, false, reason.data);
  });
}

async function setArchived(user: SessionUser, siteId: string, archived: boolean, reason: string | null): Promise<{ ok: true } | Failure> {
  if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");
  const result = await auditedTransaction(user, reason, async (tx) => {
    const site = await lockSite(tx, siteId);
    if (!site) throw new Abort(fail("not_found", "Site introuvable."));
    if (site.archived === archived) throw new Abort(fail("invalid", archived ? "Site déjà archivé." : "Site non archivé."));
    await tx.site.update({ where: { id: siteId }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
    return true;
  });
  return result === true ? { ok: true } : (result as Failure);
}
