import "server-only";

/** Raised when a request body exceeds its limit. */
export class BodyTooLargeError extends Error {
  constructor() {
    super("Corps de requête trop volumineux.");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads a request body into memory, refusing it as soon as it exceeds `limit`
 * bytes: first with `Content-Length` (before reading anything), then while
 * streaming (a missing or lying header cannot bypass the limit).
 * @param request - Incoming request.
 * @param limit - Maximum body size in bytes.
 * @throws {BodyTooLargeError} Above the limit.
 */
export async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
