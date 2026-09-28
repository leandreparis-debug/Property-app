/**
 * Session cookie name and options.
 *
 * With `COOKIE_SECURE=true` the cookie is `Secure` and uses the `__Host-`
 * prefix (browser-enforced: Secure, Path=/, no Domain). Without it (plain
 * HTTP on the internal network), the name has no prefix.
 */

/** Cookie name when `COOKIE_SECURE=true`. */
export const SECURE_SESSION_COOKIE = "__Host-atlas_session";
/** Cookie name when `COOKIE_SECURE=false`. */
export const PLAIN_SESSION_COOKIE = "atlas_session";
/** Both names (the middleware only checks for presence). */
export const SESSION_COOKIE_NAMES = [SECURE_SESSION_COOKIE, PLAIN_SESSION_COOKIE] as const;

/** Options passed to `cookies().set()`. */
export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  /** Seconds; equals the absolute session lifetime. */
  maxAge: number;
}

/** Subset of the environment needed to build the cookie. */
export interface CookieEnv {
  COOKIE_SECURE: boolean;
  SESSION_ABSOLUTE_HOURS: number;
}

/**
 * Name of the session cookie.
 * @param env - Validated environment.
 */
export function sessionCookieName(env: Pick<CookieEnv, "COOKIE_SECURE">): string {
  return env.COOKIE_SECURE ? SECURE_SESSION_COOKIE : PLAIN_SESSION_COOKIE;
}

/**
 * Options of the session cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`,
 * `Secure` when `COOKIE_SECURE=true`, `Max-Age` = absolute session lifetime.
 * @param env - Validated environment.
 */
export function sessionCookieOptions(env: CookieEnv): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.COOKIE_SECURE,
    maxAge: env.SESSION_ABSOLUTE_HOURS * 3600,
  };
}

/**
 * Options that delete the session cookie (same attributes, `Max-Age=0`).
 * @param env - Validated environment.
 */
export function expiredSessionCookieOptions(env: CookieEnv): SessionCookieOptions {
  return { ...sessionCookieOptions(env), maxAge: 0 };
}
