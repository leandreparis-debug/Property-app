/**
 * Installs the offline map of a bundle into STORAGE_ROOT/map/.
 *
 *   pnpm map:install --bundle <vigie-offline-bundle-AAAAMMJJ> --actor <email admin>
 *   pnpm map:install --rollback --actor <email admin>     (back to map.previous/)
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { db } from "../src/server/db";
import { installMapBundle, rollbackMap } from "../src/server/map/install";
import { runCli } from "./lib/cli";

const mib = (n: number) => `${(n / 1024 ** 2).toFixed(1)} Mio`;

await runCli(async () => {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { bundle: { type: "string" }, actor: { type: "string" }, rollback: { type: "boolean", default: false } },
    strict: true,
  });
  if (!values.actor || (!values.bundle && !values.rollback)) {
    throw new Error("usage : pnpm map:install --bundle <dossier> --actor <email admin>  |  pnpm map:install --rollback --actor <email admin>");
  }
  if (values.rollback) {
    const manifest = await rollbackMap(values.actor);
    console.log(`Version précédente restaurée${manifest ? ` : ${manifest.name} (installée le ${manifest.installedAt})` : ""}.`);
    return;
  }
  console.log("Vérification des sommes de contrôle…");
  const result = await installMapBundle(values.bundle!, values.actor);
  console.log(`Carte installée : ${result.manifest.name} — ${result.manifest.files.filter((f) => f.path.startsWith("map/")).length} fichier(s), paquet de ${mib(result.manifest.totalSize)}.`);
  console.log(result.previousKept ? "Version précédente conservée dans map.previous/ (retour : pnpm map:install --rollback)." : "Première installation.");
}, () => db.$disconnect());
