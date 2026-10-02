import "server-only";
import { db } from "../db";
import type { EnrichmentSiteState } from "./plan";

/**
 * Database READS of the enrichment application: current state of the sites
 * named in the file. No write here.
 */

const toNumber = (v: { toString(): string } | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v.toString()));

/**
 * Loads the sites of the file (archived ones included, to report them).
 * @param codes - Site codes of `enrichment.json`.
 * @returns States keyed by upper-case code.
 */
export async function loadEnrichmentState(codes: readonly string[]): Promise<Map<string, EnrichmentSiteState>> {
  const states = new Map<string, EnrichmentSiteState>();
  for (let i = 0; i < codes.length; i += 500) {
    const rows = await db.site.findMany({
      where: { code: { in: codes.slice(i, i + 500) } },
      select: {
        id: true,
        code: true,
        archivedAt: true,
        latitude: true,
        longitude: true,
        communeInseeCode: true,
        postalCode: true,
        geometry: { select: { id: true, footprintGeoJson: true, heightM: true } },
        icpe: { select: { id: true, georisquesUrl: true } },
        icpeHeadings: { select: { code: true } },
        technical: { select: { totalWarehouseArea: true, landArea: true } },
        publicData: { select: { id: true, provider: true, key: true, valueJson: true } },
      },
    });
    for (const row of rows) {
      states.set(row.code.toUpperCase(), {
        id: row.id,
        code: row.code,
        archived: row.archivedAt !== null,
        site: {
          latitude: toNumber(row.latitude),
          longitude: toNumber(row.longitude),
          communeInseeCode: row.communeInseeCode,
          postalCode: row.postalCode,
        },
        geometry: row.geometry ? { id: row.geometry.id, footprintGeoJson: row.geometry.footprintGeoJson, heightM: toNumber(row.geometry.heightM) } : null,
        icpe: row.icpe,
        icpeHeadingCodes: row.icpeHeadings.map((h) => h.code),
        technical: row.technical ? { totalWarehouseArea: toNumber(row.technical.totalWarehouseArea), landArea: toNumber(row.technical.landArea) } : null,
        publicData: new Map(row.publicData.map((p) => [`${p.provider}|${p.key}`, { id: p.id, valueJson: p.valueJson }])),
      });
    }
  }
  return states;
}
