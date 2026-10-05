/**
 * Time arithmetic of the operations scheduler (step 11). PURE: the clock is
 * always injected, the time zone is explicit (Europe/Paris by default), and
 * daylight-saving changes are handled through `Intl`, never by adding fixed
 * offsets.
 */
import { BUSINESS_TIME_ZONE } from "../dates";

/** A wall-clock time of day (`HH:MM`). */
export interface DailyTime {
  hour: number;
  minute: number;
}

const DAILY_AT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parses an `HH:MM` time of day (24-hour clock).
 * @param value - E.g. « 03:30 ».
 * @returns The time, or `null` when malformed.
 */
export function parseDailyTime(value: string): DailyTime | null {
  const match = DAILY_AT.exec(value.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
function zonedParts(instant: number, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!, minute: parts.minute!, second: parts.second! };
}

/** Offset (ms) of a time zone at an instant: local wall clock minus UTC. */
function offsetAt(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Instant of a wall-clock time in a time zone.
 * - Ambiguous time (autumn change, the hour happens twice): the FIRST occurrence.
 * - Nonexistent time (spring change, the hour is skipped): shifted forward by
 *   the gap (02:30 on the day clocks jump from 02:00 to 03:00 → 03:30).
 */
export function zonedTimeToInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetAt(local - 12 * 3_600_000, timeZone);
  const after = offsetAt(local + 12 * 3_600_000, timeZone);
  const valid = [...new Set([before, after])]
    .map((offset) => local - offset)
    .filter((t) => offsetAt(t, timeZone) === local - t)
    .sort((a, b) => a - b);
  return new Date(valid[0] ?? local - before);
}

/**
 * Calendar day of an instant in a time zone, as a business date (00:00 UTC,
 * see `dates.ts`).
 * @param now - Instant.
 * @param timeZone - Defaults to Europe/Paris.
 */
export function businessDateOf(now: Date, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const p = zonedParts(now.getTime(), timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/**
 * Instant of today's daily occurrence (calendar day of `now` in the zone).
 * @param now - Current instant.
 * @param at - Time of day.
 * @param timeZone - Defaults to Europe/Paris.
 */
export function todaysOccurrence(now: Date, at: DailyTime, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const p = zonedParts(now.getTime(), timeZone);
  return zonedTimeToInstant(p.year, p.month, p.day, at.hour, at.minute, timeZone);
}

/**
 * Next daily occurrence strictly after `now`.
 * @param now - Current instant (injected).
 * @param at - Time of day (e.g. 03:30).
 * @param timeZone - Defaults to Europe/Paris.
 * @returns Today's occurrence if still to come, otherwise tomorrow's.
 */
export function nextDailyRun(now: Date, at: DailyTime, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const today = todaysOccurrence(now, at, timeZone);
  if (today.getTime() > now.getTime()) return today;
  const p = zonedParts(now.getTime(), timeZone);
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedTimeToInstant(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), at.hour, at.minute, timeZone);
}

/**
 * Whether a catch-up run is due at start-up: today's time is already past and
 * no successful run exists for today's business date.
 * @param now - Current instant.
 * @param at - Time of day.
 * @param hasSuccessToday - A successful scheduled or catch-up run exists for today.
 * @param timeZone - Defaults to Europe/Paris.
 */
export function isCatchupDue(now: Date, at: DailyTime, hasSuccessToday: boolean, timeZone: string = BUSINESS_TIME_ZONE): boolean {
  return !hasSuccessToday && now.getTime() >= todaysOccurrence(now, at, timeZone).getTime();
}

/** Delay before a catch-up run (lets the server finish starting). */
export const CATCHUP_DELAY_MS = 2 * 60 * 1000;

/** A run still `running` after this delay is considered failed (interrupted process). */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000;
