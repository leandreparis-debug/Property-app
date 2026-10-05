import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL:
    "sqlserver://localhost:1433;database=vigie;user=sa;password=x;trustServerCertificate=true",
  APP_URL: "http://localhost:3000",
};

function errorOf(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a valid configuration and applies session defaults", () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      COOKIE_SECURE: false,
      SESSION_IDLE_MINUTES: 240,
      SESSION_ABSOLUTE_HOURS: 12,
      TRUST_PROXY: false,
      STORAGE_ROOT: "./storage",
      MAP_BASEMAP: "ign",
      OPS_SCHEDULER: "off",
      OPS_DAILY_AT: "03:30",
    });
  });

  it("OPS_SCHEDULER: off by default in test, on otherwise; OPS_DAILY_AT must be HH:MM", () => {
    expect(parseEnv({ ...valid, NODE_ENV: "development" }).OPS_SCHEDULER).toBe("on");
    expect(parseEnv({ ...valid, NODE_ENV: "production", STORAGE_ROOT: "/srv" }).OPS_SCHEDULER).toBe("on");
    expect(parseEnv({ ...valid, OPS_SCHEDULER: "on" }).OPS_SCHEDULER).toBe("on");
    expect(errorOf(() => parseEnv({ ...valid, OPS_SCHEDULER: "yes" })).variables).toEqual(["OPS_SCHEDULER"]);
    expect(parseEnv({ ...valid, OPS_DAILY_AT: "04:15" }).OPS_DAILY_AT).toBe("04:15");
    expect(errorOf(() => parseEnv({ ...valid, OPS_DAILY_AT: "4h15" })).variables).toEqual(["OPS_DAILY_AT"]);
  });

  it("MAP_BASEMAP: ign by default, offline accepted, anything else refused", () => {
    expect(parseEnv({ ...valid, MAP_BASEMAP: "offline" }).MAP_BASEMAP).toBe("offline");
    expect(errorOf(() => parseEnv({ ...valid, MAP_BASEMAP: "osm" })).variables).toEqual(["MAP_BASEMAP"]);
  });

  it("defaults STORAGE_ROOT to ./storage outside production and requires it in production", () => {
    expect(parseEnv({ ...valid, STORAGE_ROOT: "/srv/vigie" }).STORAGE_ROOT).toBe("/srv/vigie");
    const error = errorOf(() => parseEnv({ ...valid, NODE_ENV: "production" }));
    expect(error.variables).toEqual(["STORAGE_ROOT"]);
    expect(parseEnv({ ...valid, NODE_ENV: "production", STORAGE_ROOT: "/srv/vigie" }).STORAGE_ROOT).toBe("/srv/vigie");
  });

  it("defaults COOKIE_SECURE to true in production only", () => {
    expect(parseEnv({ ...valid, NODE_ENV: "production", STORAGE_ROOT: "/srv" }).COOKIE_SECURE).toBe(true);
    expect(parseEnv({ ...valid, NODE_ENV: "development" }).COOKIE_SECURE).toBe(false);
    expect(parseEnv({ ...valid, NODE_ENV: "production", STORAGE_ROOT: "/srv", COOKIE_SECURE: "false" }).COOKIE_SECURE).toBe(false);
    expect(parseEnv({ ...valid, COOKIE_SECURE: "TRUE" }).COOKIE_SECURE).toBe(true);
  });

  it("parses session durations and TRUST_PROXY", () => {
    const env = parseEnv({ ...valid, SESSION_IDLE_MINUTES: "30", SESSION_ABSOLUTE_HOURS: "8", TRUST_PROXY: "true" });
    expect(env).toMatchObject({ SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 8, TRUST_PROXY: true });
  });

  it.each([
    ["COOKIE_SECURE", "yes"],
    ["TRUST_PROXY", "1"],
    ["SESSION_IDLE_MINUTES", "0"],
    ["SESSION_IDLE_MINUTES", "1.5"],
    ["SESSION_ABSOLUTE_HOURS", "abc"],
  ])("rejects %s=%s, naming the variable", (name, value) => {
    const error = errorOf(() => parseEnv({ ...valid, [name]: value }));
    expect(error.variables).toEqual([name]);
    expect(error.message).toContain(name);
  });

  it("defaults NODE_ENV to development", () => {
    const { NODE_ENV: _omit, ...rest } = valid;
    expect(parseEnv(rest).NODE_ENV).toBe("development");
  });

  it("rejects a missing DATABASE_URL, naming the variable", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    const error = errorOf(() => parseEnv(rest));
    expect(error.variables).toEqual(["DATABASE_URL"]);
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("manquante");
  });

  it("treats an empty DATABASE_URL as missing", () => {
    const error = errorOf(() => parseEnv({ ...valid, DATABASE_URL: "" }));
    expect(error.message).toMatch(/DATABASE_URL : variable manquante/);
  });

  it("rejects a DATABASE_URL without the sqlserver:// prefix", () => {
    const error = errorOf(() =>
      parseEnv({ ...valid, DATABASE_URL: "postgres://localhost:5432/vigie" }),
    );
    expect(error.variables).toEqual(["DATABASE_URL"]);
    expect(error.message).toMatch(/DATABASE_URL.*sqlserver:\/\//);
  });

  it("rejects an invalid APP_URL, naming the variable", () => {
    const error = errorOf(() => parseEnv({ ...valid, APP_URL: "pas une url" }));
    expect(error.variables).toEqual(["APP_URL"]);
    expect(error.message).toContain("APP_URL");
  });

  it("rejects an unknown NODE_ENV", () => {
    const error = errorOf(() => parseEnv({ ...valid, NODE_ENV: "staging" }));
    expect(error.variables).toEqual(["NODE_ENV"]);
  });

  it("reports every invalid variable at once", () => {
    const error = errorOf(() => parseEnv({ NODE_ENV: "test" }));
    expect(error.variables).toEqual(["DATABASE_URL", "APP_URL"]);
  });
});
