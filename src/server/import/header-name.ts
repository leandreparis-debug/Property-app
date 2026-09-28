/**
 * Header normalisation, shared by header detection and the column mapping.
 */
import type { CellValue } from "./parsers";

/**
 * Normalises a header: upper case, no accents, line breaks and runs of spaces
 * reduced to one space, no spaces around « / », typographic apostrophes
 * straightened, « M2 » unified with « M² ».
 * @param header - Raw header cell.
 */
export function normalizeHeader(header: CellValue): string {
  if (header === null || header === undefined) return "";
  return String(header)
    .replace(/[’‘`´]/g, "'")
    .replace(/²/g, "__SQ__")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/__SQ__/g, "²")
    .replace(/[\s  ]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\bM2\b/g, "M²")
    .trim();
}
