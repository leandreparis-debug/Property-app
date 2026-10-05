/**
 * Rules of the document upload, pure (shared by the upload route, the drop
 * zone and the tests): allowed types, size limit, file-name cleaning and type
 * detection BY SIGNATURE — the extension alone is never trusted.
 */

/** Maximum size of a document: 50 MB. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/** An allowed file type. */
export interface AllowedType {
  ext: string;
  mime: string;
  labelFr: string;
}

/** Allowed types, by extension (lower case). */
export const ALLOWED_TYPES: Readonly<Record<string, AllowedType>> = {
  pdf: { ext: "pdf", mime: "application/pdf", labelFr: "PDF" },
  png: { ext: "png", mime: "image/png", labelFr: "Image PNG" },
  jpg: { ext: "jpg", mime: "image/jpeg", labelFr: "Image JPEG" },
  jpeg: { ext: "jpg", mime: "image/jpeg", labelFr: "Image JPEG" },
  webp: { ext: "webp", mime: "image/webp", labelFr: "Image WebP" },
  docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", labelFr: "Document Word" },
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", labelFr: "Classeur Excel" },
  pptx: { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", labelFr: "Présentation PowerPoint" },
  dwg: { ext: "dwg", mime: "application/acad", labelFr: "Plan DWG" },
  dxf: { ext: "dxf", mime: "image/vnd.dxf", labelFr: "Plan DXF" },
};

/** `accept` attribute of the file input. */
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES).map((e) => `.${e}`).join(",");

/** French messages of the upload. */
export const UPLOAD_MESSAGES = {
  tooLarge: "Fichier trop volumineux (50 Mo maximum).",
  typeNotAllowed: "Type de fichier non autorisé.",
  mismatch: "Le contenu du fichier ne correspond pas à son extension.",
  empty: "Fichier vide.",
} as const;

/** Extension of a file name (lower case, without dot). */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Latin-1 view of the bytes (enough to find the ASCII names of a ZIP). */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

/** Office Open XML package (ZIP) of the expected kind. */
function isOoxml(bytes: Uint8Array, part: string): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  const text = latin1(bytes);
  return text.includes("[Content_Types].xml") && text.includes(part);
}

/** ASCII DXF: text (no NUL byte in the first 4 kB) starting with a `0 / SECTION` group. */
function isTextDxf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  if (head.includes(0)) return false;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head).replace(/^﻿/, "");
  return /^\s*(?:999\s*\r?\n[^\n]*\r?\n\s*)?0\s*\r?\nSECTION\b/.test(text);
}

/** Checks of the content for each canonical extension. */
const SIGNATURES: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  pdf: (b) => startsWith(b, ascii("%PDF-")),
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  webp: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
  docx: (b) => isOoxml(b, "word/"),
  xlsx: (b) => isOoxml(b, "xl/"),
  pptx: (b) => isOoxml(b, "ppt/"),
  // AutoCAD version string: AC1.2 … AC2.10, AC1001 … AC1032.
  dwg: (b) => /^AC(?:1\d{3}|[12]\.\d)/.test(String.fromCharCode(...b.subarray(0, 6))),
  dxf: isTextDxf,
};

/** Result of {@link detectDocumentType}. */
export type DetectionResult = { ok: true; type: AllowedType } | { ok: false; error: string };

/**
 * Type of an uploaded file: the extension must be allowed AND the content must
 * match it (magic bytes; ZIP parts for DOCX / XLSX / PPTX; text for DXF).
 * @param fileName - Name given by the browser.
 * @param bytes - Content.
 */
export function detectDocumentType(fileName: string, bytes: Uint8Array): DetectionResult {
  const type = ALLOWED_TYPES[extensionOf(fileName)];
  if (!type) return { ok: false, error: UPLOAD_MESSAGES.typeNotAllowed };
  if (bytes.length === 0) return { ok: false, error: UPLOAD_MESSAGES.empty };
  if (!SIGNATURES[type.ext]!(bytes)) return { ok: false, error: `${UPLOAD_MESSAGES.mismatch} (.${extensionOf(fileName)})` };
  return { ok: true, type };
}

/** Maximum length of a cleaned file name (title). */
export const MAX_FILE_NAME = 150;

/**
 * Cleans a file name to use it as the default title: no path, no control
 * character; only letters (accented included), digits, spaces and
 * `- _ . , ( ) ' &`; runs of spaces reduced; at most 150 characters (the
 * extension is kept).
 * @param name - Name given by the browser.
 */
export function cleanFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFC");
  const cleaned = base
    .replace(/[^\p{L}\p{N} \-_.,()'&]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s]+$/g, "");
  if (cleaned === "") return "document";
  if ([...cleaned].length <= MAX_FILE_NAME) return cleaned;
  const ext = extensionOf(cleaned);
  const keep = MAX_FILE_NAME - (ext ? ext.length + 1 : 0);
  return `${[...cleaned].slice(0, keep).join("").trimEnd()}${ext ? `.${ext}` : ""}`;
}
