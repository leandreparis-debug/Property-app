/**
 * Activates or deactivates an account. Deactivation closes all its sessions.
 *
 * Usage: pnpm user:set-active --email user@atlas.local --active=false
 */
import "dotenv/config";
import { runWithAuditContext } from "../src/server/audit/context";
import { setUserActive } from "../src/server/auth/users";
import { db } from "../src/server/db";
import { parseOptions, runCli } from "./lib/cli";

await runCli(async () => {
  const { email, active } = parseOptions(["email", "active"] as const);
  if (!email || (active !== "true" && active !== "false")) {
    throw new Error("usage : pnpm user:set-active --email <email> --active=<true|false>");
  }
  const isActive = active === "true";
  const closed = await runWithAuditContext({ actorId: null, source: "system" }, () => setUserActive(email, isActive));
  console.log(
    isActive
      ? `Compte activé : ${email.trim().toLowerCase()}.`
      : `Compte désactivé : ${email.trim().toLowerCase()} ; ${closed} session(s) fermée(s).`,
  );
}, () => db.$disconnect());
