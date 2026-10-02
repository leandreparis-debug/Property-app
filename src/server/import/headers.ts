/**
 * Header row detection and normalisation. Pure functions.
 */
import type { CellValue, ParseIssue } from "./parsers";
import { normalizeHeader } from "./header-name";
import { resolveColumn, type ColumnSpec } from "./mapping";

export { normalizeHeader } from "./header-name";

/** Number of leading rows searched for the header row. */
export const HEADER_SEARCH_ROWS = 10;

/** A recognised (or unknown) column of the file. */
export interface FileColumn {
  /** 1-based column index in the sheet. */
  index: number;
  /** Header as written in the file. */
  header: string;
  /** Normalised header. */
  normalized: string;
  /** Mapping of the column; `null` when unknown. */
  spec: ColumnSpec | null;
}

/** Result of {@link detectHeaders}. */
export interface HeaderDetection {
  /** 1-based row number of the header row; `null` when not found. */
  headerRow: number | null;
  /** Columns kept (first occurrence of each header). */
  columns: FileColumn[];
  /** File-level anomalies (unknown, missing, duplicated columns). */
  issues: (ParseIssue & { column?: string })[];
  /** True when the ENTREPOT column is missing: the import cannot run. */
  fatal: boolean;
}

/**
 * Finds the header row among the first 10 rows (the one holding both
 * « ENTREPOT » and « NOM ENTREPOT »), then maps each column.
 *
 * - duplicated header: first occurrence kept, warning;
 * - unknown column: warning; expected column absent: warning;
 * - no ENTREPOT column: fatal error.
 *
 * @param rows - First rows of the sheet (arrays of cell values, index 0 = column 1).
 * @param expectedHeaders - Normalised headers expected in a complete file.
 */
export function detectHeaders(rows: readonly (readonly CellValue[])[], expectedHeaders: readonly string[] = []): HeaderDetection {
  const issues: HeaderDetection["issues"] = [];
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  let headerIndex = -1;
  for (let i = 0; i < limit; i++) {
    const normalized = new Set(rows[i]!.map(normalizeHeader));
    if (normalized.has("ENTREPOT") && normalized.has("NOM ENTREPOT")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    issues.push({
      severity: "error",
      kind: "missing_entrepot_column",
      message: `Ligne d'en-têtes introuvable : aucune des ${HEADER_SEARCH_ROWS} premières lignes ne contient à la fois « ENTREPOT » et « NOM ENTREPOT ».`,
    });
    return { headerRow: null, columns: [], issues, fatal: true };
  }

  const columns: FileColumn[] = [];
  const seen = new Set<string>();
  rows[headerIndex]!.forEach((cell, i) => {
    const normalized = normalizeHeader(cell);
    if (normalized === "") return;
    const header = String(cell).replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) {
      issues.push({
        severity: "warning",
        kind: "duplicate_column",
        column: header,
        message: `Colonne « ${header} » présente plusieurs fois : seule la première occurrence (colonne ${columns.find((c) => c.normalized === normalized)?.index}) est lue.`,
      });
      return;
    }
    seen.add(normalized);
    const spec = resolveColumn(normalized);
    if (!spec) {
      issues.push({ severity: "warning", kind: "unknown_column", column: header, message: `Colonne inconnue « ${header} » : ignorée.` });
    }
    columns.push({ index: i + 1, header, normalized, spec });
  });

  for (const expected of expectedHeaders) {
    if (!seen.has(expected)) {
      issues.push({ severity: "warning", kind: "missing_column", column: expected, message: `Colonne attendue absente : « ${expected} ».` });
    }
  }

  const fatal = !seen.has("ENTREPOT");
  return { headerRow: headerIndex + 1, columns, issues, fatal };
}
