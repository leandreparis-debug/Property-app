/**
 * Selection ⇄ URL: the selected site is reflected by `?site=<code>`.
 * Pure helpers (the component writes with history.replaceState, which never
 * adds a history entry and does not re-render the server page).
 */

/** Name of the query parameter. */
export const SITE_PARAM = "site";

const CODE = /^[\p{L}\p{N}_.\-]{1,50}$/u;

/**
 * Reads the selected site code from a query string.
 * @param search - `location.search` or a URLSearchParams.
 * @returns The code, or null when absent or malformed.
 */
export function readSiteParam(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const code = params.get(SITE_PARAM)?.trim() ?? "";
  return CODE.test(code) ? code : null;
}

/**
 * URL with the selection set (or removed with `null`), other parameters kept.
 * @param href - Current URL (absolute or path + query).
 * @param code - Site code, or null.
 * @returns Path + query + hash (same origin).
 */
export function withSiteParam(href: string, code: string | null): string {
  const url = new URL(href, "http://localhost");
  if (code) url.searchParams.set(SITE_PARAM, code);
  else url.searchParams.delete(SITE_PARAM);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
