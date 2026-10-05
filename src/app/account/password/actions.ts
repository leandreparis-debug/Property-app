"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { getClientIp } from "@/server/auth/client-ip";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/cookies";
import { getCurrentUser } from "@/server/auth/current-user";
import { changeOwnPassword } from "@/server/auth/password-change";

/** State of the password form between submissions. */
export interface PasswordFormState {
  error: string | null;
  field?: "current" | "next" | "confirm";
}

/**
 * Changes the current user's password, replaces the session cookie (every
 * other session is closed) and goes to the map.
 */
export async function changePasswordAction(_previous: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const env = getEnv();
  const requestHeaders = await headers();
  const result = await changeOwnPassword(
    user.id,
    { current: String(formData.get("current") ?? ""), next: String(formData.get("next") ?? ""), confirm: String(formData.get("confirm") ?? "") },
    { ipAddress: getClientIp(requestHeaders, env.TRUST_PROXY), userAgent: requestHeaders.get("user-agent") },
  );
  if (!result.ok) return { error: result.error, field: result.field };
  (await cookies()).set(sessionCookieName(env), result.token, sessionCookieOptions(env));
  redirect("/");
}
