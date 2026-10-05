import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  formatCurrency,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatDateWithPrecision,
  formatSurface,
} from "@/lib/format";

/** fr-FR uses a narrow no-break space (U+202F) as thousands separator. */
const NNBSP = " ";
/** …and a no-break space (U+00A0) before units, € and %. */
const NBSP = " ";

const invalidInputs = [null, undefined, Number.NaN, Infinity, -Infinity] as const;

describe.each([
  ["formatNumber", formatNumber],
  ["formatCurrency", formatCurrency],
  ["formatSurface", formatSurface],
  ["formatEnergy", formatEnergy],
  ["formatPercent", formatPercent],
] as const)("%s — missing values", (_name, fn) => {
  it.each(invalidInputs)("returns « — » for %s", (value) => {
    expect(fn(value)).toBe(EMPTY_VALUE);
  });

  it("never throws on non-numeric runtime values", () => {
    for (const value of ["12", {}, [], true, Symbol("x"), 10n] as unknown[]) {
      expect(fn(value as number)).toBe(EMPTY_VALUE);
    }
  });
});

describe("formatNumber", () => {
  it("groups thousands with a narrow no-break space", () => {
    expect(formatNumber(1234567)).toBe(`1${NNBSP}234${NNBSP}567`);
  });
  it("uses a decimal comma and trims to 2 decimals by default", () => {
    expect(formatNumber(1234.5678)).toBe(`1${NNBSP}234,57`);
  });
  it("supports fixed decimals", () => {
    expect(formatNumber(2, { decimals: 2 })).toBe("2,00");
  });
  it("handles zero, negative zero and negatives", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(-4200)).toBe(`-4${NNBSP}200`);
  });
  it("handles very large numbers", () => {
    expect(formatNumber(1e15)).toBe(`1${NNBSP}000${NNBSP}000${NNBSP}000${NNBSP}000${NNBSP}000`);
  });
});

describe("formatCurrency", () => {
  it("formats euros without decimals by default", () => {
    expect(formatCurrency(1250000)).toBe(`1${NNBSP}250${NNBSP}000${NBSP}€`);
  });
  it("rounds to the nearest euro", () => {
    expect(formatCurrency(1234.56)).toBe(`1${NNBSP}235${NBSP}€`);
  });
  it("supports decimals", () => {
    expect(formatCurrency(1234.5, { decimals: 2 })).toBe(`1${NNBSP}234,50${NBSP}€`);
  });
  it("handles zero and negatives", () => {
    expect(formatCurrency(0)).toBe(`0${NBSP}€`);
    expect(formatCurrency(-1500)).toBe(`-1${NNBSP}500${NBSP}€`);
  });
  it("handles very large amounts", () => {
    expect(formatCurrency(12_345_678_901)).toBe(`12${NNBSP}345${NNBSP}678${NNBSP}901${NBSP}€`);
  });
});

describe("formatSurface", () => {
  it("formats square metres", () => {
    expect(formatSurface(12450)).toBe(`12${NNBSP}450${NBSP}m²`);
  });
  it("rounds to whole m² by default and supports decimals", () => {
    expect(formatSurface(99.6)).toBe(`100${NBSP}m²`);
    expect(formatSurface(99.64, { decimals: 1 })).toBe(`99,6${NBSP}m²`);
  });
  it("handles zero and negatives", () => {
    expect(formatSurface(0)).toBe(`0${NBSP}m²`);
    expect(formatSurface(-120)).toBe(`-120${NBSP}m²`);
  });
});

describe("formatEnergy", () => {
  it("keeps kWh up to 10 000 kWh", () => {
    expect(formatEnergy(8500)).toBe(`8${NNBSP}500${NBSP}kWh`);
    expect(formatEnergy(10_000)).toBe(`10${NNBSP}000${NBSP}kWh`);
  });
  it("switches to MWh above 10 000 kWh", () => {
    expect(formatEnergy(10_001)).toBe(`10${NBSP}MWh`);
    expect(formatEnergy(12_500)).toBe(`12,5${NBSP}MWh`);
    expect(formatEnergy(1_284_000)).toBe(`1${NNBSP}284${NBSP}MWh`);
  });
  it("handles zero and negatives (including the MWh switch)", () => {
    expect(formatEnergy(0)).toBe(`0${NBSP}kWh`);
    expect(formatEnergy(-500)).toBe(`-500${NBSP}kWh`);
    expect(formatEnergy(-25_000)).toBe(`-25${NBSP}MWh`);
  });
  it("handles very large values", () => {
    expect(formatEnergy(5e9)).toBe(`5${NNBSP}000${NNBSP}000${NBSP}MWh`);
  });
});

describe("formatPercent", () => {
  it("is signed", () => {
    expect(formatPercent(3.2)).toBe(`+3,2${NBSP}%`);
    expect(formatPercent(-1.5)).toBe(`-1,5${NBSP}%`);
  });
  it("shows zero without a sign", () => {
    expect(formatPercent(0)).toBe(`0,0${NBSP}%`);
    expect(formatPercent(-0)).toBe(`0,0${NBSP}%`);
  });
  it("supports decimals", () => {
    expect(formatPercent(12.345, { decimals: 2 })).toBe(`+12,35${NBSP}%`);
  });
  it("can omit the sign for ratios", () => {
    expect(formatPercent(12.5, { signed: false })).toBe(`12,5${NBSP}%`);
    expect(formatPercent(-2, { signed: false })).toBe(`-2,0${NBSP}%`);
  });
  it("handles very large values", () => {
    expect(formatPercent(125000)).toBe(`+125${NNBSP}000,0${NBSP}%`);
  });
});

describe("formatDate", () => {
  it("formats in long French form", () => {
    expect(formatDate("2026-03-12")).toBe("12 mars 2026");
    expect(formatDate(new Date("2026-03-12T10:00:00Z"))).toBe("12 mars 2026");
  });
  it("uses the Europe/Paris time zone", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Paris.
    expect(formatDate("2025-12-31T23:30:00Z")).toBe("1 janvier 2026");
  });
  it("accepts epoch milliseconds, including 0", () => {
    expect(formatDate(0)).toBe("1 janvier 1970");
  });
  it("returns « — » for missing or invalid dates", () => {
    expect(formatDate(null)).toBe(EMPTY_VALUE);
    expect(formatDate(undefined)).toBe(EMPTY_VALUE);
    expect(formatDate("pas une date")).toBe(EMPTY_VALUE);
    expect(formatDate(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatDate(new Date("invalid"))).toBe(EMPTY_VALUE);
    expect(formatDate({} as unknown as Date)).toBe(EMPTY_VALUE);
  });
});

describe("formatDateWithPrecision", () => {
  const d = new Date("2019-01-01T00:00:00.000Z");
  it("shows only the year for precision year", () => {
    expect(formatDateWithPrecision(d, "year")).toBe("2019");
  });
  it("shows month and year for precision month", () => {
    expect(formatDateWithPrecision(new Date("2021-03-01T00:00:00.000Z"), "month")).toBe("mars 2021");
  });
  it("shows the full date for precision day or unknown", () => {
    expect(formatDateWithPrecision(new Date("2021-03-12T00:00:00.000Z"), "day")).toBe("12 mars 2021");
    expect(formatDateWithPrecision(new Date("2021-03-12T00:00:00.000Z"), null)).toBe("12 mars 2021");
  });
  it("returns « — » for missing values", () => {
    expect(formatDateWithPrecision(null, "year")).toBe(EMPTY_VALUE);
    expect(formatDateWithPrecision("n'importe quoi", "day")).toBe(EMPTY_VALUE);
  });
});

describe("formatDateTime, formatBytes, formatDuration (step 11)", () => {
  it("date and time in Paris", () => {
    expect(formatDateTime("2026-10-05T01:30:00Z")).toBe("5 oct. 2026, 03:30");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("pas une date")).toBe("—");
  });

  it("sizes in octets, ko, Mo, Go", () => {
    expect(formatBytes(0)).toBe("0 octets");
    expect(formatBytes(999)).toBe("999 octets");
    expect(formatBytes(12_400_000)).toBe("12 Mo");
    expect(formatBytes(1_250_000)).toBe("1,3 Mo");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });

  it("durations", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(12_400)).toBe("12 s");
    expect(formatDuration(185_000)).toBe("3 min 05 s");
    expect(formatDuration(3_720_000)).toBe("1 h 02 min");
    expect(formatDuration(undefined)).toBe("—");
  });
});
