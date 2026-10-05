/**
 * Text folding for search and filtering: lower case, no accents, hyphens,
 * apostrophes and underscores as spaces, collapsed spaces.
 * « Île-de-France » → « ile de france ».
 */
export function foldText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-‐‑–—_'’.,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
