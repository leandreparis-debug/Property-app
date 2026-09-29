import { execFileSync } from "node:child_process";

/** Removes the « E2E-… » sites created by the suite (see lib/cleanup.ts). */
export default function globalTeardown(): void {
  execFileSync("pnpm", ["-s", "tsx", "--conditions=react-server", "tests/e2e/lib/cleanup.ts"], { stdio: "inherit" });
}
