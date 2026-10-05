import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { attachmentDisposition } from "./content-disposition";

/** Content types of the downloadable report and export files. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Streams a file as an attachment: `Content-Disposition: attachment`,
 * `Cache-Control: no-store`, `nosniff`, type from the extension.
 * @param path - Absolute path, ALREADY resolved under the storage root.
 * @param downloadName - Name proposed to the browser.
 * @returns The response, or `null` when the file does not exist.
 */
export async function fileDownload(path: string, downloadName: string): Promise<NextResponse | null> {
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null;
  }
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": attachmentDisposition(downloadName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * In-memory content as an attachment (on-demand exports).
 * @param content - File content.
 * @param downloadName - Name proposed to the browser.
 */
export function contentDownload(content: Uint8Array | string, downloadName: string): NextResponse {
  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[extname(downloadName).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": attachmentDisposition(downloadName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
