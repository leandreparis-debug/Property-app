/**
 * Creates an account. The password is asked twice, hidden (never passed as an
 * argument, no default).
 *
 * Usage: pnpm user:create --email admin@vigie.local --name "Admin Démo" --role admin
 */
import "dotenv/config";
import { runWithAuditContext } from "../src/server/audit/context";
import { createUser } from "../src/server/auth/users";
import { db } from "../src/server/db";
import { parseOptions, promptNewPassword, runCli } from "./lib/cli";

await runCli(async () => {
  const { email, name, role } = parseOptions(["email", "name", "role"] as const);
  if (!email || !role) {
    throw new Error('usage : pnpm user:create --email <email> --name "<nom>" --role <admin|editor|viewer>');
  }
  const password = await promptNewPassword();
  await runWithAuditContext({ actorId: null, source: "system" }, () => createUser({ email, name, role, password }));
  console.log(`Compte créé : ${email.trim().toLowerCase()} (${role}).`);
}, () => db.$disconnect());
