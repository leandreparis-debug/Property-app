import { z } from "zod";

/**
 * Builds a string schema whose error messages are explicit about whether the
 * variable is missing or malformed.
 */
function requiredString() {
  return z.string({
    error: (issue) =>
      issue.input === undefined ? "variable manquante" : "doit être une chaîne de caractères",
  });
}

/** Boolean variable written as `true` / `false` (case-insensitive). */
function booleanString() {
  return z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false"], { error: "doit valoir « true » ou « false »" }))
    .transform((value) => value === "true");
}

/** Positive integer variable with a default and an upper bound. */
function positiveInt(defaultValue: number, max: number) {
  return z.coerce
    .number({ error: "doit être un nombre entier" })
    .int("doit être un nombre entier")
    .min(1, "doit être supérieur ou égal à 1")
    .max(max, `doit être inférieur ou égal à ${max}`)
    .default(defaultValue);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: requiredString()
    .min(1, "variable manquante")
    .startsWith("sqlserver://", "doit commencer par « sqlserver:// »"),
  APP_URL: requiredString()
    .min(1, "variable manquante")
    .pipe(z.url({ error: "doit être une URL valide (ex. http://localhost:3000)" })),
  /** `Secure` cookie + `__Host-` prefix. Default: true in production, false otherwise. */
  COOKIE_SECURE: booleanString().optional(),
  /** Session inactivity timeout, in minutes. */
  SESSION_IDLE_MINUTES: positiveInt(240, 7 * 24 * 60),
  /** Absolute session lifetime, in hours. */
  SESSION_ABSOLUTE_HOURS: positiveInt(12, 30 * 24),
  /** Read the client IP from X-Forwarded-For (only behind a trusted reverse proxy). */
  TRUST_PROXY: booleanString().default(false),
  /** Root folder of the files written by the application (reports, documents). */
  STORAGE_ROOT: z.string().trim().min(1, "ne doit pas être vide").optional(),
  /** Basemap: `ign` (IGN Géoplateforme, online in the browser) or `offline` (see lib/basemap.ts). */
  MAP_BASEMAP: z.enum(["ign", "offline"], { error: "doit valoir « ign » ou « offline »" }).default("ign"),
});

/** Validated, typed server environment. */
export type Env = Omit<z.infer<typeof envSchema>, "COOKIE_SECURE" | "STORAGE_ROOT"> & {
  COOKIE_SECURE: boolean;
  /** Always set: defaults to `./storage` outside production, required in production. */
  STORAGE_ROOT: string;
};

/** Raised when one or more environment variables are missing or invalid. */
export class EnvValidationError extends Error {
  /** Names of the offending variables, in declaration order. */
  readonly variables: string[];

  constructor(variables: string[], details: string[]) {
    super(
      `Configuration invalide — variable(s) d'environnement en erreur : ${variables.join(", ")}\n` +
        details.map((line) => `  • ${line}`).join("\n") +
        "\nVoir .env.example.",
    );
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

/**
 * Validates an environment source (defaults to `process.env`).
 *
 * @param source - Key/value map to validate. Empty strings count as missing.
 * @returns The parsed, typed environment.
 * @throws {EnvValidationError} Naming every missing or invalid variable.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const result = envSchema.safeParse(cleaned);
  if (result.success) {
    const data = result.data;
    if (!data.STORAGE_ROOT && data.NODE_ENV === "production") {
      throw new EnvValidationError(["STORAGE_ROOT"], ["STORAGE_ROOT : variable manquante (obligatoire en production)"]);
    }
    return {
      ...data,
      COOKIE_SECURE: data.COOKIE_SECURE ?? data.NODE_ENV === "production",
      STORAGE_ROOT: data.STORAGE_ROOT ?? "./storage",
    };
  }

  const variables: string[] = [];
  const details: string[] = [];
  for (const issue of result.error.issues) {
    const name = issue.path.map(String).join(".") || "(racine)";
    if (!variables.includes(name)) variables.push(name);
    details.push(`${name} : ${issue.message}`);
  }
  throw new EnvValidationError(variables, details);
}

let cached: Env | undefined;

/**
 * Returns the validated environment, parsing `process.env` once and caching it.
 * Called at server start-up from `src/instrumentation.ts`, so a bad
 * configuration stops the process immediately.
 *
 * @throws {EnvValidationError} If the environment is invalid.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
