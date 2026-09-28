/**
 * Import report: `report.csv` (anomalies), `changes.csv` (planned or applied
 * changes, preserved fields), `summary.json`, and the console summary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AREA_BASIS_LABELS, type AreaBasis } from "./checks";
import type { ChangeLine } from "./plan";
import type { ReferenceKind, Severity } from "./parsers";
import type { ImportIssue } from "./types";

/** Aggregated figures of a run (also stored in `import_batches.stats_json`). */
export interface ImportSummary {
  mode: "simulation" | "import";
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  file: string;
  sheet: string | null;
  sha256: string | null;
  batchId: string | null;
  activityYear: number;
  force: boolean;
  rowsRead: number;
  sitesCreated: number;
  sitesUpdated: number;
  sitesUnchanged: number;
  rowsRejected: number;
  fieldChanges: number;
  preservedFields: number;
  errors: number;
  warnings: number;
  infos: number;
  warningsByKind: Record<string, number>;
  unknownColumns: string[];
  missingColumns: string[];
  missingFromFile: { code: string; name: string }[];
  references: Record<string, Partial<Record<ReferenceKind, number>>>;
  sitesWithSeveralQlikKeys: number;
  perSqmArea: { compared: number; matches: Record<AreaBasis, number>; unexplained: number; likelyBasis: AreaBasis | null; label: string };
  water: { sites: number; medianM3PerSqm: number | null; verdict: string };
  durationMs: number;
}

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = { error: "erreur", warning: "avertissement", info: "info" };

/** UTF-8 byte order mark: makes Excel open the CSV in UTF-8. */
export const UTF8_BOM = "﻿";

/**
 * Escapes one CSV field (`;` separator). Values starting with = + - @ are
 * prefixed with an apostrophe so Excel never evaluates them as formulas
 * (CSV injection), except plain numbers.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]./s.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a `;`-separated CSV document with BOM and CRLF line endings. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return UTF8_BOM + [header, ...rows].map((r) => r.map(csvField).join(";")).join("\r\n") + "\r\n";
}

/** Columns of `report.csv`. */
export const REPORT_HEADER = ["ligne", "code entrepôt", "colonne source", "sévérité", "valeur d'origine", "valeur retenue", "message"] as const;

/** `report.csv` content. */
export function issuesCsv(issues: readonly ImportIssue[]): string {
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || order[a.severity] - order[b.severity]);
  return toCsv(
    REPORT_HEADER,
    sorted.map((i) => [i.row, i.code, i.column, SEVERITY_LABELS[i.severity], i.original, i.retained, i.message]),
  );
}

/** `changes.csv` content. */
export function changesCsv(changes: readonly ChangeLine[]): string {
  return toCsv(
    ["ligne", "code entrepôt", "entité", "champ", "valeur actuelle", "valeur du fichier", "action"],
    changes.map((c) => [c.row, c.code, c.entity, c.field, c.before, c.after, c.action]),
  );
}

/**
 * Writes `report.csv`, `changes.csv` and `summary.json` into `dir`.
 * @returns Paths of the written files.
 */
export async function writeReportFiles(
  dir: string,
  input: { issues: readonly ImportIssue[]; changes: readonly ChangeLine[]; summary: ImportSummary },
): Promise<{ report: string; changes: string; summary: string }> {
  await mkdir(dir, { recursive: true });
  const paths = { report: join(dir, "report.csv"), changes: join(dir, "changes.csv"), summary: join(dir, "summary.json") };
  await writeFile(paths.report, issuesCsv(input.issues), "utf8");
  await writeFile(paths.changes, changesCsv(input.changes), "utf8");
  await writeFile(paths.summary, JSON.stringify(input.summary, null, 2) + "\n", "utf8");
  return paths;
}

/** Most likely area basis of the sheet's per-m² values. */
export function likelyAreaBasis(matches: readonly AreaBasis[][]): ImportSummary["perSqmArea"] {
  const counts: Record<AreaBasis, number> = { reference: 0, total: 0, lease: 0 };
  let unexplained = 0;
  for (const m of matches) {
    if (m.length === 0) unexplained++;
    for (const basis of m) counts[basis]++;
  }
  const ranked = (Object.keys(counts) as AreaBasis[]).sort((a, b) => counts[b] - counts[a]);
  const best = ranked[0]!;
  const likelyBasis = counts[best] > 0 ? best : null;
  const tied = likelyBasis !== null && ranked.filter((b) => counts[b] === counts[best]).length > 1;
  const label =
    matches.length === 0
      ? "aucune valeur au m² comparable"
      : likelyBasis === null
        ? "aucune surface n'explique les valeurs au m² du tableur"
        : tied
          ? `surfaces indiscernables sur ce fichier (${ranked.filter((b) => counts[b] === counts[best]).map((b) => AREA_BASIS_LABELS[b]).join(" = ")})`
          : AREA_BASIS_LABELS[likelyBasis];
  return { compared: matches.length, matches: counts, unexplained, likelyBasis, label };
}

/** Water statistics (median m³/m²). */
export function waterStatistics(ratios: readonly number[]): ImportSummary["water"] {
  if (ratios.length === 0) return { sites: 0, medianM3PerSqm: null, verdict: "pas de données d'eau comparables" };
  const sorted = [...ratios].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const verdict =
    median > 5
      ? "ordre de grandeur de litres plutôt que de m³ : unité à vérifier"
      : median < 0.0005
        ? "valeurs anormalement faibles pour des m³ : unité à vérifier"
        : "cohérent avec des m³";
  return { sites: ratios.length, medianM3PerSqm: Number(median.toFixed(4)), verdict };
}

const n = (value: number) => value.toLocaleString("fr-FR");

/** Console summary (French). */
export function formatConsoleSummary(summary: ImportSummary, reportDir: string): string {
  const lines = [
    "",
    summary.mode === "simulation" ? "══ Simulation d'import (aucune écriture) ══" : "══ Import du tableur ══",
    `Fichier : ${summary.file}${summary.sheet ? ` — feuille « ${summary.sheet} »` : ""}`,
    `Statut : ${{ SUCCEEDED: "réussi", PARTIAL: "partiel (lignes rejetées)", FAILED: "échec" }[summary.status]}`,
    "",
    `Lignes lues ............. ${n(summary.rowsRead)}`,
    `${summary.mode === "simulation" ? "Sites à créer ..........." : "Sites créés ............."} ${n(summary.sitesCreated)}`,
    `${summary.mode === "simulation" ? "Sites à modifier ........" : "Sites mis à jour ........"} ${n(summary.sitesUpdated)}`,
    `Sites inchangés ......... ${n(summary.sitesUnchanged)}`,
    `Lignes rejetées ......... ${n(summary.rowsRejected)}`,
    `Champs ${summary.mode === "simulation" ? "à modifier ......." : "modifiés ........."} ${n(summary.fieldChanges)}`,
    `Champs préservés ........ ${n(summary.preservedFields)}${summary.force ? " (--force : règle de préservation désactivée)" : ""}`,
    `Anomalies ............... ${n(summary.errors)} erreur(s), ${n(summary.warnings)} avertissement(s), ${n(summary.infos)} info(s)`,
  ];
  const kinds = Object.entries(summary.warningsByKind).sort((a, b) => b[1] - a[1]);
  if (kinds.length) {
    lines.push("", "Avertissements par type :");
    for (const [kind, count] of kinds) lines.push(`  ${kind.padEnd(32, " ")} ${n(count)}`);
  }
  if (summary.unknownColumns.length) lines.push("", `Colonnes inconnues (ignorées) : ${summary.unknownColumns.join(", ")}`);
  if (summary.missingColumns.length) lines.push(`Colonnes attendues absentes : ${summary.missingColumns.length}`);
  lines.push("", `Sites en base absents du fichier (non modifiés) : ${summary.missingFromFile.length}`);
  for (const s of summary.missingFromFile.slice(0, 10)) lines.push(`  ${s.code} — ${s.name}`);
  if (summary.missingFromFile.length > 10) lines.push(`  … et ${summary.missingFromFile.length - 10} autre(s) (voir summary.json)`);
  lines.push("", "Colonnes de référence (type de contenu) :");
  for (const [column, kinds2] of Object.entries(summary.references)) {
    lines.push(`  ${column.padEnd(30, " ")} ${Object.entries(kinds2).map(([k, c]) => `${k} ${c}`).join(", ")}`);
  }
  lines.push(
    "",
    `Sites avec plusieurs clés Qlik : ${summary.sitesWithSeveralQlikKeys}`,
    `Surface utilisée par le tableur pour ses valeurs au m² : ${summary.perSqmArea.label} (${summary.perSqmArea.compared} valeur(s) comparée(s), ${summary.perSqmArea.unexplained} inexpliquée(s))`,
    `Eau : ${summary.water.medianM3PerSqm === null ? summary.water.verdict : `médiane ${summary.water.medianM3PerSqm} m³/m² sur ${summary.water.sites} valeur(s) — ${summary.water.verdict}`}`,
    `Durée : ${(summary.durationMs / 1000).toFixed(1)} s`,
    "",
    `Rapport : ${reportDir}`,
    "",
  );
  return lines.join("\n");
}
