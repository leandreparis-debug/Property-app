/**
 * Pure HTTP helpers for serving static files with byte ranges (RFC 9110):
 * Range parsing, Content-Range, ETag / If-None-Match, content types, safe
 * relative paths. Used by /api/map-assets (PMTiles are read by range).
 */

/** Result of parsing a Range header against a file size. */
export type RangeResult =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

/**
 * Parses a `Range` header.
 *
 * - `bytes=0-99` → bytes 0 to 99; `bytes=100-` → from 100 to the end;
 *   `bytes=-50` → the last 50 bytes; an end beyond the file is clamped.
 * - MULTIPLE RANGES (`bytes=0-9,20-29`): only the FIRST satisfiable range is
 *   served, as a single-part 206 — never multipart/byteranges. RFC 9110 lets
 *   a server ignore or reduce a multi-range request; PMTiles and MapLibre only
 *   ever send single ranges.
 * - Syntax error or another unit → `none` (the header is ignored: 200).
 * - No satisfiable range (start ≥ size, `bytes=-0`, empty file) → `unsatisfiable` (416).
 *
 * @param header - Value of the Range header, or null.
 * @param size - File size in bytes.
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return { kind: "none" };
  const match = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!match) return { kind: "none" };
  const specs = match[1]!.split(",").map((s) => s.trim());
  const parsed: { start: number; end: number }[] = [];
  for (const spec of specs) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(spec);
    if (!m || (m[1] === "" && m[2] === "")) return { kind: "none" };
    if (m[1] === "") {
      const suffix = Number(m[2]);
      if (suffix === 0 || size === 0) continue;
      parsed.push({ start: Math.max(0, size - suffix), end: size - 1 });
      continue;
    }
    const start = Number(m[1]);
    if (m[2] !== "" && Number(m[2]) < start) return { kind: "none" };
    if (start >= size) continue;
    const end = m[2] === "" ? size - 1 : Number(m[2]);
    parsed.push({ start, end: Math.min(end, size - 1) });
  }
  const first = parsed[0];
  return first ? { kind: "range", ...first } : { kind: "unsatisfiable" };
}

/** `Content-Range` of a partial response: « bytes 0-99/1000 ». */
export function contentRange(start: number, end: number, size: number): string {
  return `bytes ${start}-${end}/${size}`;
}

/** `Content-Range` of a 416 response: « bytes *\/1000 ». */
export function unsatisfiedRange(size: number): string {
  return `bytes */${size}`;
}

/**
 * ETag from size and modification time (like nginx). Changes whenever the
 * file is replaced (map:install writes new files).
 */
export function makeEtag(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/**
 * Whether `If-None-Match` matches the ETag (weak comparison, lists and `*`).
 * @param header - If-None-Match value, or null.
 * @param etag - Current ETag.
 */
export function etagMatches(header: string | null | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => strip(t) === strip(etag));
}

/** Content types of the map assets. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".pmtiles": "application/vnd.pmtiles",
  ".pbf": "application/x-protobuf",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

/** Content type of a file name (application/octet-stream when unknown). */
export function contentTypeFor(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot >= 0 && CONTENT_TYPES[fileName.slice(dot).toLowerCase()]) || "application/octet-stream";
}

/**
 * Validates the segments of a requested path: no empty, `.`/`..`, hidden
 * (leading dot), backslash, NUL or encoded separator. Returns the relative
 * path, or null when refused (→ 400).
 * @param segments - Decoded path segments of the catch-all route.
 */
export function safeRelativePath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  for (const s of segments) {
    if (s === "" || s.startsWith(".") || /[\\/\0]/.test(s) || s.length > 200) return null;
  }
  return segments.join("/");
}
