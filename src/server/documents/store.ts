import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cleanFileName, detectDocumentType, MAX_DOCUMENT_BYTES, UPLOAD_MESSAGES } from "@/domain/documents";
import { DocumentCategory } from "@/domain/enums";
import { checkPlanImage } from "@/domain/image-size";
import { runWithAuditContext } from "../audit/context";
import { can } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { newBatchId } from "../sites/edit-common";
import { resolveStoragePath } from "../storage";

/**
 * Document storage (step 9): upload and deletion.
 *
 * - Files live in `STORAGE_ROOT/documents/{siteId}/{documentId}.{ext}`; the
 *   database keeps the RELATIVE path, the MIME type found by signature, the
 *   size and the SHA-256.
 * - A deleted document is never erased: its file moves to
 *   `STORAGE_ROOT/trash/documents/` (purge at step 11) and the `Document`
 *   deletion is audited.
 * - No antivirus runs on the closed network (see docs/security.md).
 */

/** An upload failure: HTTP status and French message. */
export class UploadError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Random document id (fits NVarChar(30)). */
function newDocumentId(): string {
  return `doc${randomBytes(12).toString("hex")}`;
}

/** Input of {@link storeUploadedDocument}. */
export interface UploadInput {
  siteId: string;
  fileName: string;
  bytes: Uint8Array;
  category: string;
  title?: string | null;
  comment?: string | null;
}

/**
 * Validates and stores an uploaded document, then creates its `Document`
 * (audited, `source = "ui"`). Size ≤ 50 MB, category from the enumeration,
 * type allowed AND confirmed by the file signature.
 *
 * Category `PLAN` (step 10): `plan:calibrate` required; PNG, JPEG or WebP
 * only, dimensions read from the header (8192 px per side at most); a
 * `SitePlan` becomes the CURRENT plan in the same transaction, the previous
 * current plan stays in the history.
 * @param user - Acting user (`document:upload` checked by the route).
 * @param input - File and metadata.
 * @returns The created document, with `planId` for a plan.
 * @throws {UploadError} On any refusal.
 */
export async function storeUploadedDocument(user: SessionUser, input: UploadInput) {
  if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new UploadError(413, UPLOAD_MESSAGES.tooLarge);
  if (!DocumentCategory.is(input.category)) throw new UploadError(400, "Catégorie obligatoire.");
  const detected = detectDocumentType(input.fileName, input.bytes);
  if (!detected.ok) throw new UploadError(415, detected.error);
  // A plan is an image (PNG, JPEG, WebP) of at most 8192 px per side, and needs `plan:calibrate`.
  const isPlan = input.category === "PLAN";
  const planImage = isPlan ? checkPlanImage(input.bytes) : null;
  if (isPlan && !can(user.role, "plan:calibrate")) throw new UploadError(403, "Ajout d'un plan non autorisé pour votre rôle.");
  if (planImage && !planImage.ok) throw new UploadError(detected.type.mime.startsWith("image/") ? 400 : 415, planImage.error);
  const site = await db.site.findUnique({ where: { id: input.siteId }, select: { id: true, archivedAt: true } });
  if (!site) throw new UploadError(404, "Site introuvable.");
  if (site.archivedAt) throw new UploadError(409, "Site archivé : le désarchiver avant d'ajouter un document.");

  const id = newDocumentId();
  const relative = `documents/${site.id}/${id}.${detected.type.ext}`;
  const path = resolveStoragePath(...relative.split("/"));
  const title = (input.title?.trim() ? cleanFileName(input.title) : cleanFileName(input.fileName)).slice(0, 300);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.bytes, { flag: "wx" });
  try {
    return await runWithAuditContext({ actorId: user.id, source: "ui", batchId: newBatchId(), comment: input.comment?.trim() || null }, () =>
      db.$transaction(async (tx) => {
        const doc = await tx.document.create({
        data: {
          id,
          siteId: site.id,
          category: input.category,
          title,
          storagePath: relative,
          mimeType: detected.type.mime,
          sizeBytes: BigInt(input.bytes.length),
          sha256: createHash("sha256").update(input.bytes).digest("hex"),
          uploadedById: user.id,
        },
        select: { id: true, title: true, category: true, mimeType: true, sizeBytes: true, sha256: true, storagePath: true },
        });
        // New current plan; the previous ones stay in the history (same audit batch).
        let planId: string | null = null;
        if (planImage?.ok) {
          const current = await tx.sitePlan.findMany({ where: { siteId: site.id, isCurrent: true }, select: { id: true } });
          for (const plan of current) await tx.sitePlan.update({ where: { id: plan.id }, data: { isCurrent: false } });
          const plan = await tx.sitePlan.create({
            data: { siteId: site.id, documentId: id, imageWidth: planImage.size.width, imageHeight: planImage.size.height, isCurrent: true },
            select: { id: true },
          });
          planId = plan.id;
        }
        return { ...doc, planId };
      }),
    );
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}

/**
 * Deletes a document: the `Document` row is deleted (audited, with the
 * optional reason) and its file MOVED to `STORAGE_ROOT/trash/documents/`.
 * @param user - Acting user (`document:upload` checked by the route).
 * @param documentId - Document.
 * @param comment - Optional reason.
 * @returns The trash path (relative), or `null` when the file was already missing.
 * @throws {UploadError} 404 when unknown, 409 when still used by a plan.
 */
export async function deleteDocument(user: SessionUser, documentId: string, comment?: string | null): Promise<string | null> {
  const doc = await db.document.findUnique({ where: { id: documentId }, select: { id: true, siteId: true, storagePath: true, _count: { select: { plans: true } } } });
  if (!doc) throw new UploadError(404, "Document introuvable.");
  if (doc._count.plans > 0) throw new UploadError(409, "Document utilisé par un plan : le détacher d'abord.");
  await runWithAuditContext({ actorId: user.id, source: "ui", batchId: newBatchId(), comment: comment?.trim() || null }, () => db.document.delete({ where: { id: doc.id } }));

  const name = doc.storagePath.split(/[\\/]/).pop() ?? `${doc.id}`;
  const trash = `trash/documents/${new Date().toISOString().replace(/[:.]/g, "-")}-${name}`;
  try {
    const target = resolveStoragePath(...trash.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await rename(resolveStoragePath(...doc.storagePath.split(/[\\/]+/).filter(Boolean)), target);
    return trash;
  } catch (error) {
    console.warn(`[vigie] document ${doc.id} supprimé ; fichier non déplacé vers la corbeille (${(error as Error).name}).`);
    return null;
  }
}
