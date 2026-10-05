import "server-only";
import type { ExportDocumentRecord, ExportEquipmentRecord, ExportMetricRecord, ExportSiteRecord } from "@/domain/export/tables";
import { db } from "../db";

/**
 * Reading of the exported data (nightly export and on-demand exports): a few
 * queries over the whole portfolio (< 200 sites), plain records for the pure
 * serializer of `src/domain/export/tables.ts`.
 */

/** What to read. */
export interface ExportScope {
  /** Include the archived sites (nightly export). Default: true. */
  includeArchived?: boolean;
  /** Restrict to these sites (on-demand export of a filtered list). */
  siteIds?: readonly string[];
}

/** Everything the serializer needs. */
export interface ExportData {
  sites: ExportSiteRecord[];
  metrics: ExportMetricRecord[];
  equipments: ExportEquipmentRecord[];
  documents: ExportDocumentRecord[];
}

/**
 * Reads the sites (with their 1-1 records), yearly metrics, equipment and
 * document metadata.
 * @param scope - Archived sites, site restriction.
 */
export async function loadExportData(scope: ExportScope = {}): Promise<ExportData> {
  const where = {
    ...(scope.includeArchived === false ? { archivedAt: null } : {}),
    ...(scope.siteIds ? { id: { in: [...scope.siteIds] } } : {}),
  };
  const rows = await db.site.findMany({
    where,
    include: {
      lease: true,
      serviceContract: true,
      technical: true,
      icpe: true,
      energyProfile: true,
      _count: { select: { icpeHeadings: true } },
    },
    orderBy: { code: "asc" },
  });
  const ids = rows.map((r) => r.id);
  const codeOf = new Map(rows.map((r) => [r.id, r.code]));
  const sites: ExportSiteRecord[] = rows.map(({ lease, serviceContract, technical, icpe, energyProfile, _count, ...site }) => ({
    site,
    lease,
    serviceContract,
    technical,
    icpe,
    energyProfile,
    icpeHeadingsCount: _count.icpeHeadings,
  }));
  if (ids.length === 0) return { sites, metrics: [], equipments: [], documents: [] };

  const siteFilter = scope.siteIds || scope.includeArchived === false ? { siteId: { in: ids } } : {};
  const [metricRows, equipmentRows, documentRows] = await Promise.all([
    db.annualMetric.findMany({ where: siteFilter, select: { siteId: true, year: true, metric: true, value: true, source: true, note: true } }),
    db.equipment.findMany({ where: siteFilter }),
    db.document.findMany({ where: siteFilter, include: { uploadedBy: { select: { email: true } } } }),
  ]);
  return {
    sites,
    metrics: metricRows.map((m) => ({ siteCode: codeOf.get(m.siteId) ?? m.siteId, year: m.year, metric: m.metric, value: m.value, source: m.source, note: m.note })),
    equipments: equipmentRows.map((e) => ({
      siteCode: codeOf.get(e.siteId) ?? e.siteId,
      id: e.id,
      type: e.type,
      label: e.label,
      reference: e.reference,
      level: e.level,
      installedAt: e.installedAt,
      latitude: e.latitude,
      longitude: e.longitude,
      planX: e.planX,
      planY: e.planY,
      notes: e.notes,
      archivedAt: e.archivedAt,
    })),
    documents: documentRows.map((d) => ({
      siteCode: codeOf.get(d.siteId) ?? d.siteId,
      id: d.id,
      category: d.category,
      title: d.title,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      storagePath: d.storagePath,
      uploadedBy: d.uploadedBy?.email ?? null,
      createdAt: d.createdAt,
    })),
  };
}
