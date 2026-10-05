import { describe, expect, it } from "vitest";
import { cellText, CSV_BOM, csvField, csvLine, neutralizeFormula, toCsvDocument } from "@/domain/export/csv";

describe("neutralizeFormula", () => {
  it("prefixes texts starting with =, +, -, @, tab or carriage return", () => {
    for (const text of ["=SUM(A1:A2)", "+33 1 23", "-2+3", "@cmd", "\tx", "\rx", '=HYPERLINK("http://x")']) {
      expect(neutralizeFormula(text)).toBe(`'${text}`);
    }
  });

  it("leaves other texts unchanged", () => {
    for (const text of ["Entrepôt", " =pas au début", "A=B", "", "12"]) expect(neutralizeFormula(text)).toBe(text);
  });
});

describe("cellText", () => {
  it("numbers with a decimal point, never neutralised (negative numbers stay numbers)", () => {
    expect(cellText(1234.5)).toBe("1234.5");
    expect(cellText(-12)).toBe("-12");
    expect(cellText(0)).toBe("0");
    expect(cellText(Number.NaN)).toBe("");
    expect(cellText(12n)).toBe("12");
  });

  it("dates in ISO 8601: instants with time (UTC), business dates as YYYY-MM-DD", () => {
    expect(cellText(new Date("2026-10-05T01:30:00.000Z"))).toBe("2026-10-05T01:30:00.000Z");
    expect(cellText({ dateOnly: new Date("2027-03-31T00:00:00.000Z") })).toBe("2027-03-31");
  });

  it("booleans, empty values", () => {
    expect(cellText(true)).toBe("true");
    expect(cellText(false)).toBe("false");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
  });

  it("a negative number written as TEXT is neutralised", () => {
    expect(cellText("-12")).toBe("'-12");
  });
});

describe("csvField (RFC 4180)", () => {
  it("quotes fields containing the separator, quotes or line breaks; doubles inner quotes", () => {
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvField("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvField("ligne 1\r\nligne 2")).toBe('"ligne 1\r\nligne 2"');
    expect(csvField("simple")).toBe("simple");
  });

  it("neutralises then quotes: a formula with a separator", () => {
    expect(csvField("=1;2")).toBe(`"'=1;2"`);
    expect(csvField("\r=x")).toBe(`"'\r=x"`);
  });
});

describe("CSV document", () => {
  it("BOM, `;` separator, CRLF after every line including the last", () => {
    const doc = toCsvDocument(["code", "valeur"], [["A1", 1.5], ["B2", null]]);
    expect(doc.startsWith(CSV_BOM)).toBe(true);
    expect(doc).toBe(`${CSV_BOM}code;valeur\r\nA1;1.5\r\nB2;\r\n`);
    expect(csvLine(["x", true])).toBe("x;true\r\n");
  });
});
