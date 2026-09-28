/**
 * Fonts (glyph PBF) and sprites of the Protomaps « dark » theme, downloaded
 * from protomaps/basemaps-assets and served locally by Vigie.
 *
 * Layout written under `map/`:
 *   fonts/<stack>/<start>-<end>.pbf
 *   sprites/v4/dark.json, dark.png, dark@2x.json, dark@2x.png
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ENDPOINTS, FONT_RANGES, FONT_STACKS, SPRITE_FILES, SPRITE_VERSION } from "../config";
import type { HttpClient } from "../http";

/** A file to download: remote URL → path relative to `map/`. */
export interface AssetFile {
  url: string;
  path: string;
}

/** List of the font and sprite files. */
export function assetFiles(): AssetFile[] {
  const files: AssetFile[] = [];
  for (const stack of FONT_STACKS) {
    for (const start of FONT_RANGES) {
      const range = `${start}-${start + 255}.pbf`;
      files.push({ url: `${ENDPOINTS.protomapsAssets}/fonts/${encodeURIComponent(stack)}/${range}`, path: `fonts/${stack}/${range}` });
    }
  }
  for (const file of SPRITE_FILES) {
    files.push({ url: `${ENDPOINTS.protomapsAssets}/sprites/${SPRITE_VERSION}/${file}`, path: `sprites/${SPRITE_VERSION}/${file}` });
  }
  return files;
}

/**
 * Downloads the assets into `mapDir`.
 * @returns Number of files and bytes written.
 * @throws {Error} When a file is missing (404).
 */
export async function downloadAssets(http: HttpClient, mapDir: string): Promise<{ files: number; bytes: number }> {
  let bytes = 0;
  const files = assetFiles();
  for (const file of files) {
    const response = await http.request("assets", file.url);
    if (response.status === 404) throw new Error(`Ressource cartographique introuvable : ${file.url}`);
    const target = join(mapDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, response.body);
    bytes += response.body.length;
  }
  return { files: files.length, bytes };
}

/** 1×1 transparent PNG. */
const EMPTY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/**
 * FIXTURES MODE: writes placeholder assets (empty sprite sheet, empty glyph
 * range) so the bundle has the same layout without any network access.
 */
export async function writePlaceholderAssets(mapDir: string): Promise<void> {
  const sprites = join(mapDir, "sprites", SPRITE_VERSION);
  await mkdir(sprites, { recursive: true });
  await writeFile(join(sprites, "dark.json"), "{}\n");
  await writeFile(join(sprites, "dark.png"), EMPTY_PNG);
  const font = join(mapDir, "fonts", FONT_STACKS[0]);
  await mkdir(font, { recursive: true });
  await writeFile(join(font, "0-255.pbf"), Buffer.alloc(0));
  await writeFile(
    join(mapDir, "LISEZMOI.txt"),
    "Paquet de démonstration (mode --fixtures) : ressources vides, aucun fond de carte ni orthophotographie.\n",
  );
}
