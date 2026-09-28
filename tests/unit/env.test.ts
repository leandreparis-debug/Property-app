import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL:
    "sqlserver://localhost:1433;database=atlas;user=sa;password=x;trustServerCertificate=true",
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
  it("accepts a valid configuration", () => {
    expect(parseEnv(valid)).toEqual(valid);
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
      parseEnv({ ...valid, DATABASE_URL: "postgres://localhost:5432/atlas" }),
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
