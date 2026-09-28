/**
 * Sets a new password (asked twice, hidden), unlocks the account and closes
 * all its sessions.
 *
 * Usage: pnpm user:reset-password --email user@vigie.local
 */
import "dotenv/config";
import { runWithAuditContext } from "../src/server/audit/context";
import { resetPassword } from "../src/server/auth/users";
import { db } from "../src/server/db";
import { parseOptions, promptNewPassword, runCli } from "./lib/cli";

await runCli(async () => {
  const { email } = parseOptions(["email"] as const);
  if (!email) throw new Error("usage : pnpm user:reset-password --email <email>");
  const password = await promptNewPassword();
  const closed = await runWithAuditContext({ actorId: null, source: "system" }, () => resetPassword(email, password));
  console.log(`Mot de passe modifié pour ${email.trim().toLowerCase()} ; ${closed} session(s) fermée(s).`);
}, () => db.$disconnect());
