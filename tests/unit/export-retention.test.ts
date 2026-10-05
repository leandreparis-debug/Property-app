import { describe, expect, it } from "vitest";
import { exportFolderName, parseExportFolderName, selectExportsToDelete, type ExportFolder } from "@/domain/export/retention";

const POLICY = { days: 30, months: 12 };
const at = (iso: string, complete = true): ExportFolder => {
  const createdAt = new Date(iso);
  return { name: exportFolderName(createdAt, `run${createdAt.getTime().toString(36)}`), createdAt, complete };
};

describe("folder names", () => {
  it("Paris wall clock and short run id; parsed back to the same instant", () => {
    const instant = new Date("2026-10-05T01:30:00Z"); // 03:30 in Paris (summer time)
    const name = exportFolderName(instant, "cmg1abcdefghijk12345678");
    expect(name).toBe("2026-10-05T0330_12345678");
    expect(parseExportFolderName(name)?.toISOString()).toBe(instant.toISOString());
  });

  it("rejects other names", () => {
    for (const bad of [".tmp-abc", "2026-10-05", "2026-13-05T0330_x", "notes.txt", "2026-10-05T0330_"]) expect(parseExportFolderName(bad)).toBeNull();
  });
});

describe("selectExportsToDelete", () => {
  const now = new Date("2026-10-05T10:00:00Z");

  it("keeps every export younger than 30 days", () => {
    const recent = Array.from({ length: 30 }, (_, i) => at(new Date(now.getTime() - i * 86_400_000 - 3_600_000).toISOString()));
    expect(selectExportsToDelete(recent, now, POLICY)).toEqual([]);
  });

  it("beyond 30 days, keeps the first export of each month for 12 months and deletes the rest", () => {
    const exports = [
      at("2026-08-01T01:30:00Z"), // first of August → kept
      at("2026-08-02T01:30:00Z"),
      at("2026-08-31T01:30:00Z"),
      at("2026-07-15T01:30:00Z"), // first (only) of July → kept
      at("2025-11-03T02:30:00Z"), // November 2025: 11 months ago → kept
      at("2025-10-01T01:30:00Z"), // October 2025: 12 months ago → deleted
      at("2026-10-04T01:30:00Z"), // recent → kept
    ];
    const deleted = selectExportsToDelete(exports, now, POLICY);
    expect(deleted.sort()).toEqual([exports[1]!.name, exports[2]!.name, exports[5]!.name].sort());
  });

  it("never deletes the last successful export, however old", () => {
    const old = [at("2024-01-02T02:30:00Z"), at("2024-01-01T02:30:00Z")];
    const deleted = selectExportsToDelete(old, now, POLICY);
    expect(deleted).toEqual([old[1]!.name]);
    expect(deleted).not.toContain(old[0]!.name);
  });

  it("an incomplete export never counts as the last one; incomplete folders older than one day are deleted", () => {
    const complete = at("2024-01-02T02:30:00Z");
    const brokenOld = at("2026-10-01T02:30:00Z", false);
    const brokenRecent = at("2026-10-05T08:00:00Z", false);
    const deleted = selectExportsToDelete([complete, brokenOld, brokenRecent], now, POLICY);
    expect(deleted).toEqual([brokenOld.name]);
  });

  it("nothing to do without exports", () => {
    expect(selectExportsToDelete([], now, POLICY)).toEqual([]);
  });
});
