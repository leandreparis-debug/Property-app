import "server-only";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import ExcelJS from "exceljs";
import { CSV_BOM, csvLine, isDateOnlyCell, neutralizeFormula, type CellValue } from "@/domain/export/csv";
import type { ExportColumn, ExportTable } from "@/domain/export/tables";

/**
 * Writers of the export files: XLSX (exceljs, typed cells) and CSV (format of
 * `src/domain/export/csv.ts`). Same tables, same serializer, for the nightly
 * export and the on-demand exports.
 */

const NUMBER_FORMATS: Partial<Record<ExportColumn["kind"], string>> = {
  number: "#,##0.00",
  integer: "#,##0",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

/** XLSX value of a cell (dates as Excel dates, texts neutralised). */
function xlsxValue(value: CellValue): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isDateOnlyCell(value)) return value.dateOnly;
  if (typeof value === "string") return neutralizeFormula(value);
  return value;
}

/**
 * Builds an XLSX workbook (one sheet per table): bold frozen header, column
 * widths, number and date formats, auto-filter.
 * @param tables - Tables, in sheet order.
 * @returns The file content.
 */
export async function xlsxBuffer(tables: readonly ExportTable[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vigie";
  workbook.created = new Date();
  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.sheet.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = table.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.min(60, Math.max(12, c.header.length + 2)),
      style: NUMBER_FORMATS[c.kind] ? { numFmt: NUMBER_FORMATS[c.kind] } : {},
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of table.rows) sheet.addRow(row.map(xlsxValue));
    if (table.columns.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * CSV content of a table; the header is the TECHNICAL key of each column.
 */
export function tableCsv(table: ExportTable): string {
  return CSV_BOM + csvLine(table.columns.map((c) => c.key)) + table.rows.map((r) => csvLine(r)).join("");
}

/** A written file: rows (header excluded), size and SHA-256. */
export interface WrittenFile {
  name: string;
  rows: number;
  bytes: number;
  sha256: string;
}

/** SHA-256 and size of a file on disk. */
export async function fileDigest(path: string): Promise<{ bytes: number; sha256: string }> {
  const content = await readFile(path);
  return { bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") };
}

/**
 * Writes CSV lines to a file as they are produced (stream, back-pressure
 * respected): used for the audit journal, read page by page.
 * @param path - Target file.
 * @param header - Column names.
 * @param pages - Async source of row pages.
 * @returns Number of rows written.
 */
export async function writeCsvStream(path: string, header: readonly string[], pages: AsyncIterable<readonly (readonly CellValue[])[]>): Promise<number> {
  const out = createWriteStream(path, { encoding: "utf8", flags: "wx" });
  let rows = 0;
  const write = async (chunk: string) => {
    if (!out.write(chunk)) await once(out, "drain");
  };
  try {
    await write(CSV_BOM + csvLine(header));
    for await (const page of pages) {
      await write(page.map((r) => csvLine(r)).join(""));
      rows += page.length;
    }
  } finally {
    out.end();
    await once(out, "close");
  }
  return rows;
}
