/**
 * Client URL writes of the site views. history.replaceState: no history
 * entry, no server re-render; Next.js syncs useSearchParams() with it.
 */

/**
 * Replaces the query string of the current URL.
 * @param query - New query, without « ? » (empty removes it).
 */
export function replaceQuery(query: string): void {
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", url);
}
