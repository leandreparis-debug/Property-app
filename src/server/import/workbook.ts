/**
 * Reading of the `.xlsx` file with exceljs: file checks (extension, size, ZIP
 * signature), formula RESULTS only (never formulas), text AND target of
 * hyperlinks.
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import ExcelJS from "exceljs";
import type { CellValue } from "./parsers";
import type { ImportIssue, RawCell, RawRow } from "./types";

/** Maximum accepted file size: 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Raised when the file cannot be imported at all (French message). */
export class SpreadsheetFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetFileError";
  }
}

/** Content of the sheet, ready for header detection and normalisation. */
export interface SpreadsheetContent {
  fileName: string;
  sha256: string;
  sheetName: string;
  /** Every non-empty row, as sparse cell maps. */
  rows: RawRow[];
  /** Reading anomalies (Excel errors, formulas without cached value). */
  issues: ImportIssue[];
}

/** ZIP local file header signature (« PK\x03\x04 »): every .xlsx starts with it. */
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Checks the file before reading it: `.xlsx` extension, size ≤ 20 MB, ZIP
 * signature.
 * @param filePath - Path of the file.
 * @returns The file content.
 * @throws {SpreadsheetFileError} With a clear French message.
 */
export async function readValidatedFile(filePath: string): Promise<Buffer> {
  if (extname(filePath).toLowerCase() !== ".xlsx") {
    throw new SpreadsheetFileError(`Format refusé : seul le format .xlsx est accepté (« ${basename(filePath)} »).`);
  }
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    throw new SpreadsheetFileError(`Fichier introuvable : « ${filePath} ».`);
  }
  if (size > MAX_FILE_BYTES) {
    throw new SpreadsheetFileError(`Fichier trop volumineux : ${(size / 1024 / 1024).toFixed(1)} Mo (20 Mo maximum).`);
  }
  const buffer = await readFile(filePath);
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new SpreadsheetFileError("Le fichier n'est pas un classeur .xlsx valide (signature ZIP absente).");
  }
  return buffer;
}

type ExcelValue = ExcelJS.CellValue;

function richTextToString(value: { richText: { text: string }[] }): string {
  return value.richText.map((part) => part.text).join("");
}

/**
 * Converts an exceljs cell value to a {@link RawCell}: formula → cached
 * result, rich text → plain text, hyperlink → text + target, Excel error → null.
 * @returns The cell and, if any, a reading anomaly message.
 */
export function toRawCell(value: ExcelValue): { cell: RawCell; problem?: string } {
  if (value === null || value === undefined) return { cell: { value: null, hyperlink: null } };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) {
    return { cell: { value, hyperlink: null } };
  }
  const v = value as unknown as Record<string, unknown>;
  if ("formula" in v || "sharedFormula" in v) {
    const result = v.result as ExcelValue | undefined;
    if (result === undefined) return { cell: { value: null, hyperlink: null }, problem: "Formule sans valeur calculée enregistrée : cellule ignorée." };
    if (result !== null && typeof result === "object" && "error" in (result as object)) {
      return { cell: { value: null, hyperlink: null }, problem: `Erreur Excel ${(result as { error: string }).error} : cellule ignorée.` };
    }
    return toRawCell(result);
  }
  if ("error" in v) return { cell: { value: null, hyperlink: null }, problem: `Erreur Excel ${String(v.error)} : cellule ignorée.` };
  if ("richText" in v) return { cell: { value: richTextToString(v as { richText: { text: string }[] }), hyperlink: null } };
  if ("hyperlink" in v) {
    const text = v.text as unknown;
    const display =
      typeof text === "string"
        ? text
        : text && typeof text === "object" && "richText" in (text as object)
          ? richTextToString(text as { richText: { text: string }[] })
          : null;
    return { cell: { value: display, hyperlink: typeof v.hyperlink === "string" ? v.hyperlink : null } };
  }
  return { cell: { value: null, hyperlink: null }, problem: "Contenu de cellule non reconnu : cellule ignorée." };
}

/**
 * Reads the sheet of a validated `.xlsx` file.
 * @param filePath - Path of the file.
 * @param sheetName - Sheet to read (default: the first one).
 */
export async function readSpreadsheet(filePath: string, sheetName?: string): Promise<SpreadsheetContent> {
  const buffer = await readValidatedFile(filePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetFileError("Classeur illisible : le fichier .xlsx semble corrompu.");
  }
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) {
    const names = workbook.worksheets.map((w) => `« ${w.name} »`).join(", ");
    throw new SpreadsheetFileError(
      sheetName ? `Feuille « ${sheetName} » introuvable (feuilles disponibles : ${names}).` : "Le classeur ne contient aucune feuille.",
    );
  }

  const rows: RawRow[] = [];
  const issues: ImportIssue[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = new Map<number, RawCell>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const { cell: raw, problem } = toRawCell(cell.value);
      if (problem) {
        issues.push({ row: rowNumber, code: null, column: `colonne ${col}`, severity: "warning", kind: "excel_cell_error", original: null, retained: null, message: problem });
      }
      cells.set(col, raw);
    });
    rows.push({ rowNumber, cells });
  });
  return { fileName: basename(filePath), sha256, sheetName: sheet.name, rows, issues };
}

/** Dense array of the first `count` rows (index 0 = column 1), for header detection. */
export function leadingRows(rows: readonly RawRow[], count: number): CellValue[][] {
  return rows
    .filter((r) => r.rowNumber <= count)
    .reduce<CellValue[][]>((acc, row) => {
      const width = Math.max(0, ...row.cells.keys());
      const values: CellValue[] = Array.from({ length: width }, (_, i) => row.cells.get(i + 1)?.value ?? null);
      acc[row.rowNumber - 1] = values;
      return acc;
    }, Array.from({ length: count }, () => []));
}
