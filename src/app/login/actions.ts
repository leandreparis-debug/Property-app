"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { getClientIp } from "@/server/auth/client-ip";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/cookies";
import { authenticate } from "@/server/auth/login";
import { safeRedirectPath } from "@/server/auth/safe-redirect";

/** State of the login form between submissions. */
export interface LoginState {
  error: string | null;
  email: string;
}

/**
 * Login Server Action (Next.js checks the request origin of Server Actions).
 * On success, sets the session cookie and redirects to the sanitized `next`.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? "/"));

  const env = getEnv();
  const requestHeaders = await headers();
  const result = await authenticate(email, password, getClientIp(requestHeaders, env.TRUST_PROXY), {
    userAgent: requestHeaders.get("user-agent"),
  });
  if (!result.ok) return { error: result.error, email };

  (await cookies()).set(sessionCookieName(env), result.token, sessionCookieOptions(env));
  redirect(next);
}
