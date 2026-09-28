import "server-only";
import { createHash } from "node:crypto";
import { SITES_EXPORT_FORMAT_VERSION, sitesExportSchema, type SitesExport } from "@/domain/enrichment-format";
import { can } from "../auth/permissions";
import { db } from "../db";
import { findActiveUser } from "../import/state";
import { EnrichmentPreconditionError } from "./run";

/**
 * `pnpm enrichment:export-sites`: the ONLY data that leaves the internal
 * network — code, name, address and coordinates of the active sites.
 * No lease, financial or personal data. The export is recorded in the audit log.
 */

/**
 * Builds the export (active sites only, sorted by code) and records it.
 * @param actorEmail - Active admin (permission enrichment:apply).
 * @param fileName - Output file name, recorded in the audit line.
 */
export async function exportSitesForEnrichment(actorEmail: string, fileName: string, now = new Date()): Promise<SitesExport> {
  const actor = await findActiveUser(actorEmail);
  if (!actor || !actor.isActive || !can(actor.role, "enrichment:apply")) {
    throw new EnrichmentPreconditionError(
      `Export refusé : « ${actorEmail} » ne correspond à aucun administrateur actif (permission enrichment:apply requise).`,
    );
  }
  const rows = await db.site.findMany({
    where: { archivedAt: null },
    orderBy: { code: "asc" },
    // Explicit allow-list: nothing else may leave the network.
    select: { code: true, name: true, addressLine: true, postalCode: true, city: true, latitude: true, longitude: true },
  });
  const content = sitesExportSchema.parse({
    formatVersion: SITES_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    sites: rows.map((r) => ({
      ...r,
      latitude: r.latitude === null ? null : Number(r.latitude.toString()),
      longitude: r.longitude === null ? null : Number(r.longitude.toString()),
    })),
  });
  const sha256 = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "ENRICH",
      source: "enrichment",
      entityType: "EnrichmentExport",
      entityId: sha256.slice(0, 50),
      afterValue: JSON.stringify({ file: fileName, sites: content.sites.length, fields: Object.keys(content.sites[0] ?? {}), sha256 }),
    },
  });
  return content;
}
