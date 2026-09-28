/**
 * Exports the sites for the offline-bundle tool (connected workstation):
 * code, name, address and coordinates ONLY, archived sites excluded.
 *
 *   pnpm enrichment:export-sites --out sites.json --actor <email admin>
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { db } from "../src/server/db";
import { exportSitesForEnrichment } from "../src/server/enrichment/export";
import { parseOptions, runCli } from "./lib/cli";

await runCli(async () => {
  const { out, actor } = parseOptions(["out", "actor"] as const);
  if (!out || !actor) throw new Error("usage : pnpm enrichment:export-sites --out sites.json --actor <email admin>");
  const content = await exportSitesForEnrichment(actor, basename(out));
  await writeFile(out, JSON.stringify(content, null, 2) + "\n", "utf8");
  console.log(`${content.sites.length} site(s) exporté(s) dans ${out} (code, nom, adresse, coordonnées uniquement).`);
  console.log("Copier ce fichier sur le poste connecté puis lancer : pnpm bundle:build --sites sites.json --out <dossier>");
}, () => db.$disconnect());
