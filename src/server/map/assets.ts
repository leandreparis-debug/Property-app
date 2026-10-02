import "server-only";
import { readFile, stat } from "node:fs/promises";
import { sep } from "node:path";
import { bundleManifestSchema, type BundleManifest } from "@/domain/bundle-manifest";
import { resolveStoragePath, StoragePathError } from "../storage";

/**
 * Installed map assets: `STORAGE_ROOT/map/` (written by `pnpm map:install`),
 * served by /api/map-assets. No network: everything is local.
 */

/** Directory of the installed map, relative to STORAGE_ROOT. */
export const MAP_DIR = "map";
/** Previous installed version (rollback). */
export const MAP_PREVIOUS_DIR = "map.previous";
/** Manifest of the installed bundle. */
export const INSTALLED_MANIFEST = "manifest.json";

/** Installed manifest: the bundle manifest plus the installation instant. */
export type InstalledManifest = BundleManifest & { installedAt: string };

/**
 * Reads the installed manifest.
 * @returns The manifest, or null when no map is installed (or it is unreadable).
 */
export async function readInstalledManifest(): Promise<InstalledManifest | null> {
  try {
    const json = JSON.parse(await readFile(resolveStoragePath(MAP_DIR, INSTALLED_MANIFEST), "utf8")) as Record<string, unknown>;
    const manifest = bundleManifestSchema.parse(json);
    return { ...manifest, installedAt: typeof json.installedAt === "string" ? json.installedAt : manifest.createdAt };
  } catch {
    return null;
  }
}

/**
 * Public view of the manifest for /api/map-assets/status: name, dates,
 * sizes, sources and attributions — no filesystem path, no parameter.
 */
export function publicManifest(manifest: InstalledManifest) {
  return {
    name: manifest.name,
    createdAt: manifest.createdAt,
    installedAt: manifest.installedAt,
    generator: manifest.generator,
    totalSize: manifest.totalSize,
    files: manifest.files.filter((f) => f.path.startsWith("map/")).map((f) => ({ path: f.path.slice(4), size: f.size })),
    sources: manifest.sources.map((s) => ({ name: s.name, licence: s.licence, attribution: s.attribution })),
  };
}

/** A file ready to be served. */
export interface MapAssetFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Resolves a requested asset under `STORAGE_ROOT/map/`.
 * @param relativePath - Validated relative path (see safeRelativePath).
 * @returns The file, or null when absent (or a directory, or the manifest itself).
 * @throws {StoragePathError} On traversal.
 */
export async function resolveMapAsset(relativePath: string): Promise<MapAssetFile | null> {
  const root = resolveStoragePath(MAP_DIR);
  const path = resolveStoragePath(MAP_DIR, relativePath);
  if (!path.startsWith(root + sep)) throw new StoragePathError("Chemin hors du dossier de la carte.");
  try {
    const info = await stat(path);
    return info.isFile() ? { path, size: info.size, mtimeMs: info.mtimeMs } : null;
  } catch {
    return null;
  }
}
