/**
 * Bundle manifest and checksums: `manifest.json` lists every file of the
 * bundle with its size and SHA-256, the sources with their licences and
 * attributions, and the build parameters; `SHA256SUMS` (sha256sum format)
 * covers every file, `manifest.json` included.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  BUNDLE_FORMAT_VERSION,
  bundleManifestSchema,
  formatSha256Sums,
  type BundleManifest,
  type BundleSource,
} from "../../src/domain/bundle-manifest";
import { USER_AGENT } from "./config";

/** Names reserved at the bundle root. */
export const MANIFEST_FILE = "manifest.json";
export const SUMS_FILE = "SHA256SUMS";

/** Streaming SHA-256 of a file. */
export function sha256File(path: string): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let size = 0;
    createReadStream(path)
      .on("data", (chunk) => {
        size += chunk.length;
        hash.update(chunk);
      })
      .on("error", reject)
      .on("end", () => resolve({ sha256: hash.digest("hex"), size }));
  });
}

/** Every file under `root`, relative with « / » separators, sorted. */
export async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();
}

/**
 * Writes `manifest.json` then `SHA256SUMS`.
 * @param root - Bundle directory.
 * @param info - Name, sources and parameters.
 * @returns The manifest.
 */
export async function writeManifest(
  root: string,
  info: { name: string; createdAt: Date; sources: readonly BundleSource[]; parameters: Record<string, unknown> },
): Promise<BundleManifest> {
  const paths = (await listFiles(root)).filter((p) => p !== MANIFEST_FILE && p !== SUMS_FILE);
  const files = [];
  for (const path of paths) files.push({ path, ...(await sha256File(join(root, path))) });
  const manifest = bundleManifestSchema.parse({
    formatVersion: BUNDLE_FORMAT_VERSION,
    name: info.name,
    createdAt: info.createdAt.toISOString(),
    generator: USER_AGENT,
    files: files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    totalSize: files.reduce((s, f) => s + f.size, 0),
    sources: info.sources,
    parameters: info.parameters,
  });
  await writeFile(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
  const manifestSum = await sha256File(join(root, MANIFEST_FILE));
  await writeFile(join(root, SUMS_FILE), formatSha256Sums([...manifest.files, { path: MANIFEST_FILE, sha256: manifestSum.sha256 }]));
  return manifest;
}

/** Human-readable size (Mo / Go, binary units). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} Gio`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} Mio`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} Kio`;
  return `${bytes} o`;
}
