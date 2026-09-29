/**
 * `Content-Disposition: attachment` with an RFC 6266 / RFC 5987 file name:
 * an ASCII fallback in `filename="…"` and the exact UTF-8 name in
 * `filename*=UTF-8''…`. Quotes, backslashes, control characters and path
 * separators never reach the header.
 */

/** RFC 5987 `attr-char` encoding (encodeURIComponent minus the few allowed extras). */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** File name made safe for a header (no separators, controls nor quotes). */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "document" : cleaned.slice(0, 180);
}

/**
 * Header value for a download.
 * @param name - Desired file name (any Unicode).
 */
export function attachmentDisposition(name: string): string {
  const safe = sanitizeFileName(name);
  const ascii = safe.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}
