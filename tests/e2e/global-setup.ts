import { execFileSync } from "node:child_process";
import { ADMIN, E2E_PASSWORD, VIEWER } from "./fixtures";

/** Runs a `pnpm user:*` script, feeding the password twice on stdin. */
function run(script: string, args: string[], withPassword: boolean): { ok: boolean; output: string } {
  try {
    const output = execFileSync("pnpm", ["-s", script, ...args], {
      input: withPassword ? `${E2E_PASSWORD}\n${E2E_PASSWORD}\n` : "",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/**
 * Creates (or resets) the e2e admin and viewer accounts with the CLI scripts,
 * on the database of `.env` — the one the tested server uses.
 */
export default function globalSetup(): void {
  for (const user of [ADMIN, VIEWER]) {
    const created = run("user:create", ["--email", user.email, "--name", user.name, "--role", user.role], true);
    if (created.ok) continue;
    if (!/existe déjà/.test(created.output)) throw new Error(`user:create a échoué : ${created.output}`);
    for (const [script, args, pwd] of [
      ["user:reset-password", ["--email", user.email], true],
      ["user:set-active", ["--email", user.email, "--active=true"], false],
    ] as const) {
      const result = run(script, [...args], pwd);
      if (!result.ok) throw new Error(`${script} a échoué : ${result.output}`);
    }
  }
}
