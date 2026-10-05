/**
 * Test accounts and sample data of a test environment (GitHub Codespaces).
 * REPLAYABLE: an existing account is left untouched (its password is not
 * reset); the sample spreadsheet is imported only if no real import has
 * succeeded yet. Synthetic data only (samples/vigie-sample.xlsx).
 *
 * Usage: pnpm codespace:data
 */
import "dotenv/config";
import { runWithAuditContext } from "../src/server/audit/context";
import { createUser } from "../src/server/auth/users";
import { db } from "../src/server/db";
import { runImport } from "../src/server/import/run";

/** Fictitious test accounts (documented in docs/demarrage-codespaces.md). */
export const TEST_ACCOUNTS = [
  { email: "admin@vigie.local", name: "Admin Recette", role: "admin", password: "Recette-Vigie-2026-A" },
  { email: "editeur@vigie.local", name: "Éditeur Recette", role: "editor", password: "Recette-Vigie-2026-E" },
  { email: "lecteur@vigie.local", name: "Lecteur Recette", role: "viewer", password: "Recette-Vigie-2026-L" },
] as const;

const SAMPLE = "samples/vigie-sample.xlsx";

async function main(): Promise<void> {
  for (const account of TEST_ACCOUNTS) {
    const existing = await db.user.findUnique({ where: { email: account.email }, select: { id: true } });
    if (existing) {
      console.log(`Compte ${account.email} : déjà présent, conservé.`);
      continue;
    }
    await runWithAuditContext({ actorId: null, source: "system", comment: "Compte de test (Codespaces)" }, () => createUser({ ...account }));
    console.log(`Compte ${account.email} : créé.`);
  }

  const imported = await db.importBatch.count({ where: { kind: "SPREADSHEET", status: { in: ["SUCCEEDED", "PARTIAL"] } } });
  if (imported > 0) {
    console.log("Jeu d'exemple : déjà importé, rien à faire.");
    return;
  }
  console.log(`Import du jeu d'exemple (${SAMPLE})…`);
  const result = await runImport({ filePath: SAMPLE, actorEmail: TEST_ACCOUNTS[0].email });
  console.log(`Import : ${result.summary.status} — ${result.summary.sitesCreated} sites créés, ${result.summary.rowsRejected} lignes rejetées (volontairement erronées dans le fichier d'exemple).`);
  if (result.summary.status === "FAILED") throw new Error("L'import du jeu d'exemple a échoué : voir le rapport " + result.reportDir);
}

let code = 0;
try {
  await main();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  code = 1;
} finally {
  await db.$disconnect();
}
process.exitCode = code;
