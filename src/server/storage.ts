import "server-only";
import { mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { getEnv } from "@/lib/env";

/** Raised when a path would escape `STORAGE_ROOT`. */
export class StoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePathError";
  }
}

/**
 * Absolute path of the storage root (`STORAGE_ROOT`, resolved from the
 * working directory when relative).
 */
export function storageRoot(): string {
  return resolve(getEnv().STORAGE_ROOT);
}

/**
 * Resolves a path UNDER the storage root. Absolute segments, `..` and any
 * combination escaping the root are refused (directory traversal).
 *
 * @param segments - Relative path segments (e.g. "imports", batchId).
 * @returns The absolute path.
 * @throws {StoragePathError} If the result is outside the root.
 */
export function resolveStoragePath(...segments: string[]): string {
  const root = storageRoot();
  for (const segment of segments) {
    if (isAbsolute(segment) || segment.includes("\0")) throw new StoragePathError(`Chemin refusé : « ${segment} ».`);
  }
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new StoragePathError(`Chemin hors du dossier de stockage refusé : « ${segments.join("/")} ».`);
  }
  return target;
}

/**
 * Creates (if needed) a directory under the storage root.
 * @param segments - Relative path segments.
 * @returns The absolute path of the directory.
 */
export async function ensureStorageDir(...segments: string[]): Promise<string> {
  const dir = resolveStoragePath(...segments);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Path relative to the storage root (what is stored in the database).
 * @param absolutePath - A path returned by {@link resolveStoragePath}.
 */
export function toStorageRelative(absolutePath: string): string {
  return relative(storageRoot(), absolutePath).split(sep).join("/");
}
