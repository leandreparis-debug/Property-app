import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { bundleManifestSchema, parseSha256Sums, type BundleManifest } from "@/domain/bundle-manifest";
import { can } from "../auth/permissions";
import { db } from "../db";
import { findActiveUser } from "../import/state";
import { resolveStoragePath } from "../storage";
import { INSTALLED_MANIFEST, MAP_DIR, MAP_PREVIOUS_DIR, type InstalledManifest } from "./assets";

/**
 * `pnpm map:install`: installs the `map/` folder of an offline bundle into
 * `STORAGE_ROOT/map/`.
 *
 * 1. Checks the manifest format and EVERY checksum of SHA256SUMS (the
 *    manifest itself included) and that each manifest file matches.
 * 2. Copies `map/` into a temporary folder next to the target, writes the
 *    installed manifest there.
 * 3. Swaps atomically: current `map/` → `map.previous/` (the older previous
 *    version is removed), temporary folder → `map/`.
 */

/** Raised when the bundle is refused (nothing is modified). */
export class MapBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapBundleError";
  }
}

const exists = (p: string) => access(p).then(() => true, () => false);

function sha256File(path: string): Promise<string> {
  return new Promise((ok, ko) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (c) => hash.update(c)).on("error", ko).on("end", () => ok(hash.digest("hex")));
  });
}

/** Resolves a manifest path inside the bundle (defence in depth against traversal). */
function inside(bundleDir: string, relativePath: string): string {
  const root = resolve(bundleDir);
  const target = resolve(root, ...relativePath.split("/"));
  if (!target.startsWith(root + sep)) throw new MapBundleError(`Chemin refusé dans le paquet : ${relativePath}`);
  return target;
}

/**
 * Verifies a bundle folder.
 * @returns The validated manifest.
 * @throws {MapBundleError} Invalid format, missing file, checksum mismatch.
 */
export async function verifyBundle(bundleDir: string): Promise<BundleManifest> {
  let manifestJson: unknown;
  let sumsText: string;
  try {
    manifestJson = JSON.parse(await readFile(join(bundleDir, "manifest.json"), "utf8"));
    sumsText = await readFile(join(bundleDir, "SHA256SUMS"), "utf8");
  } catch {
    throw new MapBundleError(`${bundleDir} n'est pas un paquet hors ligne (manifest.json et SHA256SUMS attendus).`);
  }
  const parsed = bundleManifestSchema.safeParse(manifestJson);
  if (!parsed.success) throw new MapBundleError(`Manifeste invalide : ${parsed.error.issues[0]?.message ?? "format inattendu"}`);
  const manifest = parsed.data;

  let sums: Map<string, string>;
  try {
    sums = parseSha256Sums(sumsText);
  } catch (error) {
    throw new MapBundleError((error as Error).message);
  }
  if (!sums.has("manifest.json")) throw new MapBundleError("SHA256SUMS ne couvre pas manifest.json.");
  for (const file of manifest.files) {
    if (sums.get(file.path) !== file.sha256) throw new MapBundleError(`SHA256SUMS et manifeste en désaccord pour ${file.path}.`);
  }
  for (const [path, expected] of sums) {
    const target = inside(bundleDir, path);
    if (!(await exists(target))) throw new MapBundleError(`Fichier manquant : ${path}`);
    const actual = await sha256File(target);
    if (actual !== expected) throw new MapBundleError(`Somme de contrôle invalide pour ${path} : le paquet est altéré ou incomplet.`);
  }
  if (!manifest.files.some((f) => f.path.startsWith("map/"))) throw new MapBundleError("Le paquet ne contient aucun fichier cartographique (map/).");
  return manifest;
}

/** Result of an installation. */
export interface MapInstallResult {
  manifest: InstalledManifest;
  target: string;
  previousKept: boolean;
}

async function requireAdmin(actorEmail: string) {
  const actor = await findActiveUser(actorEmail);
  if (!actor || !actor.isActive || !can(actor.role, "settings:manage")) {
    throw new MapBundleError(`Installation refusée : « ${actorEmail} » ne correspond à aucun administrateur actif.`);
  }
  return actor;
}

/**
 * Installs the map of a verified bundle.
 * @param bundleDir - `vigie-offline-bundle-AAAAMMJJ/`.
 * @param actorEmail - Active admin.
 */
export async function installMapBundle(bundleDir: string, actorEmail: string, now = new Date()): Promise<MapInstallResult> {
  const actor = await requireAdmin(actorEmail);
  const manifest = await verifyBundle(bundleDir);

  const target = resolveStoragePath(MAP_DIR);
  const previous = resolveStoragePath(MAP_PREVIOUS_DIR);
  const staging = resolveStoragePath(`${MAP_DIR}.installing-${now.getTime()}`);
  await mkdir(resolveStoragePath(), { recursive: true });
  await rm(staging, { recursive: true, force: true });
  try {
    await cp(join(bundleDir, "map"), staging, { recursive: true, errorOnExist: false });
    const installed: InstalledManifest = { ...manifest, installedAt: now.toISOString() };
    await writeFile(join(staging, INSTALLED_MANIFEST), JSON.stringify(installed, null, 2) + "\n");

    const hadCurrent = await exists(target);
    if (hadCurrent) {
      await rm(previous, { recursive: true, force: true });
      await rename(target, previous);
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (hadCurrent) await rename(previous, target); // restore
      throw error;
    }
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        action: "IMPORT",
        source: "system",
        entityType: "MapBundle",
        entityId: manifest.name.slice(0, 50),
        afterValue: JSON.stringify({ name: manifest.name, createdAt: manifest.createdAt, totalSize: manifest.totalSize, files: manifest.files.length }),
      },
    });
    return { manifest: installed, target, previousKept: hadCurrent };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Rolls back to `map.previous/` (the current version becomes the previous one).
 * @throws {MapBundleError} When there is no previous version.
 */
export async function rollbackMap(actorEmail: string, now = new Date()): Promise<InstalledManifest | null> {
  const actor = await requireAdmin(actorEmail);
  const target = resolveStoragePath(MAP_DIR);
  const previous = resolveStoragePath(MAP_PREVIOUS_DIR);
  if (!(await exists(previous))) throw new MapBundleError("Aucune version précédente (map.previous/) à restaurer.");
  const swap = resolveStoragePath(`${MAP_DIR}.swap-${now.getTime()}`);
  const hadCurrent = await exists(target);
  if (hadCurrent) await rename(target, swap);
  await rename(previous, target);
  if (hadCurrent) await rename(swap, previous);
  const manifest = await readFile(join(target, INSTALLED_MANIFEST), "utf8").then((t) => JSON.parse(t) as InstalledManifest, () => null);
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "IMPORT",
      source: "system",
      entityType: "MapBundle",
      entityId: (manifest?.name ?? "rollback").slice(0, 50),
      afterValue: JSON.stringify({ rollback: true, name: manifest?.name ?? null }),
    },
  });
  return manifest;
}
