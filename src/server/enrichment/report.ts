import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toCsv } from "../import/report";
import type { CheckLine, EnrichmentPlan, ProposalLine, ProposalOutcome } from "./plan";

/**
 * Report of an enrichment application, written to
 * `STORAGE_ROOT/enrichment/{batchId}/` (or `dry-run-<horodatage>/`):
 * divergences.csv, changes.csv, checks.csv, summary.json. CSV: UTF-8 BOM, `;`.
 */

/** Summary of a run (summary.json, ImportBatch.statsJson). */
export interface EnrichmentSummary {
  mode: "simulation" | "application";
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  file: string;
  sha256: string;
  generatedAt: string;
  generator: string;
  batchId: string | null;
  sitesInFile: number;
  sitesWritten: number;
  sitesFailed: { code: string; message: string }[];
  unknownCodes: string[];
  archivedCodes: string[];
  counts: EnrichmentPlan["counts"];
  checks: number;
  durationMs: number;
}

/** French label of an outcome. */
export const OUTCOME_LABELS: Readonly<Record<ProposalOutcome, string>> = {
  applied: "appliqué",
  unchanged: "inchangé",
  divergence: "divergence (non appliqué)",
  preserved: "préservé (modifié dans Vigie)",
  low_confidence: "non appliqué (confiance insuffisante)",
  incomplete_pair: "non appliqué (latitude et longitude vont ensemble)",
};

/** `divergences.csv`: code, champ, valeur actuelle, valeur proposée, source, preuve. */
export function divergencesCsv(lines: readonly ProposalLine[]): string {
  return toCsv(
    ["code", "champ", "valeur actuelle", "valeur proposée", "source", "preuve"],
    lines.filter((l) => l.outcome === "divergence").map((l) => [l.code, l.target, l.current, l.proposed, l.provider, l.evidence]),
  );
}

/** `changes.csv`: every proposal and its outcome. */
export function changesCsv(lines: readonly ProposalLine[]): string {
  return toCsv(
    ["code", "champ", "valeur actuelle", "valeur proposée", "source", "confiance", "résultat", "preuve"],
    lines.map((l) => [l.code, l.target, l.current, l.proposed, l.provider, l.confidence.toFixed(2), OUTCOME_LABELS[l.outcome], l.evidence]),
  );
}

/** `checks.csv`: informative comparisons (areas, ICPE headings). */
export function checksCsv(checks: readonly CheckLine[]): string {
  return toCsv(["code", "contrôle", "valeur Vigie", "valeur publique", "message", "source"], checks.map((c) => [c.code, c.check, c.vigie, c.publicValue, c.message, c.provider]));
}

/** Writes the report files. */
export async function writeEnrichmentReport(dir: string, plan: EnrichmentPlan, summary: EnrichmentSummary): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "divergences.csv"), divergencesCsv(plan.lines), "utf8");
  await writeFile(join(dir, "changes.csv"), changesCsv(plan.lines), "utf8");
  await writeFile(join(dir, "checks.csv"), checksCsv(plan.checks), "utf8");
  await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
}

/** Console summary (French). */
export function formatEnrichmentSummary(summary: EnrichmentSummary, reportDir: string): string {
  const c = summary.counts;
  const lines = [
    "",
    `${summary.mode === "simulation" ? "SIMULATION — aucune écriture" : "Enrichissement appliqué"} — statut : ${summary.status}`,
    `Fichier : ${summary.file} (généré le ${summary.generatedAt} par ${summary.generator})`,
    summary.batchId ? `Lot : ${summary.batchId}` : null,
    `Sites du fichier : ${summary.sitesInFile} — sites ${summary.mode === "simulation" ? "à modifier" : "modifiés"} : ${summary.sitesWritten}`,
    `Propositions : ${c.applied} ${summary.mode === "simulation" ? "applicables" : "appliquées"}, ${c.unchanged} inchangées, ${c.divergence} divergences, ${c.preserved} préservées, ${c.low_confidence} confiance insuffisante, ${c.incomplete_pair} paires incomplètes`,
    `Données publiques : ${c.publicDataWritten} ${summary.mode === "simulation" ? "à écrire" : "écrites"}, ${c.publicDataUnchanged} inchangées`,
    c.providerErrors ? `Fournisseurs en échec (lors de la préparation) : ${c.providerErrors}` : null,
    summary.checks ? `Contrôles à examiner (surfaces, rubriques ICPE) : ${summary.checks} — voir checks.csv` : null,
    summary.unknownCodes.length ? `Codes inconnus ignorés : ${summary.unknownCodes.join(", ")}` : null,
    summary.archivedCodes.length ? `Sites archivés ignorés : ${summary.archivedCodes.join(", ")}` : null,
    ...summary.sitesFailed.map((f) => `ÉCHEC ${f.code} : ${f.message}`),
    `Rapport : ${reportDir}`,
    c.divergence ? `→ ${c.divergence} divergence(s) à examiner dans divergences.csv : elles ne sont jamais appliquées automatiquement.` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}
