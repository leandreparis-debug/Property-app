import { describe, expect, it } from "vitest";
import { businessDateOf, isCatchupDue, nextDailyRun, parseDailyTime, zonedTimeToInstant } from "@/domain/ops/schedule";

const AT_0330 = { hour: 3, minute: 30 };

describe("parseDailyTime", () => {
  it("accepts HH:MM and rejects the rest", () => {
    expect(parseDailyTime("03:30")).toEqual({ hour: 3, minute: 30 });
    expect(parseDailyTime(" 23:59 ")).toEqual({ hour: 23, minute: 59 });
    for (const bad of ["3:30", "24:00", "03:60", "0330", "", "aa:bb"]) expect(parseDailyTime(bad)).toBeNull();
  });
});

describe("nextDailyRun (Europe/Paris)", () => {
  it("nominal case: later the same day (summer time, UTC+2)", () => {
    // 1 October 2026, 01:00 Paris = 30 September 23:00 UTC.
    expect(nextDailyRun(new Date("2026-09-30T23:00:00Z"), AT_0330).toISOString()).toBe("2026-10-01T01:30:00.000Z");
  });

  it("time already past: the next day", () => {
    // 1 October 2026, 10:00 Paris.
    expect(nextDailyRun(new Date("2026-10-01T08:00:00Z"), AT_0330).toISOString()).toBe("2026-10-02T01:30:00.000Z");
  });

  it("exactly at the time: the next day (strictly after)", () => {
    expect(nextDailyRun(new Date("2026-10-01T01:30:00Z"), AT_0330).toISOString()).toBe("2026-10-02T01:30:00.000Z");
  });

  it("winter time (UTC+1)", () => {
    expect(nextDailyRun(new Date("2026-12-15T12:00:00Z"), AT_0330).toISOString()).toBe("2026-12-16T02:30:00.000Z");
  });

  it("autumn change on 25 October 2026: 03:30 exists once, in winter time", () => {
    // 24 October, 12:00 Paris (UTC+2) → 25 October 03:30 CET = 02:30 UTC.
    expect(nextDailyRun(new Date("2026-10-24T10:00:00Z"), AT_0330).toISOString()).toBe("2026-10-25T02:30:00.000Z");
    // 25 October, 12:00 Paris → 26 October 03:30 CET.
    expect(nextDailyRun(new Date("2026-10-25T11:00:00Z"), AT_0330).toISOString()).toBe("2026-10-26T02:30:00.000Z");
  });

  it("autumn change: an ambiguous time (02:30 happens twice) runs at its first occurrence", () => {
    expect(nextDailyRun(new Date("2026-10-24T10:00:00Z"), { hour: 2, minute: 30 }).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("spring change on 28 March 2027: 03:30 is in summer time", () => {
    // 27 March, 12:00 Paris (UTC+1) → 28 March 03:30 CEST = 01:30 UTC.
    expect(nextDailyRun(new Date("2027-03-27T11:00:00Z"), AT_0330).toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });

  it("spring change: a skipped time (02:30) is shifted forward by the gap", () => {
    expect(nextDailyRun(new Date("2027-03-27T11:00:00Z"), { hour: 2, minute: 30 }).toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });

  it("the interval between two runs is 23 h or 25 h across a change", () => {
    const before = nextDailyRun(new Date("2026-10-23T10:00:00Z"), AT_0330);
    const after = nextDailyRun(before, AT_0330);
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(25);
    const spring1 = nextDailyRun(new Date("2027-03-26T11:00:00Z"), AT_0330);
    expect((nextDailyRun(spring1, AT_0330).getTime() - spring1.getTime()) / 3_600_000).toBe(23);
  });
});

describe("businessDateOf", () => {
  it("is the Paris calendar day (00:00 UTC)", () => {
    // 31 December 2026, 23:30 UTC = 1 January 2027, 00:30 Paris.
    expect(businessDateOf(new Date("2026-12-31T23:30:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(businessDateOf(new Date("2026-10-05T08:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("zonedTimeToInstant", () => {
  it("converts a Paris wall-clock time", () => {
    expect(zonedTimeToInstant(2026, 7, 14, 12, 0, "Europe/Paris").toISOString()).toBe("2026-07-14T10:00:00.000Z");
  });
});

describe("isCatchupDue", () => {
  it("only when the time is past and nothing succeeded today", () => {
    const morning = new Date("2026-10-05T08:00:00Z"); // 10:00 Paris
    const night = new Date("2026-10-05T00:30:00Z"); // 02:30 Paris
    expect(isCatchupDue(morning, AT_0330, false)).toBe(true);
    expect(isCatchupDue(morning, AT_0330, true)).toBe(false);
    expect(isCatchupDue(night, AT_0330, false)).toBe(false);
  });
});
