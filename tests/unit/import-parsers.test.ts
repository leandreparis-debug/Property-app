import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  classifyReference,
  configurePlaceholders,
  DEFAULT_PLACEHOLDERS,
  isPlaceholder,
  parseArea,
  parseBoolean,
  parseDate,
  parseDates,
  parseDurationMonths,
  parseEnergy,
  parseExternalIds,
  parseHeight,
  parseIcpeHeadings,
  parseInteger,
  parseMoney,
  parseNumber,
  parseText,
} from "@/server/import/parsers";

const NOW = new Date("2026-09-28T12:00:00Z");
const iso = (r: { value: { date: Date } | null }) => r.value?.date.toISOString().slice(0, 10) ?? null;

describe("placeholders", () => {
  it.each(["", "-", "–", "/", "NC", "N/C", "NA", "N/A", "?", "néant", "Néant", "nd", "x", "X", "à venir", "A venir", "en cours", " NC "])(
    "« %s » is empty with an info (never a warning)",
    (value) => {
      expect(isPlaceholder(value)).toBe(true);
      for (const parse of [parseNumber, parseText, parseMoney] as const) {
        const result = parse(value);
        expect(result.value).toBeNull();
        if (value.trim() !== "") expect(result.issue).toMatchObject({ severity: "info", kind: "placeholder" });
        else expect(result.issue).toBeUndefined();
      }
    },
  );

  it("is configurable", () => {
    configurePlaceholders(["inconnu"]);
    expect(isPlaceholder("Inconnu")).toBe(true);
    expect(isPlaceholder("NC")).toBe(false);
    configurePlaceholders();
    expect(isPlaceholder("NC")).toBe(true);
    expect(DEFAULT_PLACEHOLDERS).toContain("à venir".normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  });

  it("treats null, undefined and blank cells as empty without any issue", () => {
    expect(parseNumber(null)).toEqual({ value: null });
    expect(parseText(undefined)).toEqual({ value: null });
    expect(parseDate("   ")).toEqual({ value: null });
  });
});

describe("parseNumber", () => {
  it.each([
    ["12 345,67", 12345.67],
    ["12345.67", 12345.67],
    ["12 345 €", 12345],
    ["12 345 m²", 12345],
    ["12 345 m2", 12345],
    ["1 234 kWh", 1234],
    ["12\u00a0345,5", 12345.5],
    ["12\u202f345", 12345],
    ["-3,5", -3.5],
    ["(1 200)", -1200],
    ["1.234.567", 1234567],
    ["1,234.50", 1234.5],
    ["1.234,50", 1234.5],
    ["+42", 42],
    ["0", 0],
  ])("%j → %d", (input, expected) => {
    expect(parseNumber(input)).toEqual({ value: expected });
  });

  it("keeps a numeric cell as is and rounds to the column scale", () => {
    expect(parseNumber(1234.5678)).toEqual({ value: 1234.5678 });
    expect(parseNumber(1234.5678, 2)).toEqual({ value: 1234.57 });
    expect(parseNumber(-1.005, 2).value).toBe(-1.01);
  });

  it("rejects non-numeric text with a warning", () => {
    for (const value of ["douze", "12 ou 13", "1-2", "abc123"]) {
      expect(parseNumber(value)).toMatchObject({ value: null, issue: { severity: "warning", kind: "not_a_number" } });
    }
    expect(parseNumber(true).issue?.kind).toBe("not_a_number");
  });
});

describe("typed numbers and bounds", () => {
  it("keeps out-of-bounds values with a warning", () => {
    expect(parseArea("600 000 m²")).toMatchObject({ value: 600000, issue: { severity: "warning", kind: "out_of_bounds" } });
    expect(parseArea(-5).issue?.kind).toBe("out_of_bounds");
    expect(parseHeight(75)).toMatchObject({ value: 75, issue: { kind: "out_of_bounds" } });
    expect(parseMoney("-1 500 €")).toMatchObject({ value: -1500, issue: { kind: "out_of_bounds" } });
  });

  it("accepts plausible values silently", () => {
    expect(parseArea("48 320 m²")).toEqual({ value: 48320 });
    expect(parseHeight("12,5")).toEqual({ value: 12.5 });
    expect(parseMoney("1 250 000,00 €")).toEqual({ value: 1250000 });
    expect(parseEnergy("1 234 kWh")).toEqual({ value: 1234 });
  });

  it("converts MWh to kWh", () => {
    expect(parseEnergy("12,5 MWh")).toMatchObject({ value: 12500, issue: { severity: "info", kind: "unit_converted" } });
  });

  it("rounds non-integers when an integer is expected", () => {
    expect(parseInteger("12,6")).toMatchObject({ value: 13, issue: { kind: "not_an_integer" } });
    expect(parseInteger(40)).toEqual({ value: 40 });
  });
});

describe("parseBoolean", () => {
  it.each([
    ["Oui", true], ["oui", true], ["O", true], ["Yes", true], ["X", true], ["x", true], ["Vrai", true], ["1", true], [1, true], [true, true],
    ["Non", false], ["NON", false], ["N", false], ["No", false], ["Faux", false], ["0", false], [0, false], [false, false],
  ])("%j → %s", (input, expected) => {
    expect(parseBoolean(input)).toEqual({ value: expected });
  });

  it("returns null with a warning for anything else", () => {
    expect(parseBoolean("peut-être")).toMatchObject({ value: null, issue: { severity: "warning", kind: "not_a_boolean" } });
    expect(parseBoolean(2).issue?.kind).toBe("not_a_boolean");
  });

  it("returns null with an info for placeholders", () => {
    expect(parseBoolean("NC")).toMatchObject({ value: null, issue: { severity: "info" } });
    expect(parseBoolean(null)).toEqual({ value: null });
  });
});

describe.each(["Pacific/Kiritimati", "America/Los_Angeles"])("parseDate (TZ=%s)", (tz) => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = previous;
  });

  it("reads an Excel date cell (UTC instant) without shifting the day", () => {
    expect(parseDate(new Date("2021-03-12T00:00:00.000Z"), NOW)).toEqual({ value: { date: new Date("2021-03-12T00:00:00.000Z"), precision: "day" } });
    expect(iso(parseDate(new Date("2021-12-31T23:59:59.000Z"), NOW))).toBe("2021-12-31");
  });

  it.each([
    [44267, "2021-03-12", "day"],
    ["12/03/2021", "2021-03-12", "day"],
    ["12/03/21", "2021-03-12", "day"],
    ["01/02/99", "1999-02-01", "day"],
    ["12.03.2021", "2021-03-12", "day"],
    ["2021-03-12", "2021-03-12", "day"],
    ["2021-03-12T10:00:00Z", "2021-03-12", "day"],
    ["03/2021", "2021-03-01", "month"],
    ["2019", "2019-01-01", "year"],
    [2019, "2019-01-01", "year"],
    ["mars 2021", "2021-03-01", "month"],
    ["janv. 2020", "2020-01-01", "month"],
    ["Février 2022", "2022-02-01", "month"],
    ["12 mars 2021", "2021-03-12", "day"],
    ["1er juin 2019", "2019-06-01", "day"],
  ])("%j → %s (%s)", (input, expected, precision) => {
    const result = parseDate(input, NOW);
    expect(iso(result)).toBe(expected);
    expect(result.value?.precision).toBe(precision);
    expect(result.issue).toBeUndefined();
  });

  it("rejects impossible or unreadable dates with a warning", () => {
    for (const value of ["31/02/2021", "13/2021", "demain", "2021-13-01", 12, true]) {
      expect(parseDate(value as never, NOW)).toMatchObject({ value: null, issue: { severity: "warning", kind: "invalid_date" } });
    }
  });
});

describe("parseDates", () => {
  it("splits several dates in one cell and removes duplicates", () => {
    const result = parseDates("1998 ; 2004, 12/03/2010 et 03/2016 ; 2004", NOW);
    expect(result.value.map((d) => [d.date.toISOString().slice(0, 10), d.precision])).toEqual([
      ["1998-01-01", "year"],
      ["2004-01-01", "year"],
      ["2010-03-12", "day"],
      ["2016-03-01", "month"],
    ]);
    expect(result.issues).toEqual([]);
  });

  it("keeps readable parts and reports the others", () => {
    const result = parseDates("2004 ; plus tard", NOW);
    expect(result.value).toHaveLength(1);
    expect(result.issues[0]?.kind).toBe("invalid_date");
  });

  it("accepts a single date cell and empty cells", () => {
    expect(parseDates(new Date("2004-06-15T00:00:00Z"), NOW).value).toHaveLength(1);
    expect(parseDates(null, NOW)).toEqual({ value: [], issues: [] });
  });
});

describe("parseDurationMonths", () => {
  it.each([
    ["6 mois", 6], ["6", 6], [6, 6], ["1 an", 12], ["2 ans", 24], ["18 mois", 18], ["3 ans ferme", 36], ["six mois", 6], ["un an", 12], ["12 mois minimum", 12],
  ])("%j → %d months", (input, expected) => {
    expect(parseDurationMonths(input)).toEqual({ value: expected });
  });

  it("returns null with a warning for unconvertible text", () => {
    for (const value of ["à chaque échéance triennale", "6 mois avant la fin de chaque période", "1,5 mois"]) {
      expect(parseDurationMonths(value)).toMatchObject({ value: null, issue: { kind: "invalid_duration" } });
    }
  });
});

describe("parseText", () => {
  it("trims, reduces spaces and keeps line breaks", () => {
    expect(parseText("  Bail   commercial \t 3/6/9  ")).toEqual({ value: "Bail commercial 3/6/9" });
    expect(parseText("ligne 1  \n\n\n\n  ligne 2")).toEqual({ value: "ligne 1\n\nligne 2" });
  });

  it("truncates to the column length with a warning", () => {
    expect(parseText("abcdef", 4)).toMatchObject({ value: "abcd", issue: { kind: "text_truncated" } });
    expect(parseText("abcd", 4)).toEqual({ value: "abcd" });
  });
});

describe("parseIcpeHeadings", () => {
  it("parses codes and regimes", () => {
    expect(parseIcpeHeadings("1510-E, 2925-D ; 4331 (A)")).toEqual({
      value: [{ code: "1510", regime: "E" }, { code: "2925", regime: "D" }, { code: "4331", regime: "A" }],
      issues: [],
    });
    expect(parseIcpeHeadings("1510 DC / 1511 NC").value).toEqual([{ code: "1510", regime: "DC" }, { code: "1511", regime: "NC" }]);
  });

  it("uses UNKNOWN for a missing regime, with an info", () => {
    const result = parseIcpeHeadings("Rubriques 1510 et 2925 (à confirmer)");
    expect(result.value).toEqual([{ code: "1510", regime: "UNKNOWN" }, { code: "2925", regime: "UNKNOWN" }]);
    expect(result.issues[0]).toMatchObject({ severity: "info", kind: "icpe_regime_unknown" });
  });

  it("merges duplicated codes and warns when nothing is recognised", () => {
    expect(parseIcpeHeadings("1510 ; 1510-E").value).toEqual([{ code: "1510", regime: "E" }]);
    expect(parseIcpeHeadings("entrepôt couvert").issues[0]?.kind).toBe("icpe_unparsed");
    expect(parseIcpeHeadings("NC")).toEqual({ value: [], issues: [] });
  });
});

describe("parseExternalIds", () => {
  it("splits on ; , / | and line breaks, removing duplicates", () => {
    expect(parseExternalIds("QS-1 ; QS-2, QS-3 / QS-4 | QS-5\nQS-1").value).toEqual(["QS-1", "QS-2", "QS-3", "QS-4", "QS-5"]);
  });
  it("upper-cases and removes spaces when normalising (RAMSES, AL)", () => {
    expect(parseExternalIds("al 0101", true).value).toEqual(["AL0101"]);
    expect(parseExternalIds(12345, true).value).toEqual(["12345"]);
    expect(parseExternalIds("NC").value).toEqual([]);
  });
});

describe("classifyReference", () => {
  it.each([
    ["https://ged.example/bail.pdf", null, "url", "https://ged.example/bail.pdf"],
    ["\\\\srv\\baux\\bail.pdf", null, "unc_path", "\\\\srv\\baux\\bail.pdf"],
    ["C:\\Documents\\bail.pdf", null, "local_path", "C:\\Documents\\bail.pdf"],
    ["Oui", null, "yes_no", "Oui"],
    ["non", null, "yes_no", "non"],
    ["NC", null, "empty", null],
    [null, null, "empty", null],
    ["Classeur Baux 2021", null, "other", "Classeur Baux 2021"],
    ["Bail signé (PDF)", "https://ged.example/baux/1.pdf", "url", "https://ged.example/baux/1.pdf"],
  ] as const)("%j (link %j) → %s", (text, link, kind, value) => {
    expect(classifyReference(text, link)).toEqual({ kind, value });
  });
});
