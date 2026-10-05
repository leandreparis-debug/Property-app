import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { PLAN_IMAGE_MIMES } from "@/domain/image-size";
import { jsonError, withApiAuth } from "@/server/auth/api";
import { db } from "@/server/db";
import { deleteDocument, UploadError } from "@/server/documents/store";
import { attachmentDisposition } from "@/server/http/content-disposition";
import { resolveStoragePath, StoragePathError } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const ID = /^[A-Za-z0-9_-]{1,30}$/;
/** Types that may be shown inline (plan images). */
const INLINE_MIMES: ReadonlySet<string> = new Set(PLAN_IMAGE_MIMES);
const notFound = () => jsonError(404, "Document introuvable.");

/** Download name: the title, with the stored file's extension when the title has none. */
function downloadName(title: string | null, storagePath: string): string {
  const stored = basename(storagePath);
  if (!title?.trim()) return stored;
  const ext = extname(stored);
  return ext && !title.toLowerCase().endsWith(ext.toLowerCase()) ? `${title.trim()}${ext}` : title.trim();
}

/**
 * GET /api/documents/[id] — streams a stored document (`site:read`).
 *
 * The path stored in the database is resolved UNDER `STORAGE_ROOT` (any
 * escape is refused); `Content-Type` comes from the database, never sniffed;
 * `Content-Disposition: attachment` with an RFC 5987 name; `nosniff`;
 * `private, no-store`. A document whose file is missing on disk is a logged 404.
 *
 * `?inline=1` (step 10, plan overlay): allowed ONLY for the images of
 * category `PLAN` (PNG, JPEG, WebP) — `Content-Disposition: inline`, same
 * `nosniff`; any other document gets a 403 and must be downloaded.
 */
export const GET = withApiAuth<Context>(
  async (request, { params }) => {
    const { id } = await params;
    if (!ID.test(id)) return notFound();
    const doc = await db.document.findUnique({ where: { id }, select: { id: true, siteId: true, title: true, storagePath: true, mimeType: true, category: true } });
    if (!doc) return notFound();
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    if (inline && !(doc.category === "PLAN" && INLINE_MIMES.has(doc.mimeType ?? ""))) {
      return jsonError(403, "Affichage en ligne réservé aux images de plan.");
    }

    let path: string;
    try {
      path = resolveStoragePath(...doc.storagePath.split(/[\\/]+/).filter(Boolean));
    } catch (error) {
      if (!(error instanceof StoragePathError)) throw error;
      console.warn(`[vigie] document ${doc.id} : chemin refusé hors du dossier de stockage.`);
      return notFound();
    }

    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error("not a file");
      size = info.size;
    } catch {
      console.warn(`[vigie] document ${doc.id} (site ${doc.siteId}) : fichier absent du stockage.`);
      return notFound();
    }

    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": inline ? "inline" : attachmentDisposition(downloadName(doc.title, doc.storagePath)),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  },
  { permission: "site:read" },
);

/**
 * DELETE /api/documents/[id] — deletes a document (`document:upload`,
 * same-origin). JSON body `{ comment? }` (optional reason). The row deletion
 * is audited; the file moves to STORAGE_ROOT/trash/documents/, never erased.
 */
export const DELETE = withApiAuth<Context>(
  async (request, { params, user }) => {
    const { id } = await params;
    if (!ID.test(id)) return notFound();
    let comment: string | null = null;
    try {
      const body = (await request.json()) as { comment?: unknown };
      comment = typeof body.comment === "string" ? body.comment.slice(0, 500) : null;
    } catch {
      // No body: no reason.
    }
    try {
      await deleteDocument(user, id, comment);
      return new NextResponse(null, { status: 204 });
    } catch (e) {
      if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
      throw e;
    }
  },
  { permission: "document:upload" },
);
