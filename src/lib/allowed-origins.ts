/**
 * Hosts allowed to send Server Actions (`experimental.serverActions.allowedOrigins`
 * in next.config.ts). Next.js compares the request Origin with the Host
 * header; behind a proxy that rewrites the Host (GitHub Codespaces port
 * forwarding, reverse proxy), the public address must be listed.
 *
 * Read by next.config.ts BEFORE the environment is validated: no import of
 * `env.ts`, pure function of the variables it receives.
 */

/** Variables read by {@link serverActionsAllowedOrigins}. */
export interface AllowedOriginsEnv {
  /** Public URL of the application: its host is always allowed. */
  APP_URL?: string;
  /**
   * Extra hosts, comma-separated (`host` or `host:port`; a full origin,
   * scheme included, is accepted and reduced to its host). Set by the Codespaces
   * configuration; absent elsewhere.
   */
  SERVER_ACTIONS_ALLOWED_ORIGINS?: string;
  /** GitHub Codespaces: name of the codespace (fallback when the variable above is absent). */
  CODESPACE_NAME?: string;
  /** GitHub Codespaces: domain of the forwarded ports. */
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?: string;
  /** Port of the server (default 3000). */
  PORT?: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/**
 * Host (`name` or `name:port`, lower-case) of an origin or host entry:
 * scheme, credentials, path, query and fragment removed.
 * @returns The host, or `null` when malformed.
 */
function hostOf(entry: string): string | null {
  const host = entry
    .trim()
    .replace(SCHEME, "")
    .replace(/^[^@/]*@/, "")
    .split(/[/?#]/)[0]!
    .toLowerCase();
  return HOST.test(host) ? host : null;
}

/**
 * Hosts of a comma-separated list (`SERVER_ACTIONS_ALLOWED_ORIGINS`),
 * malformed entries ignored.
 * @param list - E.g. « vigie-x-3000.app.github.dev,localhost:3000 ».
 */
export function parseAllowedHosts(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map(hostOf)
    .filter((h): h is string => h !== null);
}

/**
 * Hosts allowed for Server Actions:
 * - the host of `APP_URL`;
 * - each host of `SERVER_ACTIONS_ALLOWED_ORIGINS`;
 * - inside a GitHub Codespace without that variable, the forwarded address
 *   of the port (`<codespace>-<port>.<domain>`).
 * Outside a Codespace and without the variable: only the host of `APP_URL`.
 * @param env - Environment (defaults to `process.env`).
 * @returns Unique hosts, in that order.
 */
export function serverActionsAllowedOrigins(env: AllowedOriginsEnv = process.env as AllowedOriginsEnv): string[] {
  const hosts: string[] = [];
  if (env.APP_URL) {
    const host = hostOf(env.APP_URL);
    if (host) hosts.push(host);
  }
  const extra = parseAllowedHosts(env.SERVER_ACTIONS_ALLOWED_ORIGINS);
  hosts.push(...extra);
  if (extra.length === 0 && env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    // The port-forwarding proxy may rewrite the Origin header to localhost.
    hosts.push(`${env.CODESPACE_NAME}-${env.PORT ?? "3000"}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`, `localhost:${env.PORT ?? "3000"}`);
  }
  return [...new Set(hosts)];
}
