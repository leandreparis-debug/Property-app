import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/server/auth/origin";

describe("isSameOrigin (CSRF check of route handlers)", () => {
  const app = "http://localhost:3000";
  it("accepts the exact origin of APP_URL", () => {
    expect(isSameOrigin("http://localhost:3000", app)).toBe(true);
    expect(isSameOrigin("http://localhost:3000", "http://localhost:3000/some/path")).toBe(true);
  });
  it.each([null, "", "null", "http://evil.test", "http://localhost:3001", "https://localhost:3000", "http://localhost.evil.test:3000"])(
    "refuses %j",
    (origin) => {
      expect(isSameOrigin(origin, app)).toBe(false);
    },
  );
});

describe("isSameOrigin with SERVER_ACTIONS_ALLOWED_ORIGINS (GitHub Codespaces)", () => {
  const app = "https://vigie-x-3000.app.github.dev";
  it("accepts the Origin rewritten to localhost:3000 by the Codespaces proxy only when listed", () => {
    expect(isSameOrigin("http://localhost:3000", app)).toBe(false);
    expect(isSameOrigin("http://localhost:3000", app, "vigie-x-3000.app.github.dev,localhost:3000")).toBe(true);
    expect(isSameOrigin("https://vigie-x-3000.app.github.dev", app, "vigie-x-3000.app.github.dev,localhost:3000")).toBe(true);
  });
  it("still refuses any other origin", () => {
    expect(isSameOrigin("https://evil.example", app, "vigie-x-3000.app.github.dev,localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3001", app, "localhost:3000")).toBe(false);
    expect(isSameOrigin(null, app, "localhost:3000")).toBe(false);
  });
});
