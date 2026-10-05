import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareDateOnly,
  diffInDays,
  toDateOnly,
  toIsoDate,
  todayDateOnly,
} from "@/domain/dates";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function suite() {
  it("keeps the written calendar day of ISO and French strings", () => {
    expect(iso(toDateOnly("2026-03-12"))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly("2026-03-12T23:59:00+14:00"))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly("12/03/2026"))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly("1/1/2026"))).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses the local calendar day of a local Date (no shift)", () => {
    expect(iso(toDateOnly(new Date(2026, 2, 12)))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly(new Date(2026, 2, 12, 23, 59, 59)))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly(new Date(2026, 0, 1, 0, 0, 1)))).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps a Date already at 00:00 UTC (value read from a DATE column)", () => {
    const fromDb = new Date("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly(fromDb))).toBe("2026-03-12T00:00:00.000Z");
    expect(iso(toDateOnly(fromDb.getTime()))).toBe("2026-03-12T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const once = toDateOnly(new Date(2026, 11, 31, 22, 0));
    expect(iso(toDateOnly(once))).toBe(iso(once));
    expect(toIsoDate(once)).toBe("2026-12-31");
  });

  it("returns null for missing or impossible dates", () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
    expect(toDateOnly("")).toBeNull();
    expect(toDateOnly("demain")).toBeNull();
    expect(toDateOnly("2026-02-30")).toBeNull();
    expect(toDateOnly("31/04/2026")).toBeNull();
    expect(toDateOnly(new Date("invalid"))).toBeNull();
    expect(toDateOnly({} as unknown as Date)).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });

  it("computes today in Europe/Paris", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Paris.
    expect(toIsoDate(todayDateOnly(new Date("2025-12-31T23:30:00Z")))).toBe("2026-01-01");
    expect(toIsoDate(todayDateOnly(new Date("2026-06-15T10:00:00Z")))).toBe("2026-06-15");
  });
}

describe.each(["Pacific/Kiritimati", "America/Los_Angeles", "Europe/Paris", "UTC"])(
  "toDateOnly with TZ=%s",
  (tz) => {
    let previous: string | undefined;
    beforeAll(() => {
      previous = process.env.TZ;
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = previous;
    });

    it("runs in the requested time zone", () => {
      const offsets: Record<string, number> = {
        "Pacific/Kiritimati": -840,
        "America/Los_Angeles": 480, // winter (PST)
        "Europe/Paris": -60,
        UTC: 0,
      };
      expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(offsets[tz]);
    });

    suite();
  },
);

describe("addMonths", () => {
  const d = (s: string) => toDateOnly(s) as Date;

  it("adds and subtracts months", () => {
    expect(toIsoDate(addMonths(d("2026-03-12"), 6))).toBe("2026-09-12");
    expect(toIsoDate(addMonths(d("2026-03-12"), -6))).toBe("2025-09-12");
    expect(toIsoDate(addMonths(d("2026-03-12"), -15))).toBe("2024-12-12");
  });

  it("clamps to the end of the month", () => {
    expect(toIsoDate(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIsoDate(addMonths(d("2024-01-31"), 1))).toBe("2024-02-29");
    expect(toIsoDate(addMonths(d("2026-08-31"), -6))).toBe("2026-02-28");
  });

  it("does not mutate its input", () => {
    const input = d("2026-03-12");
    addMonths(input, 3);
    expect(toIsoDate(input)).toBe("2026-03-12");
  });
});

describe("addDays / diffInDays / compareDateOnly", () => {
  const d = (s: string) => toDateOnly(s) as Date;

  it("works across DST changes and years", () => {
    expect(toIsoDate(addDays(d("2026-03-28"), 2))).toBe("2026-03-30");
    expect(toIsoDate(addDays(d("2026-01-01"), -1))).toBe("2025-12-31");
    expect(diffInDays(d("2026-03-28"), d("2026-03-30"))).toBe(2);
    expect(diffInDays(d("2026-12-31"), d("2026-01-01"))).toBe(-364);
  });

  it("sorts dates", () => {
    const dates = [d("2026-03-12"), d("2025-01-01"), d("2026-01-01")];
    expect(dates.sort(compareDateOnly).map(toIsoDate)).toEqual(["2025-01-01", "2026-01-01", "2026-03-12"]);
  });
});
