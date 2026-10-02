/**
 * Formats exchanged with the offline-bundle tool (tools/offline-bundle/), which
 * runs on a CONNECTED workstation. Pure zod schemas, no network dependency:
 * imported by the tool AND by the application.
 *
 * - `sites.json`: what leaves the internal network — code, name, address and
 *   coordinates only (no lease, financial or personal data).
 * - `enrichment.json`: what comes back — per site and provider, the parsed
 *   data, the proposals for a closed list of fields, and informative public
 *   data for `site_public_data`.
 */
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// sites.json (export)
// ─────────────────────────────────────────────────────────────────────────────

/** Version of the sites export format. */
export const SITES_EXPORT_FORMAT_VERSION = 1;

/** One exported site: ONLY these fields may leave the internal network. */
export const exportedSiteSchema = z
  .object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    addressLine: z.string().max(300).nullable(),
    postalCode: z.string().max(10).nullable(),
    city: z.string().max(150).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .strict();

/** An exported site. */
export type ExportedSite = z.infer<typeof exportedSiteSchema>;

/** The `sites.json` file. */
export const sitesExportSchema = z
  .object({
    formatVersion: z.literal(SITES_EXPORT_FORMAT_VERSION),
    exportedAt: z.string().datetime(),
    sites: z.array(exportedSiteSchema),
  })
  .strict();

/** Content of `sites.json`. */
export type SitesExport = z.infer<typeof sitesExportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// enrichment.json
// ─────────────────────────────────────────────────────────────────────────────

/** Version of the enrichment format; files of another version are refused. */
export const ENRICHMENT_FORMAT_VERSION = 1;

/** Fields a proposal may target (closed list). */
export const ENRICHMENT_TARGETS = [
  "Site.latitude",
  "Site.longitude",
  "Site.communeInseeCode",
  "Site.postalCode",
  "SiteGeometry.footprintGeoJson",
  "SiteGeometry.heightM",
  "SiteIcpe.georisquesUrl",
] as const;

/** A field a proposal may target. */
export type EnrichmentTarget = (typeof ENRICHMENT_TARGETS)[number];

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number());
const ring = z.array(position).min(4);

/** GeoJSON Polygon or MultiPolygon in WGS 84 (lon, lat). */
export const footprintSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);

/** Footprint geometry. */
export type Footprint = z.infer<typeof footprintSchema>;

/** Value schema of each target. */
export const TARGET_VALUE_SCHEMAS: Readonly<Record<EnrichmentTarget, z.ZodType>> = {
  "Site.latitude": z.number().min(-90).max(90),
  "Site.longitude": z.number().min(-180).max(180),
  "Site.communeInseeCode": z.string().regex(/^(\d{5}|2[AB]\d{3})$/, "code INSEE à 5 caractères attendu"),
  "Site.postalCode": z.string().regex(/^\d{5}$/, "code postal à 5 chiffres attendu"),
  "SiteGeometry.footprintGeoJson": footprintSchema,
  "SiteGeometry.heightM": z.number().min(0).max(300),
  "SiteIcpe.georisquesUrl": z.string().url().max(1000),
};

/** A proposal: value for a field, with confidence (0–1) and evidence. */
export const proposalSchema = z
  .object({
    target: z.enum(ENRICHMENT_TARGETS),
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    evidence: z.string().max(1000),
  })
  .superRefine((proposal, ctx) => {
    const result = TARGET_VALUE_SCHEMAS[proposal.target].safeParse(proposal.value);
    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `Valeur invalide pour ${proposal.target} : ${result.error.issues[0]?.message ?? "format inattendu"}`,
      });
    }
  });

/** A proposal. */
export type Proposal = z.infer<typeof proposalSchema>;

/** Outcome of one provider for one site. */
export const PROVIDER_STATUSES = ["ok", "not_found", "error", "skipped"] as const;

/** Result of one provider for one site. */
export const providerResultSchema = z.object({
  status: z.enum(PROVIDER_STATUSES),
  fetchedAt: z.string().datetime().nullable(),
  /** Parsed data (informative, provider-specific). */
  data: z.record(z.string(), z.unknown()).nullable(),
  proposals: z.array(proposalSchema),
  /** Informative data written to `site_public_data` (key → JSON value). */
  publicData: z.record(z.string().min(1).max(80), z.unknown()).default({}),
  /** Error message when `status` is `error` (never blocks the other providers). */
  error: z.string().max(2000).optional(),
});

/** Result of one provider for one site. */
export type ProviderResult = z.infer<typeof providerResultSchema>;

/** The `enrichment.json` file. */
export const enrichmentFileSchema = z.object({
  formatVersion: z.literal(ENRICHMENT_FORMAT_VERSION, {
    error: `Version de format non prise en charge (attendue : ${ENRICHMENT_FORMAT_VERSION}).`,
  }),
  generatedAt: z.string().datetime(),
  /** Tool name and version, e.g. « Vigie-offline-bundle/1.0.0 ». */
  generator: z.string().min(1),
  sites: z.array(
    z.object({
      code: z.string().min(1).max(50),
      providers: z.record(z.string().min(1).max(40), providerResultSchema),
    }),
  ),
});

/** Content of `enrichment.json`. */
export type EnrichmentFile = z.infer<typeof enrichmentFileSchema>;

/**
 * Parses and validates an `enrichment.json` content.
 * @param json - Parsed JSON.
 * @returns The validated file.
 * @throws {Error} With a French message listing the first problems.
 */
export function parseEnrichmentFile(json: unknown): EnrichmentFile {
  const result = enrichmentFileSchema.safeParse(json);
  if (result.success) return result.data;
  const details = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
    .join(" ; ");
  throw new Error(`Fichier d'enrichissement invalide — ${details}`);
}
