import { describe, expect, it } from "vitest";
import { documentIdOf, parseTrashName, planTrashPurge } from "@/domain/ops/trash";

describe("trash names", () => {
  it("reads the deletion instant and the stored name written by deleteDocument", () => {
    const name = `${"2026-09-01T08:15:30.123Z".replace(/[:.]/g, "-")}-docabc123.pdf`;
    expect(parseTrashName(name)).toEqual({ trashedAt: new Date("2026-09-01T08:15:30.123Z"), storedName: "docabc123.pdf" });
    expect(documentIdOf("docabc123.pdf")).toBe("docabc123");
    expect(parseTrashName("notes.txt")).toBeNull();
  });
});

describe("planTrashPurge", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const entry = (name: string, modifiedAt = now) => ({ path: `trash/documents/${name}`, name, sizeBytes: 10, modifiedAt });

  it("keeps the files younger than the retention, erases the older ones (oldest first)", () => {
    const old = entry("2026-09-01T08-00-00-000Z-docold.pdf");
    const older = entry("2026-08-01T08-00-00-000Z-docolder.png");
    const recent = entry("2026-09-20T08-00-00-000Z-docnew.pdf");
    const plan = planTrashPurge([recent, old, older], now, 30);
    expect(plan.map((i) => i.documentId)).toEqual(["docolder", "docold"]);
  });

  it("falls back to the modification date for an unrecognised name", () => {
    const plan = planTrashPurge([entry("vieux.bin", new Date("2026-01-01T00:00:00Z")), entry("recent.bin")], now, 30);
    expect(plan.map((i) => i.name)).toEqual(["vieux.bin"]);
    expect(plan[0]!.documentId).toBeNull();
  });
});
