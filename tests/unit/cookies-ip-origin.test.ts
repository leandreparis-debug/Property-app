import { describe, expect, it } from "vitest";
import {
  expiredSessionCookieOptions,
  PLAIN_SESSION_COOKIE,
  SECURE_SESSION_COOKIE,
  sessionCookieName,
  sessionCookieOptions,
} from "@/server/auth/cookies";
import { getClientIp } from "@/server/auth/client-ip";
import { parseEnv } from "@/lib/env";

const baseEnv = { DATABASE_URL: "sqlserver://localhost:1433;database=atlas", APP_URL: "http://localhost:3000" };

describe("session cookie", () => {
  it("uses __Host- and Secure when COOKIE_SECURE=true", () => {
    const env = { COOKIE_SECURE: true, SESSION_ABSOLUTE_HOURS: 12 };
    expect(sessionCookieName(env)).toBe(SECURE_SESSION_COOKIE);
    expect(SECURE_SESSION_COOKIE.startsWith("__Host-")).toBe(true);
    expect(sessionCookieOptions(env)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 43_200 });
  });

  it("drops the prefix and Secure when COOKIE_SECURE=false (plain HTTP)", () => {
    const env = { COOKIE_SECURE: false, SESSION_ABSOLUTE_HOURS: 8 };
    expect(sessionCookieName(env)).toBe(PLAIN_SESSION_COOKIE);
    expect(sessionCookieOptions(env)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 28_800 });
  });

  it("follows the environment defaults (production → secure)", () => {
    expect(sessionCookieName(parseEnv({ ...baseEnv, NODE_ENV: "production" }))).toBe(SECURE_SESSION_COOKIE);
    expect(sessionCookieName(parseEnv({ ...baseEnv, NODE_ENV: "development" }))).toBe(PLAIN_SESSION_COOKIE);
    expect(sessionCookieName(parseEnv({ ...baseEnv, NODE_ENV: "production", COOKIE_SECURE: "false" }))).toBe(PLAIN_SESSION_COOKIE);
  });

  it("expires the cookie with the same attributes", () => {
    const env = { COOKIE_SECURE: true, SESSION_ABSOLUTE_HOURS: 12 };
    expect(expiredSessionCookieOptions(env)).toMatchObject({ httpOnly: true, secure: true, path: "/", maxAge: 0 });
  });
});

describe("getClientIp", () => {
  const h = (value: string | null) => ({ get: (name: string) => (name === "x-forwarded-for" ? value : null) });

  it("behind a trusted proxy, uses the last X-Forwarded-For entry", () => {
    expect(getClientIp(h("6.6.6.6, 10.1.2.3"), true)).toBe("10.1.2.3");
    expect(getClientIp(h("10.1.2.3"), true)).toBe("10.1.2.3");
  });

  it("without a proxy, uses the address written by Next.js", () => {
    expect(getClientIp(h("::ffff:127.0.0.1"), false)).toBe("127.0.0.1");
    expect(getClientIp(h("::1"), false)).toBe("::1");
  });

  it("returns null when missing or malformed", () => {
    expect(getClientIp(h(null), true)).toBeNull();
    expect(getClientIp(h("not an ip<script>"), false)).toBeNull();
    expect(getClientIp(h(""), false)).toBeNull();
  });
});
