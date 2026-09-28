import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { UserRole } from "@/domain/enums";
import { getEnv } from "@/lib/env";
import { sessionCookieName } from "./cookies";
import { assertCan, ForbiddenError, type Action } from "./permissions";
import { validateSession, type SessionUser } from "./session";
import { safeRedirectPath } from "./safe-redirect";

/** Request header set by the middleware with the requested path (for `?next=`). */
export const PATH_HEADER = "x-atlas-path";

/** Raised by API helpers when no valid session exists. Maps to HTTP 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Authentification requise.");
    this.name = "UnauthorizedError";
  }
}

/**
 * The user of the current request, from the session cookie. Validated against
 * the database once per request (React `cache`).
 * @returns The user, or `null` without a valid session.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(sessionCookieName(getEnv()))?.value;
  const session = await validateSession(token);
  return session?.user ?? null;
});

/**
 * Login URL that returns to the current page after authentication.
 */
export async function loginUrl(): Promise<string> {
  const path = safeRedirectPath((await headers()).get(PATH_HEADER));
  return `/login?next=${encodeURIComponent(path)}`;
}

/**
 * Returns the current user or redirects to `/login?next=…`.
 * For layouts, pages and Server Actions.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(await loginUrl());
  return user;
}

/**
 * Returns the current user if they have one of the roles.
 * @throws {ForbiddenError} Otherwise (redirects to login without session).
 */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/**
 * Returns the current user if their role grants `action`.
 * @throws {ForbiddenError} Otherwise (redirects to login without session).
 */
export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireUser();
  assertCan(user.role, action);
  return user;
}

/**
 * Page variant of {@link requirePermission}: renders the « Accès refusé » page
 * (HTTP 403, `forbidden.tsx`) instead of throwing.
 */
export async function requirePagePermission(action: Action): Promise<SessionUser> {
  try {
    return await requirePermission(action);
  } catch (error) {
    if (error instanceof ForbiddenError) forbidden();
    throw error;
  }
}

/**
 * API variant: the current user, or {@link UnauthorizedError} (no redirect).
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
