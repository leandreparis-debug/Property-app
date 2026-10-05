import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/server/auth/safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/sites", "/", "/sites?region=Bretagne&page=2", "/sites/DEMO-001#bail", "/supervision"])(
    "accepts the internal path %s",
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    "//evil.com",
    "//evil.com/sites",
    "/\\evil.com",
    "/\\/evil.com",
    "https://evil.com",
    "http://localhost:3000/sites",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "sites",
    "",
    "/\t/evil.com",
    "/\n/evil.com",
    " /sites",
  ])("rejects %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it("rejects missing values and uses the fallback", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("//evil.com", "/sites")).toBe("/sites");
  });

  it("takes the first value of an array", () => {
    expect(safeRedirectPath(["/sites", "//evil.com"])).toBe("/sites");
  });

  it("never redirects back to the login page", () => {
    expect(safeRedirectPath("/login?next=/login")).toBe("/");
  });

  it("keeps percent-encoded characters inside the path (no host change)", () => {
    expect(safeRedirectPath("/%0a/evil.com")).toBe("/%0a/evil.com");
  });

  it("rejects absurdly long values", () => {
    expect(safeRedirectPath(`/${"a".repeat(3000)}`)).toBe("/");
  });
});
