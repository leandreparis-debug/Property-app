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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: requiredString()
    .min(1, "variable manquante")
    .startsWith("sqlserver://", "doit commencer par « sqlserver:// »"),
  APP_URL: requiredString()
    .min(1, "variable manquante")
    .pipe(z.url({ error: "doit être une URL valide (ex. http://localhost:3000)" })),
});

/** Validated, typed server environment. */
export type Env = z.infer<typeof envSchema>;

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
  if (result.success) return result.data;

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
