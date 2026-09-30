import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { ADMIN, E2E_PASSWORD, EDITOR, VIEWER } from "./fixtures";
import { E2E_STORAGE_ROOT, e2eEnv } from "./e2e-env";

const env = { ...process.env, ...e2eEnv() } as NodeJS.ProcessEnv;

/** Runs a pnpm script on the e2e database, feeding the password twice when asked. */
function run(script: string, args: string[], withPassword = false, okCodes: readonly number[] = [0]): { ok: boolean; output: string } {
  try {
    const output = execFileSync("pnpm", ["-s", script, ...args], {
      input: withPassword ? `${E2E_PASSWORD}\n${E2E_PASSWORD}\n` : "",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { ok: okCodes.includes(e.status ?? -1), output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function must(script: string, args: string[], withPassword = false, okCodes: readonly number[] = [0]): void {
  const result = run(script, args, withPassword, okCodes);
  if (!result.ok) throw new Error(`${script} a échoué : ${result.output}`);
}

/**
 * Prepares the suite's OWN database `vigie_e2e` and storage root:
 * 1. empties `.e2e-storage/`;
 * 2. resets `vigie_e2e` (every migration replayed — the development database
 *    `vigie` is never touched);
 * 3. loads the demo seed, creates the admin, editor and viewer accounts, then
 *    imports the fictitious sample spreadsheet as the admin.
 */
export default function globalSetup(): void {
  rmSync(E2E_STORAGE_ROOT, { recursive: true, force: true });
  mkdirSync(E2E_STORAGE_ROOT, { recursive: true });
  execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], { stdio: "pipe", env });
  must("db:seed", []);
  for (const user of [ADMIN, VIEWER, EDITOR]) must("user:create", ["--email", user.email, "--name", user.name, "--role", user.role], true);
  // The sample deliberately contains rejected rows: exit code 2 (« partiel ») is expected.
  must("import:spreadsheet", ["--file", "samples/vigie-sample.xlsx", "--actor", ADMIN.email], false, [0, 2]);
}
