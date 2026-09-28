import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { METRICS } from "@/domain/metrics";

const doc = readFileSync(new URL("../../docs/source-mapping.md", import.meta.url), "utf8");
const rows = doc
  .split("\n")
  .filter((line) => /^\| \d+ \|/.test(line))
  .map((line) => line.split("|").map((cell) => cell.trim()))
  .map(([, index, column, target]) => ({ index: Number(index), column: column!, target: target! }));

describe("docs/source-mapping.md", () => {
  it("lists the 183 spreadsheet columns once, numbered in order", () => {
    expect(rows).toHaveLength(183);
    expect(rows.map((r) => r.index)).toEqual(rows.map((_, i) => i + 1));
    expect(new Set(rows.map((r) => r.column)).size).toBe(183);
    expect(rows[0]?.column).toBe("ENTREPOT");
    expect(rows.at(-1)?.column).toBe("Date modif");
  });

  it("gives every column a destination", () => {
    for (const row of rows) expect(row.target, row.column).not.toBe("");
  });

  it("maps every catalogued source column to its metric, and nothing else to annual_metrics", () => {
    const expected = new Map(METRICS.flatMap((m) => m.sourceColumns.map((c) => [c, m.code] as const)));
    const mapped = rows.filter((r) => r.target.startsWith("`annual_metrics`"));
    expect(mapped).toHaveLength(expected.size);
    for (const row of mapped) {
      expect(row.target, row.column).toContain(`\`${expected.get(row.column)}\``);
    }
  });

  it("never stores per-m² or N-1 columns except the two contractual prices", () => {
    const derived = rows.filter((r) => /\/\s*M[²2]|PAR M²|EVOLUTION|M² BUREAUX/i.test(r.column));
    const stored = derived.filter((r) => !r.target.includes("**calculé**")).map((r) => r.column);
    expect(stored).toEqual(["LOYER ECONOMIQUE / M²", "PRIX BUREAUX / M2"]);
  });
});
