import { describe, expect, it } from "vitest";
import { csvField, issuesCsv, toCsv, UTF8_BOM } from "@/server/import/report";

describe("CSV report", () => {
  it("escapes separators, quotes and line breaks", () => {
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvField("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvField(null)).toBe("");
    expect(csvField(12)).toBe("12");
  });

  it("neutralises formulas (CSV injection) but keeps numbers and lone dashes", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"\"x\"\")".replace(/^/, '"').replace(/$/, '"'));
    expect(csvField("+33 1 23")).toBe("'+33 1 23");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("-12,5")).toBe("-12,5");
    expect(csvField("-")).toBe("-");
  });

  it("starts with a BOM and uses CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [[1, "x"]]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}a;b\r\n1;x\r\n`);
  });

  it("orders issues by row then severity, with French severities", () => {
    const csv = issuesCsv([
      { row: 5, code: "B", column: "X", severity: "info", kind: "k", original: null, retained: null, message: "m1" },
      { row: 5, code: "B", column: "X", severity: "error", kind: "k", original: null, retained: null, message: "m2" },
      { row: null, code: null, column: "Y", severity: "warning", kind: "k", original: null, retained: null, message: "m3" },
    ]);
    expect(csv.split("\r\n").slice(1, 4)).toEqual([";;Y;avertissement;;;m3", "5;B;X;erreur;;;m2", "5;B;X;info;;;m1"]);
  });
});
