import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const root = mkdtempSync(join(tmpdir(), "atlas-storage-"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ STORAGE_ROOT: root }) }));
const { ensureStorageDir, resolveStoragePath, StoragePathError, storageRoot, toStorageRelative } = await import("@/server/storage");

describe("storage paths", () => {
  beforeAll(() => expect(storageRoot()).toBe(root));

  it("resolves paths under STORAGE_ROOT", () => {
    expect(resolveStoragePath("imports", "batch-1", "report.csv")).toBe(join(root, "imports", "batch-1", "report.csv"));
    expect(toStorageRelative(resolveStoragePath("imports", "b"))).toBe("imports/b");
  });

  it.each([["..", "etc"], ["imports/../../etc"], ["/etc/passwd"], ["imports", "..", "..", "x"], ["a\0b"]])(
    "refuses directory traversal %j",
    (...segments) => {
      expect(() => resolveStoragePath(...segments)).toThrow(StoragePathError);
    },
  );

  it("creates directories on demand", async () => {
    const dir = await ensureStorageDir("imports", "dry-run-test");
    expect(dir).toBe(join(root, "imports", "dry-run-test"));
  });
});
