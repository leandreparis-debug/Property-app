/**
 * Manifest of the offline bundle (`manifest.json`), shared by the bundle tool
 * (writer) and `map:install` (reader). Pure zod schema.
 */
import { z } from "zod";

/** Version of the bundle manifest format. */
export const BUNDLE_FORMAT_VERSION = 1;

/** A data source with its licence and the attribution to display. */
export const sourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  licence: z.string().min(1),
  licenceUrl: z.string().url().optional(),
  attribution: z.string().min(1),
  /** Files or data of the bundle coming from this source. */
  usedFor: z.array(z.string()).default([]),
});

/** A data source. */
export type BundleSource = z.infer<typeof sourceSchema>;

/** A file of the bundle (path relative to the bundle root, « / » separators). */
export const bundleFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\\"), "chemin relatif attendu"),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** The bundle manifest. */
export const bundleManifestSchema = z.object({
  formatVersion: z.literal(BUNDLE_FORMAT_VERSION, {
    error: `Version de paquet non prise en charge (attendue : ${BUNDLE_FORMAT_VERSION}).`,
  }),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  generator: z.string().min(1),
  files: z.array(bundleFileSchema),
  totalSize: z.number().int().nonnegative(),
  sources: z.array(sourceSchema),
  /** Build parameters (zooms, radius, providers, fixtures mode…). */
  parameters: z.record(z.string(), z.unknown()),
});

/** Content of `manifest.json`. */
export type BundleManifest = z.infer<typeof bundleManifestSchema>;

/**
 * Formats the `SHA256SUMS` file (sha256sum-compatible: « hash␣␣path »).
 * @param files - Files of the manifest.
 */
export function formatSha256Sums(files: readonly { path: string; sha256: string }[]): string {
  return [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n";
}

/**
 * Parses a `SHA256SUMS` file.
 * @returns path → sha256.
 * @throws {Error} On a malformed line.
 */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!m) throw new Error(`SHA256SUMS : ligne ${i + 1} illisible.`);
    sums.set(m[2]!, m[1]!);
  }
  return sums;
}
