/**
 * Client IP address used for the per-IP login limit and the audit trail.
 *
 * - `TRUST_PROXY=true` (behind ONE reverse proxy that appends the client
 *   address to X-Forwarded-For): the LAST entry is used — it is the one written
 *   by the trusted proxy; earlier entries may be forged by the client.
 * - `TRUST_PROXY=false` (direct exposure): Next.js 15 exposes no socket
 *   address to Server Actions. It copies the socket address into
 *   X-Forwarded-For itself, but only when the client did not send that header.
 *   The value is therefore used as the « remote address », knowing that a
 *   client can forge it to evade the per-IP limit (the per-account lock still
 *   applies). See docs/security.md.
 */

/** Minimal header reader (Headers, ReadonlyHeaders). */
export interface HeaderReader {
  get(name: string): string | null;
}

const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Extracts the client IP address.
 * @param headers - Request headers.
 * @param trustProxy - Value of `TRUST_PROXY`.
 * @returns The address, or `null` if unavailable or malformed.
 */
export function getClientIp(headers: HeaderReader, trustProxy: boolean): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const entries = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
  const candidate = trustProxy ? entries.at(-1) : entries.length === 1 ? entries[0] : entries.at(-1);
  if (!candidate) return null;
  const ip = candidate.replace(/^::ffff:/, "");
  return IP_PATTERN.test(ip) ? ip : null;
}
