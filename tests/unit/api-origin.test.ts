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
