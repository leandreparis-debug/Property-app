/**
 * Offline guard: fails if an `http://` or `https://` URL appears in `src/` or
 * `public/`. The application runs on a closed network and must never load a
 * resource from outside its own origin.
 *
 * Usage: `pnpm check:offline` (exit code 1 and a file:line list on failure).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Hosts that may appear in URLs (local development only). */
export const ALLOWED_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

/** XML namespace URIs: identifiers, never fetched by the browser. */
export const ALLOWED_URL_PREFIXES: readonly string[] = [
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.w3.org/2000/xmlns/",
  "http://www.w3.org/1998/Math/MathML",
];

/** Text file extensions that are scanned; binaries are skipped. */
export const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".json", ".html",
  ".svg", ".xml", ".md", ".mdx", ".txt", ".webmanifest", ".map", ".yml", ".yaml",
]);

const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>()[\]{}\\]+/gi;

/** An external URL found in a file. */
export interface Violation {
  file: string;
  line: number;
  url: string;
}

/**
 * Whether a URL is allowed (local host or XML namespace).
 * @param url - URL as found in the source.
 */
export function isAllowedUrl(url: string): boolean {
  if (ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Finds external URLs in a text.
 * @param content - File content.
 * @param file - File name used in the report.
 * @returns One violation per disallowed URL, with its 1-based line number.
 */
export function findExternalUrls(content: string, file: string): Violation[] {
  const violations: Violation[] = [];
  content.split(/\r?\n/).forEach((text, index) => {
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:!?]+$/, "");
      if (!isAllowedUrl(url)) violations.push({ file, line: index + 1, url });
    }
  });
  return violations;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Missing directory: nothing to scan.
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SCANNED_EXTENSIONS.has(extname(entry).toLowerCase())) yield path;
  }
}

/**
 * Scans directories recursively.
 * @param dirs - Directories to scan (missing ones are ignored).
 * @param root - Base path for the reported file names.
 * @returns Every violation found.
 */
export function scanDirectories(dirs: readonly string[], root: string = process.cwd()): Violation[] {
  const violations: Violation[] = [];
  for (const dir of dirs) {
    for (const file of walk(resolve(root, dir))) {
      violations.push(...findExternalUrls(readFileSync(file, "utf8"), relative(root, file)));
    }
  }
  return violations;
}

function main(): void {
  const violations = scanDirectories(["src", "public"]);
  if (violations.length === 0) {
    console.log("check:offline — aucune URL externe dans src/ et public/.");
    return;
  }
  console.error(`check:offline — ${violations.length} URL(s) externe(s) interdite(s) :`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.url}`);
  process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) main();
