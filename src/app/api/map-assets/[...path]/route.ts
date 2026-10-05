import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { withApiAuth } from "@/server/auth/api";
import { contentRange, contentTypeFor, etagMatches, makeEtag, parseRange, safeRelativePath, unsatisfiedRange } from "@/server/http/range";
import { resolveMapAsset } from "@/server/map/assets";
import { StoragePathError } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };

const CACHE_CONTROL = "private, max-age=86400";

const plain = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

/**
 * Map assets installed by `pnpm map:install` (PMTiles, glyphs, sprites),
 * served from STORAGE_ROOT/map/ — never from the internet.
 *
 * Range requests (206 / 416), ETag + If-None-Match (304), private cache for
 * one day, streamed body. 400 on a suspicious path, 404 when absent.
 */
async function serve(request: NextRequest, { params }: Context, headOnly: boolean): Promise<Response> {
  const { path: segments } = await params;
  const relative = safeRelativePath(segments);
  if (!relative) return plain(400, "Chemin refusé.");

  let file;
  try {
    file = await resolveMapAsset(relative);
  } catch (error) {
    if (error instanceof StoragePathError) return plain(400, "Chemin refusé.");
    throw error;
  }
  if (!file) return plain(404, "Ressource cartographique introuvable.");

  const etag = makeEtag(file.size, file.mtimeMs);
  const common: Record<string, string> = {
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Cache-Control": CACHE_CONTROL,
    "Content-Type": contentTypeFor(relative),
    "X-Content-Type-Options": "nosniff",
  };
  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL, "Accept-Ranges": "bytes" } });
  }

  const range = parseRange(request.headers.get("range"), file.size);
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...common, "Content-Range": unsatisfiedRange(file.size), "Content-Length": "0" } });
  }
  const [start, end, status] = range.kind === "range" ? [range.start, range.end, 206] : [0, file.size - 1, 200];
  const length = file.size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = { ...common, "Content-Length": String(length) };
  if (status === 206) headers["Content-Range"] = contentRange(start, end, file.size);
  if (headOnly || length === 0) return new Response(null, { status, headers });

  const stream = Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}

export const GET = withApiAuth<Context>((request, context) => serve(request, context, false), { permission: "site:read" });
export const HEAD = withApiAuth<Context>((request, context) => serve(request, context, true), { permission: "site:read" });
