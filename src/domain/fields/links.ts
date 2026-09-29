/**
 * External links and free references (spreadsheet columns BAIL, PLANS,
 * DOSSIER ADMINISTRATIF, DOCUMENTS ADMINISTRATIFS ICPE…).
 *
 * Only `http:` and `https:` URLs become links; every other scheme
 * (`javascript:`, `data:`, `file:`, `vbscript:`…) is rendered as plain text.
 * Network (`\\serveur\partage`) and local (`C:\…`, `/mnt/…`) paths are never
 * turned into `file://` links: they are shown as text with a « Copier » button.
 * The server never fetches any of these URLs.
 */

/**
 * The URL if it is a well-formed `http:` / `https:` absolute URL.
 * @param value - Untrusted string.
 * @returns The normalised URL (`URL.href`), or `null`.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Control characters and whitespace inside are never part of a clean URL.
  if (trimmed === "" || /[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.href;
}

/** What a free reference turned out to be. */
export type ReferenceKind = "url" | "networkPath" | "localPath" | "boolean" | "other";

/** A detected reference. */
export type DetectedReference =
  | { kind: "url"; href: string; text: string }
  | { kind: "networkPath" | "localPath"; text: string }
  | { kind: "boolean"; value: boolean; text: string }
  | { kind: "other"; text: string };

/** French label of each kind (shown next to the value). */
export const REFERENCE_KIND_LABELS: Readonly<Record<ReferenceKind, string>> = {
  url: "Lien",
  networkPath: "Chemin réseau",
  localPath: "Chemin local",
  boolean: "Oui/Non",
  other: "Texte",
};

const NETWORK_PATH = /^\\\\[^\\/\s]+[\\/]/;
const LOCAL_PATH = /^(?:[a-z]:[\\/]|\/(?:[^/\s]+\/)*[^/\s]*$)/i;
const YES = /^(?:oui|yes|o|y|x|vrai|true)$/i;
const NO = /^(?:non|no|n|faux|false)$/i;

/**
 * Detects the kind of a free reference.
 * @param value - Stored reference.
 * @returns The detection, or `null` when empty.
 */
export function detectReference(value: string | null | undefined): DetectedReference | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  const href = safeExternalUrl(text);
  if (href) return { kind: "url", href, text };
  if (NETWORK_PATH.test(text)) return { kind: "networkPath", text };
  if (LOCAL_PATH.test(text)) return { kind: "localPath", text };
  if (YES.test(text)) return { kind: "boolean", value: true, text: "Oui" };
  if (NO.test(text)) return { kind: "boolean", value: false, text: "Non" };
  return { kind: "other", text };
}
