import { NextResponse } from "next/server";
import { MAX_DOCUMENT_BYTES, UPLOAD_MESSAGES } from "@/domain/documents";
import { withApiAuth } from "@/server/auth/api";
import { storeUploadedDocument, UploadError } from "@/server/documents/store";
import { BodyTooLargeError, readLimitedBody } from "@/server/http/limited-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Room for the multipart envelope and the text fields around the file. */
const MULTIPART_OVERHEAD = 256 * 1024;

const error = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/sites/[id]/documents — adds a document (multipart: `file`,
 * `category`, optional `title` and `comment`). `document:upload` and a
 * same-origin `Origin` header (withApiAuth). 50 MB at most (Content-Length
 * checked before reading, then the stream); type confirmed by signature.
 */
export const POST = withApiAuth<Context>(
  async (request, { params, user }) => {
    const { id } = await params;
    let body: Uint8Array;
    try {
      body = await readLimitedBody(request, MAX_DOCUMENT_BYTES + MULTIPART_OVERHEAD);
    } catch (e) {
      if (e instanceof BodyTooLargeError) return error(413, UPLOAD_MESSAGES.tooLarge);
      throw e;
    }
    let form: FormData;
    try {
      form = await new Response(body as BodyInit, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    } catch {
      return error(400, "Formulaire d'envoi illisible.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) return error(400, "Aucun fichier reçu.");
    const text = (name: string) => {
      const v = form.get(name);
      return typeof v === "string" ? v : null;
    };
    try {
      const doc = await storeUploadedDocument(user, {
        siteId: id,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        category: text("category") ?? "",
        title: text("title"),
        comment: text("comment")?.slice(0, 500) ?? null,
      });
      return NextResponse.json({ ...doc, sizeBytes: doc.sizeBytes === null ? null : Number(doc.sizeBytes) }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof UploadError) return error(e.status, e.message);
      throw e;
    }
  },
  { permission: "document:upload" },
);
