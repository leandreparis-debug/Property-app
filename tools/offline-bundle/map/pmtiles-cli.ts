/**
 * Wrapper around the `pmtiles` command-line program (go-pmtiles), used to
 * extract France from the Protomaps daily build and to convert the aerial
 * imagery MBTiles into PMTiles.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Installation instructions displayed when `pmtiles` is missing. */
export const PMTILES_INSTALL_HELP = [
  "Le programme « pmtiles » est introuvable dans le PATH.",
  "Installation (poste connecté) :",
  "  • binaire : https://github.com/protomaps/go-pmtiles/releases — décompresser puis placer « pmtiles » dans le PATH ;",
  "  • macOS : brew install pmtiles ;",
  "  • Go : go install github.com/protomaps/go-pmtiles@latest (binaire « go-pmtiles », à renommer « pmtiles »).",
  "Vérifier avec : pmtiles version",
  "Pour préparer un paquet sans carte : ajouter --skip-map --skip-ortho.",
].join("\n");

/**
 * Detects the `pmtiles` program.
 * @param bin - Program name or path.
 * @returns Its version line, or null when missing.
 */
export async function detectPmtiles(bin = "pmtiles"): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["version"], { timeout: 10_000 });
    return (stdout || stderr).trim().split("\n")[0] ?? "pmtiles";
  } catch {
    return null;
  }
}

/**
 * Runs `pmtiles` with inherited output (progress bars stay visible).
 * @throws {Error} On a non-zero exit code.
 */
export function runPmtiles(args: readonly string[], bin = "pmtiles"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pmtiles ${args[0]} a échoué (code ${code}).`))));
  });
}

/** Arguments of the France extract. */
export function extractArgs(sourceUrl: string, output: string, bbox: readonly number[], maxzoom: number): string[] {
  return ["extract", sourceUrl, output, `--bbox=${bbox.join(",")}`, `--maxzoom=${maxzoom}`];
}
