/**
 * Archives the sites whose code starts with a prefix, through the audited
 * archiving of the application (`archiveSite`: administrator, mandatory
 * reason, one audit line per site). Nothing is deleted.
 *
 * Usage: pnpm sites:archive --prefix E2E- --actor admin@vigie.local --reason "Sites de test"
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { archiveSite } from "../src/server/sites/edit";
import { UserRole } from "../src/domain/enums";
import { parseOptions, runCli } from "./lib/cli";

await runCli(async () => {
  const { prefix, actor, reason } = parseOptions(["prefix", "actor", "reason"] as const);
  if (!prefix || !actor || !reason) throw new Error('usage : pnpm sites:archive --prefix <préfixe> --actor <email admin> --reason "<motif>"');
  const user = await db.user.findUnique({ where: { email: actor.trim().toLowerCase() }, select: { id: true, email: true, name: true, role: true, isActive: true } });
  if (!user?.isActive || !UserRole.is(user.role)) throw new Error(`Compte actif introuvable : ${actor}.`);
  const sites = await db.site.findMany({ where: { code: { startsWith: prefix }, archivedAt: null }, select: { id: true, code: true } });
  for (const site of sites) {
    const result = await archiveSite({ id: user.id, email: user.email, name: user.name, role: user.role }, { siteId: site.id, reason });
    if (!result.ok) throw new Error(`${site.code} : ${result.message}`);
    console.log(`Archivé : ${site.code}`);
  }
  console.log(`${sites.length} site(s) archivé(s).`);
}, () => db.$disconnect());
