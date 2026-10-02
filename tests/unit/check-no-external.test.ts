import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findExternalUrls, isAllowedUrl, scanDirectories } from "../../scripts/check-no-external";

describe("isAllowedUrl", () => {
  it("allows local hosts and XML namespaces", () => {
    expect(isAllowedUrl("http://localhost:3000/api")).toBe(true);
    expect(isAllowedUrl("http://127.0.0.1:1433")).toBe(true);
    expect(isAllowedUrl("http://www.w3.org/2000/svg")).toBe(true);
    expect(isAllowedUrl("http://www.w3.org/1999/xlink")).toBe(true);
  });

  it("rejects any other host, including look-alikes", () => {
    expect(isAllowedUrl("https://fonts.googleapis.com/css2")).toBe(false);
    expect(isAllowedUrl("https://localhost.evil.com/x")).toBe(false);
    expect(isAllowedUrl("https://www.w3.org/TR/CSS")).toBe(false);
  });
});

describe("findExternalUrls", () => {
  it("reports file and line for each external URL", () => {
    const content = ["const a = 1;", 'fetch("https://api.example.com/v1");', "// http://cdn.test/x.js."].join("\n");
    expect(findExternalUrls(content, "a.ts")).toEqual([
      { file: "a.ts", line: 2, url: "https://api.example.com/v1" },
      { file: "a.ts", line: 3, url: "http://cdn.test/x.js" },
    ]);
  });
});

describe("scanDirectories", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vigie-offline-"));
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("detects an external URL in a temporary file", () => {
    writeFileSync(
      join(root, "src", "nested", "leak.tsx"),
      'export const x = 1;\n<link href="https://cdn.example.org/lib.css" />\n',
    );
    const violations = scanDirectories(["src", "public"], root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: join("src", "nested", "leak.tsx"),
      line: 2,
      url: "https://cdn.example.org/lib.css",
    });
  });

  it("ignores allowed exceptions", () => {
    writeFileSync(
      join(root, "public", "logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>',
    );
    writeFileSync(join(root, "src", "dev.ts"), 'const u = "http://localhost:3000";\nconst v = "http://127.0.0.1:1433";\n');
    expect(scanDirectories(["src", "public"], root)).toEqual([]);
  });

  it("skips binary files and missing directories", () => {
    writeFileSync(join(root, "public", "font.woff2"), "https://example.com");
    expect(scanDirectories(["src", "public", "does-not-exist"], root)).toEqual([]);
  });
});
