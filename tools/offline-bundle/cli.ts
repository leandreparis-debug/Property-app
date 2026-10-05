/**
 * Command line of the offline-bundle tool (CONNECTED workstation only).
 *
 *   pnpm bundle:probe --sites sites.json [--limit 1] [--providers a,b] [--out probe-output] [--no-map]
 *   pnpm bundle:build --sites sites.json --out <dir> [--providers a,b] [--skip-map] [--skip-ortho]
 *                     [--maxzoom 14] [--ortho-radius 500] [--fixtures] [--work .bundle-work] [--basemap-url <url>]
 */
import { parseArgs } from "node:util";
import { buildBundle, probe } from "./build";

const HELP = `Outil de préparation du paquet hors ligne Vigie (poste connecté uniquement).

  pnpm bundle:probe --sites sites.json [--limit 1] [--providers geocoding,buildings] [--out probe-output] [--no-map]
  pnpm bundle:build --sites sites.json --out <dossier> [--providers …] [--skip-map] [--skip-ortho]
                    [--maxzoom 14] [--ortho-radius 500] [--fixtures] [--work .bundle-work] [--basemap-url <url>]

Fournisseurs : geocoding, buildings, georisques (P1) ; cadastre, urbanisme, companies (P2).`;

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} : entier positif attendu.`);
  return n;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: {
      sites: { type: "string" },
      out: { type: "string" },
      limit: { type: "string" },
      providers: { type: "string" },
      "skip-map": { type: "boolean" },
      "skip-ortho": { type: "boolean" },
      "no-map": { type: "boolean" },
      maxzoom: { type: "string" },
      "ortho-radius": { type: "string" },
      fixtures: { type: "boolean" },
      work: { type: "string" },
      "basemap-url": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  if (!values.sites) throw new Error("--sites <fichier> est obligatoire (produit par « pnpm enrichment:export-sites »).");

  if (command === "probe") {
    await probe({ sitesFile: values.sites, limit: positiveInt(values.limit, "limit") ?? 1, outDir: values.out, providers: values.providers, map: !values["no-map"] });
    return;
  }
  if (command === "build") {
    if (!values.out) throw new Error("--out <dossier> est obligatoire.");
    const maxzoom = positiveInt(values.maxzoom, "maxzoom");
    if (maxzoom !== undefined && maxzoom > 15) throw new Error("--maxzoom : 15 au maximum (données Protomaps).");
    await buildBundle({
      sitesFile: values.sites,
      outDir: values.out,
      providers: values.providers,
      skipMap: values["skip-map"],
      skipOrtho: values["skip-ortho"],
      maxzoom,
      orthoRadius: positiveInt(values["ortho-radius"], "ortho-radius"),
      fixtures: values.fixtures,
      workDir: values.work,
      basemapUrl: values["basemap-url"],
    });
    return;
  }
  throw new Error(`Commande inconnue : ${command} (probe ou build).`);
}

main().catch((error: unknown) => {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
