/**
 * Runs once when the Next.js server starts. Validates the environment so a
 * missing or invalid variable stops the server immediately, with a message
 * naming the variable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv, EnvValidationError } = await import("@/lib/env");
  try {
    getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n[atlas] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
